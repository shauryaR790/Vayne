"""7-stage investigation orchestrator."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Callable

from vayne.analyst.engine import generate_brief
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.exploitability.scorer import score_exploitability
from vayne.false_positive.classifier import build_stats
from vayne.intelligence import build_finding_intelligence
from vayne.models import Classification, InvestigatedFinding, InvestigationReport
from vayne.parsers.loader import load_scan_files
from vayne.remediation.engine import generate_timeline
from vayne.production.exporter import enrich_report, export_production_artifacts
from vayne.reporting.generator import export_report
from vayne.validator.engine import format_analyst_status, validate_finding

StageCallback = Callable[[int, str, str], None]
ThinkingCallback = Callable[[str], None]

STAGES = [
    "Loading scans",
    "Parsing findings",
    "Correlating assets",
    "Removing false positives",
    "Building attack graph",
    "Calculating exploitability",
    "Generating analyst report",
]


class Orchestrator:
    def __init__(
        self,
        name: str,
        paths: list[Path],
        on_stage: StageCallback | None = None,
        on_thinking: ThinkingCallback | None = None,
        proof: bool = False,
    ):
        self.name = name
        self.paths = paths
        self.on_stage = on_stage or (lambda *_: None)
        self.on_thinking = on_thinking or (lambda _: None)
        self.proof = proof
        self.thinking_log: list[str] = []
        self.proof_log: list[str] = []
        self._start = 0.0

    def _think(self, msg: str) -> None:
        line = f"[VAYNE] {msg}"
        self.thinking_log.append(line)
        self.on_thinking(line)

    def run(self, export_dir: Path | None = None) -> InvestigationReport:
        self._start = time.perf_counter()

        self.on_stage(1, STAGES[0], "Reading scanner outputs")
        self._think("Initializing investigation workspace...")
        raw_findings, raw_assets = load_scan_files(self.paths)
        self._think(f"Loaded {len(raw_findings)} raw findings from {len(self.paths)} path(s).")

        self.on_stage(2, STAGES[1], f"Normalized {len(raw_findings)} findings")
        self._think("Parsing and normalizing to common schema...")

        self.on_stage(3, STAGES[2], "Merging duplicate signals")
        correlated = correlate_findings(raw_findings)
        assets = correlate_assets(raw_assets)
        self._think(f"Correlated into {len(correlated)} unique investigation targets.")

        self.on_stage(4, STAGES[3], "Validating each finding")
        investigated: list[InvestigatedFinding] = []
        validations: list = []
        validation_map: dict = {}

        for item in correlated:
            self._think(f"Validating {item.title} on {item.host}...")
            validation = validate_finding(item, assets)
            validations.append(validation)
            validation_map[item.id] = validation

            if validation.classification == Classification.FALSE_POSITIVE:
                self._think(
                    f"{item.title} — discarded as false positive "
                    f"(confidence {validation.confidence}%)."
                )
            elif validation.classification == Classification.OBSERVED:
                self._think(
                    f"{item.title} — OBSERVED (confirmed in scan, "
                    f"exploitability not assessed, confidence {validation.confidence}%)."
                )
            elif validation.classification == Classification.UNCONFIRMED_EXPLOITABILITY:
                self._think(
                    f"{item.title} — UNCONFIRMED EXPLOITABILITY "
                    f"(observation confirmed, exploit path not verified, "
                    f"confidence {validation.confidence}%)."
                )
            else:
                self._think(
                    f"{item.title} — {format_analyst_status(validation)} "
                    f"(confidence {validation.confidence}%)."
                )
                for line in validation.confidence_breakdown[:6]:
                    self._think(f"  {line}")

        fp_count = sum(
            1 for v in validations if v.classification == Classification.FALSE_POSITIVE
        )
        retained = len(correlated) - fp_count
        self._think(
            f"{len(raw_findings)} findings received -> "
            f"{fp_count} discarded -> {retained} retained for graph."
        )

        self.on_stage(5, STAGES[4], "Discovering attack chains")
        attack_paths, graph_proof = discover_attack_paths(
            raw_findings, assets, correlated, validation_map
        )
        from vayne.models import DiscoveredAsset

        discovered_assets = [
            DiscoveredAsset(**a) for a in graph_proof.discovered_assets
        ]

        validated = sum(
            1
            for v in validations
            if v.classification
            in (Classification.CONFIRMED, Classification.LIKELY_EXPLOITABLE)
        )
        if validated == 0 and not attack_paths:
            self._think(
                "Zero validated findings — no attack paths can be proven."
            )
        elif validated == 0:
            self._think(
                "No scanner-validated findings — only CVE-enriched or tier-2 derived paths retained."
            )

        if self.proof:
            self.proof_log = graph_proof.log_lines()
            for line in self.proof_log:
                self._think(line)

        pd = graph_proof.path_discovery
        if pd:
            self._think(
                f"Analyst value: {pd.raw_paths_enumerated} paths explored, "
                f"{pd.paths_rejected} rejected, {pd.paths_accepted} surviving, "
                f"~{pd.analyst_minutes_saved} min saved."
            )
            if pd.confidence_distribution:
                dist = ", ".join(f"{k}={v}" for k, v in pd.confidence_distribution.items())
                self._think(f"Confidence distribution: {dist}")

        if attack_paths:
            pd = graph_proof.path_discovery
            if pd:
                self._think(
                    f"Graph: {len(graph_proof.nodes)} nodes, "
                    f"{sum(1 for e in graph_proof.edges if e.accepted)} edges. "
                    f"Running {pd.algorithm}(): {pd.raw_paths_enumerated} paths found, "
                    f"{pd.paths_accepted} evidence-backed paths retained."
                )
            for p in attack_paths:
                self._think(f"Attack path discovered: {p.title}")
                self._think(
                    f"Risk {p.risk_score} | Confidence: {p.confidence}% | "
                    f"Effort: {p.attacker_effort}"
                )
                for line in p.path_explanation:
                    self._think(f"  + {line}")
                if p.is_hypothetical:
                    self._think("  Label: HYPOTHETICAL PATH (contains TIER3 assumptions)")
                if p.termination_message:
                    self._think(p.termination_message)
        else:
            self._think("NO ATTACK PATH DISCOVERED - graph traversal found no entry->target chain.")

        for item in correlated:
            validation = validation_map[item.id]
            item_paths = [
                p
                for p in attack_paths
                if any(n.id == f"vuln:{item.id}" for n in p.nodes)
            ]
            brief = generate_brief(item, validation, item_paths)
            timeline = generate_timeline(item, validation)
            exp_score = score_exploitability(item, validation)
            intelligence = build_finding_intelligence(item, validation, item_paths)

            investigated.append(
                InvestigatedFinding(
                    correlated=item,
                    validation=validation,
                    analyst=brief,
                    remediation=timeline,
                    exploitability_score=exp_score,
                    intelligence=intelligence,
                )
            )
            time.sleep(0.05)

        self.on_stage(6, STAGES[5], "Scoring exploitability")
        self._think("Calculating exploitability from validation signals...")

        self.on_stage(7, STAGES[6], "Building final report")
        pd = graph_proof.path_discovery
        stats = build_stats(
            len(raw_findings),
            correlated,
            validations,
            len(attack_paths),
            paths_explored=pd.raw_paths_enumerated if pd else 0,
            paths_rejected=pd.paths_rejected if pd else 0,
            hypothetical_paths=pd.paths_hypothetical if pd else 0,
            analyst_minutes_saved=pd.analyst_minutes_saved if pd else 0.0,
            confidence_distribution=pd.confidence_distribution if pd else {},
            unknowns=pd.unknowns_requiring_investigation if pd else 0,
        )
        self._think(f"Estimated analyst time saved: {stats.analyst_hours_saved}h")

        duration = time.perf_counter() - self._start
        report = InvestigationReport(
            name=self.name,
            target=", ".join(str(p) for p in self.paths),
            duration_seconds=duration,
            stats=stats,
            assets=assets,
            discovered_assets=discovered_assets,
            findings=investigated,
            attack_paths=attack_paths,
            thinking_log=self.thinking_log,
            proof_log=self.proof_log,
        )

        if export_dir:
            export_production_artifacts(report, graph_proof, export_dir)
            report = enrich_report(report, graph_proof)
            self._think(f"Reports exported to {export_dir}")

        return report
