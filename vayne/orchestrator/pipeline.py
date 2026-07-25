"""7-stage investigation orchestrator."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Callable

from vayne.analyst.engine import generate_brief
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.engine_trace.emitter import EngineTraceEmitter
from vayne.engine_trace.events import (
    STAGE_CONSOLE,
    STAGE_CONFIDENCE,
    STAGE_CORRELATION,
    STAGE_EXPORT,
    STAGE_GRAPH,
    STAGE_INVESTIGATION,
    STAGE_NORMALIZATION,
    STAGE_PARSER,
    STAGE_PRIORITY,
    STAGE_PROOF,
    STAGE_SUMMARY,
    STAGE_VALIDATION,
)
from vayne.engine_trace.formulas import formula_catalog
from vayne.engine_trace.instrument import (
    emit_ai_boundary,
    emit_correlation,
    emit_export,
    emit_graph,
    emit_investigation_build,
    emit_normalization,
    emit_parser_complete,
    emit_phase,
    emit_priority_samples,
    emit_summary,
    emit_validation,
)
from vayne.exploitability.scorer import score_exploitability
from vayne.false_positive.classifier import build_stats
from vayne.intelligence import build_finding_intelligence
from vayne.models import Classification, InvestigatedFinding, InvestigationReport
from vayne.parsers.loader import load_scan_files
from vayne.remediation.engine import generate_timeline
from vayne.production.exporter import enrich_report, export_production_artifacts
from vayne.validator.engine import format_analyst_status, validate_finding

StageCallback = Callable[[int, str, str], None]
ThinkingCallback = Callable[[str], None]

_PACE_THRESHOLD = 200
_DEFAULT_MAX_FULL = 750

_SEVERITY_RANK = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}


def _max_full_investigations() -> int:
    try:
        return max(1, int(os.getenv("VAYNE_MAX_FULL_INVESTIGATIONS", str(_DEFAULT_MAX_FULL))))
    except (TypeError, ValueError):
        return _DEFAULT_MAX_FULL


def _prioritized_ids(correlated: list, validation_map: dict, limit: int) -> set[str]:
    if len(correlated) <= limit:
        return {item.id for item in correlated}

    def score(item) -> tuple:
        v = validation_map.get(item.id)
        sev = _SEVERITY_RANK.get((item.severity or "info").lower(), 0)
        overall = int(getattr(v, "overall_confidence", 0) or 0) if v else 0
        return (sev, overall, item.id)

    ranked = sorted(correlated, key=score, reverse=True)
    return {item.id for item in ranked[:limit]}


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
        cache_dir: Path | None = None,
        trace: EngineTraceEmitter | None = None,
    ):
        self.name = name
        self.paths = paths
        self.on_stage = on_stage or (lambda *_: None)
        self.on_thinking = on_thinking or (lambda _: None)
        self.proof = proof
        self.cache_dir = cache_dir
        self.trace = trace or EngineTraceEmitter()
        self.parse_manifest: dict | None = None
        self.thinking_log: list[str] = []
        self.proof_log: list[str] = []
        self._start = 0.0

    def _think(self, msg: str) -> None:
        # Proof audit lines from graph_proof.log_lines() are emitted verbatim.
        proof_prefixes = (
            "===",
            "NODE ",
            "EDGE ",
            "REJECTED",
            "ATTACK ",
            "  ",
            "Paths ",
            "Nodes ",
            "Edges ",
            "Algorithm:",
            "Entry ",
            "Terminal ",
            "Confidence ",
            "Hypothetical ",
            "False positives",
            "Manual analyst",
            "Unknowns ",
            "Max blast",
            "Connected ",
            "Average ",
            "Reachable ",
            "Candidate ",
            "Valid ",
            "Analyst ",
            "sample path:",
            "Why this path",
            "MITRE ",
            "MATCHED ",
            "WHY THIS",
        )
        is_proof = (not msg.strip()) or any(msg.startswith(p) for p in proof_prefixes)
        line = msg if is_proof or msg.startswith("[VAYNE]") else f"[VAYNE] {msg}"
        self.thinking_log.append(line)
        self.on_thinking(line)
        stage = STAGE_PROOF if is_proof else STAGE_CONSOLE
        self.trace.emit_stage(stage, "line", message=line)

    def run(self, export_dir: Path | None = None) -> InvestigationReport:
        self._start = time.perf_counter()
        trace = self.trace
        n_files = len(self.paths)

        def _phase(
            phase_id: str,
            *,
            files_processed: int | None = None,
            status: str = "running",
            progress_pct: float | None = None,
        ) -> None:
            emit_phase(
                trace,
                phase_id=phase_id,
                files_ingested=n_files,
                files_processed=files_processed if files_processed is not None else 0,
                elapsed_s=time.perf_counter() - self._start,
                status=status,
                progress_pct=progress_pct,
            )

        self.on_stage(1, STAGES[0], "Reading scanner outputs")
        self._think("Initializing investigation workspace...")
        trace.mark_stage_start(STAGE_PARSER)
        _phase(STAGE_PARSER, files_processed=0, progress_pct=0.0)
        trace.emit_stage(
            STAGE_SUMMARY,
            "formula_catalog",
            message="Active formulas (implemented)",
            fields={"formulas": formula_catalog()},
        )
        trace.emit_stage(
            STAGE_PARSER,
            "start",
            message="Reading scanner outputs",
            fields={"files": [str(p.name) for p in self.paths]},
        )
        t0 = time.perf_counter()
        load_result = load_scan_files(self.paths, cache_dir=self.cache_dir)
        raw_findings, raw_assets = load_result
        self.parse_manifest = load_result.manifest
        hosts = {getattr(a, "host", None) or getattr(a, "ip", None) for a in raw_assets}
        hosts.discard(None)
        hosts.update(getattr(f, "host", None) for f in raw_findings if getattr(f, "host", None))
        ports = {
            getattr(f, "port", None)
            for f in raw_findings
            if getattr(f, "port", None) not in (None, 0, "")
        }
        services = {
            getattr(f, "service", None) or getattr(f, "product", None)
            for f in raw_findings
            if getattr(f, "service", None) or getattr(f, "product", None)
        }
        emit_parser_complete(
            trace,
            paths=[str(p.name) for p in self.paths],
            raw_findings=len(raw_findings),
            raw_assets=len(raw_assets),
            manifest=self.parse_manifest if isinstance(self.parse_manifest, dict) else None,
            execution_ms=(time.perf_counter() - t0) * 1000,
            hosts=len(hosts),
            ports=len(ports),
            services=len(services),
        )
        _phase(STAGE_PARSER, files_processed=n_files)
        if not raw_findings and not raw_assets:
            self._think("No parseable findings in uploaded files — check for empty or skipped files.")
        if self.parse_manifest.get("cache_hits"):
            self._think(
                f"Incremental parse: {self.parse_manifest['cache_hits']} file(s) loaded from cache, "
                f"{self.parse_manifest['cache_misses']} re-parsed."
            )
        self._think(f"Loaded {len(raw_findings)} raw findings from {len(self.paths)} path(s).")

        self.on_stage(2, STAGES[1], f"Normalized {len(raw_findings)} findings")
        self._think("Parsing and normalizing to common schema...")
        t_norm = time.perf_counter()
        emit_normalization(
            trace,
            raw_findings=len(raw_findings),
            execution_ms=(time.perf_counter() - t_norm) * 1000,
        )
        _phase(STAGE_NORMALIZATION, files_processed=n_files)

        self.on_stage(3, STAGES[2], "Merging duplicate signals")
        t_corr = time.perf_counter()
        correlated = correlate_findings(raw_findings)
        assets = correlate_assets(raw_assets)
        emit_correlation(
            trace,
            raw_findings=len(raw_findings),
            correlated=correlated,
            assets=assets,
            execution_ms=(time.perf_counter() - t_corr) * 1000,
        )
        _phase(STAGE_CORRELATION, files_processed=n_files)
        self._think(f"Correlated into {len(correlated)} unique investigation targets.")

        self.on_stage(4, STAGES[3], "Validating each finding")
        investigated: list[InvestigatedFinding] = []
        validations: list = []
        validation_map: dict = {}
        t_val = time.perf_counter()

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

        emit_validation(
            trace,
            validations=validations,
            correlated=correlated,
            execution_ms=(time.perf_counter() - t_val) * 1000,
        )
        _phase(STAGE_VALIDATION, files_processed=n_files)
        _phase(STAGE_CONFIDENCE, files_processed=n_files)

        fp_count = sum(
            1 for v in validations if v.classification == Classification.FALSE_POSITIVE
        )
        retained = len(correlated) - fp_count
        self._think(
            f"{len(raw_findings)} findings received -> "
            f"{fp_count} discarded -> {retained} retained for graph."
        )

        self.on_stage(5, STAGES[4], "Discovering attack chains")
        t_graph = time.perf_counter()
        attack_paths, graph_proof = discover_attack_paths(
            raw_findings, assets, correlated, validation_map
        )
        emit_graph(
            trace,
            graph_proof=graph_proof,
            attack_paths=attack_paths,
            execution_ms=(time.perf_counter() - t_graph) * 1000,
        )
        _phase(STAGE_GRAPH, files_processed=n_files)
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
            self._think("Zero validated findings — no attack paths can be proven.")
        elif validated == 0:
            self._think(
                "No scanner-validated findings — only CVE-enriched or tier-2 derived paths retained."
            )

        if self.proof:
            self.proof_log = graph_proof.log_lines()
            for line in self.proof_log:
                # Emit verbatim proof lines (exact CLI --proof stream). Do not
                # route through _think classification — that can mis-tag lines.
                self.thinking_log.append(line)
                self.on_thinking(line)
                self.trace.emit_stage(STAGE_PROOF, "line", message=line)

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

        max_full = _max_full_investigations()
        full_ids = _prioritized_ids(correlated, validation_map, max_full)
        pace = len(correlated) <= _PACE_THRESHOLD

        t_inv = time.perf_counter()
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
            intelligence = build_finding_intelligence(
                item, validation, item_paths,
                full_investigation=item.id in full_ids,
            )
            bridged = intelligence.pop("_validation", None)
            if bridged is not None:
                validation = bridged
                validation_map[item.id] = validation

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
            if pace:
                time.sleep(0.05)

        emit_investigation_build(
            trace,
            investigated=len(investigated),
            full_investigations=len(full_ids),
            execution_ms=(time.perf_counter() - t_inv) * 1000,
        )
        _phase(STAGE_INVESTIGATION, files_processed=n_files)
        highest_priority = emit_priority_samples(
            trace, investigated=investigated, attack_paths=attack_paths
        )
        _phase(STAGE_PRIORITY, files_processed=n_files)

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
            t_exp = time.perf_counter()
            export_production_artifacts(
                report, graph_proof, export_dir, parse_manifest=self.parse_manifest
            )
            report = enrich_report(report, graph_proof)
            emit_export(
                trace,
                export_dir=str(export_dir),
                execution_ms=(time.perf_counter() - t_exp) * 1000,
            )
            _phase(STAGE_EXPORT, files_processed=n_files)
            self._think(f"Reports exported to {export_dir}")

        confidences = [
            float(getattr(v, "overall_confidence", 0) or 0) for v in validations if v
        ]
        avg_conf = round(sum(confidences) / len(confidences), 2) if confidences else None
        accepted_edges = sum(1 for e in graph_proof.edges if getattr(e, "accepted", True))
        emit_summary(
            trace,
            duration_seconds=duration,
            raw_findings=len(raw_findings),
            correlated=len(correlated),
            duplicates_removed=max(0, len(raw_findings) - len(correlated)),
            validations_retained=retained,
            attack_paths=len(attack_paths),
            nodes=len(graph_proof.nodes),
            edges=accepted_edges,
            investigations=len(investigated),
            avg_confidence=avg_conf,
            highest_priority=highest_priority,
            files_processed=len(self.paths),
            assets=len(assets),
        )
        _phase(STAGE_SUMMARY, files_processed=n_files, status="complete")
        emit_ai_boundary(
            trace,
            deterministic_ms=duration * 1000,
            investigations=len(investigated),
            avg_confidence=avg_conf,
        )

        if export_dir:
            try:
                trace.persist(export_dir)
            except OSError:
                pass

        return report
