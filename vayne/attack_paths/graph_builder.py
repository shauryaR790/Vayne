"""Build strict evidence graph — every node is a concrete scan artifact."""

from __future__ import annotations

import re
import uuid

import networkx as nx

from vayne.attack_paths.artifact_links import build_validated_links
from vayne.attack_paths.artifacts import find_cross_host_links
from vayne.attack_paths.exploit_intelligence import (
    ApplicabilityContext,
    evaluate_applicability,
    lookup_exploit_candidates,
)
from vayne.attack_paths.intel._common import VERIFIED
from vayne.attack_paths.intel.cloud_intel import analyze_cloud
from vayne.attack_paths.intel.credential_intel import analyze_credentials
from vayne.attack_paths.intel.identity_intel import analyze_escalations
from vayne.attack_paths.intel.lateral_intel import analyze_pivots
from vayne.attack_paths.confidence_model import compute_confidence
from vayne.attack_paths.evidence_entities import extract_entities
from vayne.attack_paths.evidence_tiers import tier_for_edge, tier_for_node
from vayne.attack_paths.formulas import MIN_EDGE_CONFIDENCE, edge_confidence
from vayne.attack_paths.blast_radius import annotate_graph_blast_radius
from vayne.attack_paths.graph_filters import is_security_finding
from vayne.attack_paths.node_factory import build_node_attrs, ensure_node_fields
from vayne.attack_paths.proof import GraphProof, ProofEdge, ProofNode
from vayne.attack_paths.software import SoftwareFingerprint, dedupe_software, parse_software
from vayne.models import (
    Asset,
    AssetService,
    Classification,
    CorrelatedFinding,
    DiscoveredAsset,
    EvidenceTier,
    Finding,
    NodeType,
    ValidationResult,
)


# Kept in sync with the typed NodeType enum so new node types (Phase 2+) are
# accepted without editing the builder's core logic.
ALLOWED_NODE_TYPES = frozenset(nt.value for nt in NodeType)

# Phase E: documented inventory edge confidence tiers (previously inline magic
# numbers 84/76/72). Named + surfaced in each edge's ConfidenceProof. Values
# unchanged so Metasploitable infra_mean (and path parity) is preserved.
INVENTORY_EDGE_CONFIDENCE: dict[str, int] = {
    "service_fingerprint": 84,  # nmap service fingerprint with version
    "open_port": 76,            # nmap open port confirmed
    "default": 72,              # generic scan inventory edge
}

# --- Phase C intel integration constants -----------------------------------
# Capability ordering used to chain intel-derived nodes deterministically.
# vulnerability nodes sit at rank 1 (code_execution); intel nodes attach above.
_CAP_RANK: dict[str, int] = {
    "initial_access": 0,
    "execution": 1,
    "code_execution": 1,
    "credential_access": 2,
    "privilege_escalation": 3,
    "lateral_movement": 3,
    "data_access": 4,
    "domain_compromise": 5,
    "persistence": 6,
}
# High-value capabilities whose verified nodes become terminal attack goals.
_HIGH_VALUE_CAPS = frozenset({"data_access", "domain_compromise"})
# Capability granted by reaching a credential's unlock target node type.
_UNLOCK_CAP: dict[str, str] = {
    "iam_role": "privilege_escalation",
    "service_account": "privilege_escalation",
    "identity": "privilege_escalation",
    "database": "data_access",
    "secret": "data_access",
    "cloud_resource": "lateral_movement",
    "endpoint": "lateral_movement",
}
# Node types owned by the strict legacy entity pathway; remap intel emissions
# to safe equivalents so strict-label invariants are never violated.
_INTEL_NODE_TYPE_REMAP: dict[str, str] = {
    "identity": "service_account",
    "data": "secret",
}


def _intel_slug(value: str) -> str:
    return re.sub(r"[^\w.-]+", "-", str(value).lower()).strip("-")[:60]


class SecurityGraphBuilder:
    def __init__(self) -> None:
        self._g = nx.DiGraph()
        self._proof = GraphProof()
        self._discovered_assets: dict[str, DiscoveredAsset] = {}

    def build(
        self,
        findings: list[Finding],
        assets: list[Asset],
        correlated: list[CorrelatedFinding],
        validations: dict[str, ValidationResult] | None = None,
    ) -> nx.DiGraph:
        self._g = nx.DiGraph()
        self._proof = GraphProof()
        self._discovered_assets = {}
        self._findings = findings
        validations = validations or {}

        self._add_entry()
        for asset in assets:
            self._add_asset(asset)
            self._add_asset_services(asset)

        for cf in correlated:
            v = validations.get(cf.id)
            if not v or v.classification == Classification.FALSE_POSITIVE:
                continue
            if not is_security_finding(cf):
                continue
            asset = self._asset_record(cf.host, assets)
            self._add_finding_chain(cf, v, assets, asset)

        annotate_graph_blast_radius(self._g)
        self._finalize_nodes()
        return self._g

    def _add_node(
        self,
        node_id: str,
        *,
        label: str,
        node_type: str,
        evidence: list[str],
        finding_ids: list[str] | None = None,
        source_tool: str = "scan",
        validation_status: str = "observed",
        evidence_tier: str | None = None,
        capability: str = "",
        confidence: int = 0,
        record_proof: bool = True,
        **extra,
    ) -> bool:
        """Create a node via the typed factory. Idempotent (skips if present).

        Returns True if a new node was added, False if it already existed.
        """
        if node_id in self._g:
            return False
        if evidence_tier is None:
            evidence_tier = tier_for_node(node_type).value
        attrs = build_node_attrs(
            node_id,
            label=label,
            node_type=node_type,
            evidence=evidence,
            finding_ids=finding_ids,
            confidence=confidence,
            capability=capability,
            source_tool=source_tool,
            validation_status=validation_status,
            evidence_tier=evidence_tier,
            **extra,
        )
        self._g.add_node(node_id, **attrs)
        if record_proof:
            self._proof.nodes.append(
                ProofNode(
                    id=node_id,
                    label=label,
                    node_type=node_type,
                    evidence=list(evidence),
                    finding_ids=list(finding_ids or []),
                )
            )
        return True

    def _finalize_nodes(self) -> None:
        """Guarantee every node satisfies the GraphNode field contract."""
        for nid in self._g.nodes:
            ensure_node_fields(self._g.nodes[nid])

    def _host_evidence(self, host: str) -> list[str]:
        texts: list[str] = []
        for finding in self._findings:
            if finding.host != host:
                continue
            if finding.evidence:
                texts.append(finding.evidence)
            if finding.title:
                texts.append(finding.title)
            if finding.description:
                texts.append(finding.description)
        return texts

    @property
    def proof(self) -> GraphProof:
        return self._proof

    @property
    def discovered_assets(self) -> list[DiscoveredAsset]:
        return list(self._discovered_assets.values())

    def _asset_record(self, host: str, assets: list[Asset]) -> Asset | None:
        for a in assets:
            if a.host == host:
                return a
        return None

    def _ensure_discovered_asset(self, asset: Asset) -> DiscoveredAsset:
        if asset.host not in self._discovered_assets:
            self._discovered_assets[asset.host] = DiscoveredAsset(
                hostname=asset.host,
                ip=asset.ip,
                exposures=["internet-facing"] if asset.ports else [],
            )
        rec = self._discovered_assets[asset.host]
        if asset.ip and not rec.ip:
            rec.ip = asset.ip
        return rec

    def _add_entry(self) -> None:
        nid = "entry:internet"
        self._add_node(
            nid,
            label="internet",
            node_type="endpoint",
            evidence=["External attack surface entry point"],
            finding_ids=[],
            source_tool="scan",
            validation_status="entry_point",
            evidence_tier=EvidenceTier.TIER1.value,
            capability="initial_access",
            is_entry=True,
        )

    def _add_asset(self, asset: Asset) -> None:
        self._ensure_discovered_asset(asset)
        nid = f"asset:{asset.host}"
        evidence = [f"Host {asset.host} discovered in scan"]
        if asset.ip:
            evidence.append(f"IP {asset.ip}")
        self._add_node(
            nid,
            label=asset.host,
            node_type="asset",
            evidence=evidence,
            finding_ids=[],
            source_tool="scan",
            validation_status="observed",
            evidence_tier=tier_for_node("asset").value,
            ip=asset.ip,
        )
        self._add_edge(
            "entry:internet",
            nid,
            "exposed_to",
            f"Host {asset.host} in scan scope",
            "scan:inventory",
            "scan",
            [f"Host {asset.host} discovered in scan output"],
            "scan_inventory",
            ["host verified"],
            None,
            is_inventory=True,
        )

    def _ports_for_fingerprint(
        self, asset: Asset, fp: SoftwareFingerprint
    ) -> list[int]:
        matched: list[int] = []
        for port, tech in asset.port_technologies.items():
            pfp = parse_software(tech)
            if pfp and pfp.vendor == fp.vendor and pfp.product == fp.product:
                matched.append(port)
        return matched

    def _add_asset_services(self, asset: Asset) -> None:
        rec = self._ensure_discovered_asset(asset)
        asset_id = f"asset:{asset.host}"
        if asset_id not in self._g:
            return

        port_services: dict[int, AssetService] = {}
        for port in asset.ports:
            svc_id = f"service:{asset.host}:{port}"
            label = f"service/tcp/{port}@{asset.host}"
            ev = f"Nmap reports tcp/{port} open on {asset.host}"
            self._add_node(
                svc_id,
                label=label,
                node_type="service",
                evidence=[ev],
                finding_ids=[],
                source_tool="nmap",
                validation_status="observed",
                evidence_tier=tier_for_node("service").value,
                host=asset.host,
                port=port,
            )
            self._add_edge(
                asset_id,
                svc_id,
                "runs",
                ev,
                "scan:inventory",
                "nmap",
                [f"Nmap reports tcp/{port} open on {asset.host}"],
                "open_port",
                ["host verified", "service verified"],
                None,
                is_inventory=True,
            )
            port_services[port] = AssetService(port=port, protocol="tcp")

        fingerprints = dedupe_software(asset.host, asset.technologies)
        enriched: set[str] = set()
        for fp in fingerprints:
            sw_id = fp.node_id(asset.host)
            label = fp.label()
            ev = f"Nmap service fingerprint: {label}"
            self._add_node(
                sw_id,
                label=label,
                node_type="software",
                evidence=[ev],
                finding_ids=[],
                source_tool="nmap",
                validation_status="fingerprinted",
                evidence_tier=tier_for_node("software").value,
                host=asset.host,
                vendor=fp.vendor,
                product=fp.product,
                version=fp.version,
            )

            matched_ports = self._ports_for_fingerprint(asset, fp)
            if matched_ports:
                parent_ports = [
                    f"service:{asset.host}:{port}"
                    for port in matched_ports
                    if f"service:{asset.host}:{port}" in self._g
                ]
            else:
                parent_ports = [asset_id]

            for port_id in parent_ports:
                self._add_edge(
                    port_id,
                    sw_id,
                    "runs",
                    ev,
                    "scan:inventory",
                    "nmap",
                    [f"Nmap fingerprint: {label} on {asset.host}"],
                    "service_fingerprint",
                    ["host verified", "service verified", "software fingerprinted"],
                    None,
                    is_inventory=True,
                )

            for port in matched_ports:
                if port in port_services:
                    port_services[port].software = label

            if sw_id not in enriched:
                self._enrich_software_exploits(
                    asset.host, sw_id, fp, matched_ports or asset.ports[:1]
                )
                enriched.add(sw_id)

        if port_services:
            rec.services = list(port_services.values())

    def _enrich_software_exploits(
        self,
        host: str,
        sw_id: str,
        fp: SoftwareFingerprint,
        open_ports: list[int],
    ) -> None:
        scan_evidence = self._host_evidence(host)
        ctx = ApplicabilityContext(
            fingerprint=fp,
            scan_evidence=scan_evidence,
            open_ports=open_ports,
        )

        for record in lookup_exploit_candidates(fp):
            result = evaluate_applicability(record, ctx)
            status = result.status
            cand_id = f"cve_cand:{host}:{record.cve_id}"

            ms_mod = record.metasploit_modules[0] if record.metasploit_modules else "n/a"
            cand_ev = (
                f"Exploit intelligence: {fp.label()} may be affected by {record.cve_id} "
                f"(Metasploit: {ms_mod}). {record.notes}"
            ).strip()

            self._add_node(
                cand_id,
                label=f"CANDIDATE {record.cve_id}",
                node_type="vulnerability",
                evidence=[cand_ev],
                finding_ids=[f"exploit_intel:{record.cve_id}"],
                source_tool="exploit_intel",
                validation_status=status,
                evidence_tier=EvidenceTier.TIER2.value,
                confidence=result.confidence,
                cve_enriched=True,
                applicability_status=status,
                cvss=record.cvss,
                exploit_maturity=record.exploit_maturity,
                public_poc=record.public_poc,
                metasploit_module=ms_mod,
            )

            self._add_edge(
                sw_id,
                cand_id,
                "version_may_affect",
                cand_ev,
                f"exploit_intel:{record.cve_id}",
                "exploit_intel",
                [
                    f"Version {fp.version or 'unknown'} matched for {record.cve_id}",
                    f"Ports observed: {open_ports}",
                    f"Status: {status}",
                ],
                "cve_candidate",
                result.validation_checks[:3] or ["version confirmed"],
                None,
                source_count=1,
                confidence_override=result.confidence,
                is_cve_candidate=(status != "verified"),
                confidence_proof=result.confidence_proof,
            )

            for prereq in record.prerequisites:
                pre_id = f"prereq:{host}:{record.cve_id}:{prereq.id}"
                pre_status = next(
                    (s for pid, s, _ in result.prerequisite_results if pid == prereq.id),
                    "unknown",
                )
                match = next(
                    (m for pid, s, m in result.prerequisite_results if pid == prereq.id),
                    None,
                )
                pre_ev = prereq.description
                if pre_status == "verified" and match:
                    pre_ev = f"{prereq.description} — verified ({match})"
                elif pre_status == "unknown":
                    pre_ev = f"{prereq.description} — NOT observed in scan"

                self._add_node(
                    pre_id,
                    label=prereq.description,
                    node_type="endpoint",
                    evidence=[pre_ev],
                    finding_ids=[f"exploit_intel:{record.cve_id}"],
                    source_tool="exploit_intel",
                    validation_status=("verified" if pre_status == "verified" else "candidate"),
                    evidence_tier=EvidenceTier.TIER2.value,
                    prerequisite_status=pre_status,
                )

                pre_conf = max(35, result.confidence - 10) if pre_status != "verified" else result.confidence
                self._add_edge(
                    cand_id,
                    pre_id,
                    "requires",
                    pre_ev,
                    f"exploit_intel:{record.cve_id}",
                    "exploit_intel",
                    [f"Prerequisite for {record.cve_id}: {prereq.description}"],
                    "cve_prerequisite",
                    ["exploit prerequisites met"] if pre_status == "verified" else ["version confirmed"],
                    None,
                    source_count=1,
                    confidence_override=pre_conf,
                    is_cve_candidate=(pre_status != "verified"),
                )

            if status != "verified":
                continue

            verified_id = f"cve_verified:{host}:{record.cve_id}"
            exploit_id = f"exploit:{host}:{record.cve_id}"
            access_id = f"access:{host}:{record.cve_id}"

            verified_ev = (
                f"Verified applicability: {record.cve_id} on {fp.label()} "
                f"(ports {open_ports}, maturity {record.exploit_maturity})"
            )
            exploit_ev = (
                f"Public exploit available: {record.title}; "
                f"Metasploit {ms_mod}; PoC={'yes' if record.public_poc else 'no'}"
            )
            access_ev = f"Evidence-backed access outcome: {record.access_outcome}"

            self._add_node(
                verified_id,
                label=f"VERIFIED {record.cve_id}",
                node_type="vulnerability",
                evidence=[verified_ev],
                finding_ids=[f"exploit_intel:{record.cve_id}"],
                source_tool="exploit_intel",
                validation_status="verified",
                evidence_tier=EvidenceTier.TIER2.value,
                confidence=result.confidence,
                capability=record.capability.value,
                applicability_status="verified",
                cve_enriched=True,
                cvss=record.cvss,
                exploit_maturity=record.exploit_maturity,
                public_poc=record.public_poc,
                metasploit_module=ms_mod,
            )

            self._add_node(
                exploit_id,
                label=f"{record.title} (exploit)",
                node_type="endpoint",
                evidence=[exploit_ev],
                finding_ids=[f"exploit_intel:{record.cve_id}"],
                source_tool="exploit_intel",
                validation_status="verified",
                evidence_tier=EvidenceTier.TIER2.value,
                confidence=result.confidence,
                capability=record.capability.value,
                public_poc=record.public_poc,
                auth_required=record.auth_required,
            )

            self._add_node(
                access_id,
                label=record.access_outcome,
                node_type="endpoint",
                evidence=[access_ev],
                finding_ids=[f"exploit_intel:{record.cve_id}"],
                source_tool="exploit_intel",
                validation_status="verified",
                evidence_tier=EvidenceTier.TIER2.value,
                confidence=result.confidence,
                capability=record.capability.value,
                is_exploit_outcome=True,
                terminal_kind="access_obtained",
            )

            chain_parent = (
                f"prereq:{host}:{record.cve_id}:{record.prerequisites[-1].id}"
                if record.prerequisites
                else cand_id
            )
            ver_conf = max(MIN_EDGE_CONFIDENCE, result.confidence)

            self._add_edge(
                chain_parent if record.prerequisites else cand_id,
                verified_id,
                "confirms_applicability",
                verified_ev,
                f"exploit_intel:{record.cve_id}",
                "exploit_intel",
                result.validation_checks,
                "cve_verified",
                result.validation_checks,
                None,
                source_count=1,
                confidence_override=ver_conf,
                confidence_proof=result.confidence_proof,
            )
            self._add_edge(
                verified_id,
                exploit_id,
                "enables",
                exploit_ev,
                f"exploit_intel:{record.cve_id}",
                "exploit_intel",
                [f"{record.cve_id}: {record.title}", f"module {ms_mod}"],
                "cve_enrichment",
                result.validation_checks,
                None,
                source_count=1,
                confidence_override=ver_conf,
                confidence_proof=result.confidence_proof,
            )
            self._add_edge(
                exploit_id,
                access_id,
                "yields_access",
                access_ev,
                f"exploit_intel:{record.cve_id}",
                "exploit_intel",
                [f"Access outcome: {record.access_outcome}"],
                "access_outcome",
                result.validation_checks,
                None,
                source_count=1,
                confidence_override=ver_conf,
                confidence_proof=result.confidence_proof,
            )

    def _add_finding_chain(
        self,
        cf: CorrelatedFinding,
        validation: ValidationResult,
        assets: list[Asset],
        asset: Asset | None,
    ) -> None:
        host = cf.host
        asset_id = f"asset:{host}"
        if asset_id not in self._g:
            return

        rec = self._discovered_assets.setdefault(host, DiscoveredAsset(hostname=host))

        vuln_label = cf.cve.upper() if cf.cve else cf.title[:80]
        vuln_id = f"vuln:{cf.id}"
        vuln_evidence = cf.evidence[:5]
        source_tool = cf.sources[0] if cf.sources else "scan"
        self._add_node(
            vuln_id,
            label=vuln_label,
            node_type="vulnerability",
            evidence=vuln_evidence,
            finding_ids=[cf.id],
            source_tool=source_tool,
            validation_status=validation.classification.value,
            evidence_tier=tier_for_node("vulnerability").value,
            confidence=validation.confidence,
            capability="code_execution",
        )
        rec.vulnerabilities.append(vuln_label)

        checks = _validation_checks(validation)
        src_count = len(cf.sources) if cf.sources else 1

        entities = extract_entities(cf, asset)
        for ent in entities:
            if ent.node_type not in ALLOWED_NODE_TYPES:
                continue
            node_capability = "code_execution" if ent.node_type == "endpoint" else ""
            self._add_node(
                ent.node_id,
                label=ent.label,
                node_type=ent.node_type,
                evidence=[ent.evidence],
                finding_ids=[cf.id],
                source_tool=source_tool,
                validation_status="observed",
                evidence_tier=tier_for_node(ent.node_type).value,
                capability=node_capability,
            )

        parent = self._vuln_parent(asset_id, cf, asset)
        self._add_edge(
            parent,
            vuln_id,
            "affects",
            cf.evidence[0] if cf.evidence else cf.title,
            cf.id,
            source_tool,
            _discovered_from_finding(cf),
            "finding",
            checks,
            validation,
            source_count=src_count,
        )

        entity_tail = vuln_id
        for ent in entities:
            if ent.node_type != "endpoint":
                continue
            self._add_edge(
                vuln_id,
                ent.node_id,
                "exploits",
                ent.evidence,
                cf.id,
                source_tool,
                ent.discovered_from,
                ent.artifact_type,
                checks,
                validation,
                source_count=src_count,
            )
            entity_tail = ent.node_id

        for link in build_validated_links(cf, entities, vuln_id):
            self._add_edge(
                link.source_id,
                link.target_id,
                link.edge_type,
                link.evidence,
                cf.id,
                source_tool,
                link.discovered_from,
                link.artifact_type,
                checks,
                validation,
                source_count=src_count,
            )
            entity_tail = link.target_id

        for link in find_cross_host_links(cf.evidence, assets, host):
            target_id = f"asset:{link.target_host}"
            if target_id not in self._g:
                continue
            self._add_edge(
                entity_tail,
                target_id,
                "connects_to",
                link.artifact_snippet,
                cf.id,
                source_tool,
                [link.artifact_label],
                link.artifact_type,
                checks,
                validation,
                source_count=src_count,
            )
            entity_tail = target_id

        # Phase C: additive, evidence-gated intel enrichment (verified only).
        self._enrich_intel_domains(cf, vuln_id)

    def _enrich_intel_domains(self, cf: CorrelatedFinding, vuln_id: str) -> None:
        """Attach credential/cloud/identity/lateral intel as typed nodes.

        Additive and conservative: only *verified* intel results (corroborated
        by evidence) become graph nodes/edges, all created via ``_add_node`` /
        ``_add_edge``. Nodes are chained in capability order; only verified
        high-value nodes (data access / domain compromise) become terminals.
        Capability-transition validation (Step B) rejects any chain that turns
        out to be logically impossible, so no hallucinated path can survive.
        """
        evidence = [e for e in (cf.evidence or []) if e]
        if not evidence:
            return
        host = cf.host
        fid = cf.id
        steps: list[dict] = []

        def add_step(
            cap: str,
            node_type: str,
            key: str,
            label: str,
            node_ev: list[str],
            rel: str,
            edge_ev: str,
            conf: int,
            discovered_from: list[str],
            source_tool: str,
        ) -> None:
            if not cap or conf < MIN_EDGE_CONFIDENCE:
                return
            nt = _INTEL_NODE_TYPE_REMAP.get(node_type, node_type)
            if nt not in ALLOWED_NODE_TYPES:
                return
            steps.append(
                {
                    "rank": _CAP_RANK.get(cap, 99),
                    "cap": cap,
                    "node_type": nt,
                    "node_id": f"intel:{host}:{cap}:{_intel_slug(key)}",
                    "label": label,
                    "node_ev": node_ev or [edge_ev],
                    "rel": rel,
                    "edge_ev": edge_ev,
                    "conf": conf,
                    "discovered_from": discovered_from or [edge_ev],
                    "artifact_type": source_tool,
                    "source_tool": source_tool,
                    "high_value": cap in _HIGH_VALUE_CAPS,
                }
            )

        for res in analyze_credentials(evidence):
            if res.status != VERIFIED:
                continue
            cred_label = (
                f"{res.cred_type}: {res.matched_value[:14]}".strip()
                if res.matched_value
                else res.cred_type
            )
            add_step(
                (res.capability.value if res.capability else "credential_access"),
                res.node_type,
                f"{res.cred_type}",
                cred_label,
                res.breakdown[:3],
                res.relationship,
                f"Credential intelligence: {res.outcome}",
                res.confidence,
                [f"credential_intel:{res.cred_type} ({res.status})", *res.evidence_markers],
                "credential_intel",
            )
            unlock_cap = _UNLOCK_CAP.get(res.unlocks_node_type)
            if unlock_cap:
                add_step(
                    unlock_cap,
                    res.unlocks_node_type,
                    f"{res.cred_type}->{res.unlocks_node_type}",
                    f"{res.unlocks_node_type}: {res.outcome}",
                    [res.outcome],
                    res.relationship,
                    res.outcome,
                    res.confidence,
                    [f"credential_intel unlock: {res.unlocks_node_type}", *res.evidence_markers],
                    "credential_intel",
                )

        for res in analyze_escalations(evidence):
            if res.status != VERIFIED:
                continue
            add_step(
                res.capability.value,
                res.to_node_type,
                f"esc:{res.mechanism}",
                f"{res.to_principal} via {res.mechanism}",
                res.breakdown[:3],
                res.relationship,
                f"Identity escalation: {res.outcome}",
                res.confidence,
                [f"identity_intel:{res.mechanism} ({res.status})", *res.mechanism_evidence],
                "identity_intel",
            )

        for res in analyze_cloud(evidence):
            if res.status != VERIFIED:
                continue
            add_step(
                res.capability.value,
                res.target_node_type,
                f"cloud:{res.rel_id}",
                f"{res.target_kind} via {res.rel_id}",
                res.breakdown[:3],
                res.relationship,
                f"Cloud intelligence: {res.outcome}",
                res.confidence,
                [f"cloud_intel:{res.rel_id} ({res.status})", *res.trust_evidence, *res.target_evidence],
                "cloud_intel",
            )

        for res in analyze_pivots(evidence, source_host=host):
            if res.status != VERIFIED:
                continue
            add_step(
                res.capability.value,
                "internal_service",
                f"pivot:{res.mechanism}",
                f"pivot via {res.mechanism}",
                res.breakdown[:3],
                res.relationship,
                f"Lateral movement: {res.outcome}",
                res.confidence,
                [f"lateral_intel:{res.mechanism} ({res.status})", *res.evidence_markers],
                "lateral_intel",
            )

        if not steps:
            return

        # Collapse to one best (highest confidence) node per capability rank to
        # form a clean, deterministic chain.
        best_by_rank: dict[int, dict] = {}
        for s in steps:
            cur = best_by_rank.get(s["rank"])
            if cur is None or (s["conf"], s["node_id"]) > (cur["conf"], cur["node_id"]):
                best_by_rank[s["rank"]] = s

        prev_id = vuln_id
        for rank in sorted(best_by_rank):
            s = best_by_rank[rank]
            extra: dict = {}
            if s["high_value"]:
                extra["is_exploit_outcome"] = True
                extra["terminal_kind"] = "intel_outcome"
            self._add_node(
                s["node_id"],
                label=s["label"],
                node_type=s["node_type"],
                evidence=s["node_ev"],
                finding_ids=[fid],
                source_tool=s["source_tool"],
                validation_status="verified",
                evidence_tier=EvidenceTier.TIER2.value,
                confidence=s["conf"],
                capability=s["cap"],
                **extra,
            )
            self._add_edge(
                prev_id,
                s["node_id"],
                s["rel"],
                s["edge_ev"],
                fid,
                s["source_tool"],
                s["discovered_from"],
                s["artifact_type"],
                ["evidence corroborated (intel)"],
                None,
                source_count=1,
                confidence_override=s["conf"],
            )
            prev_id = s["node_id"]

    def _vuln_parent(
        self,
        asset_id: str,
        cf: CorrelatedFinding,
        asset: Asset | None,
    ) -> str:
        host = cf.host
        if cf.port:
            port_id = f"service:{host}:{cf.port}"
            if port_id in self._g:
                return port_id
        if asset:
            for fp in dedupe_software(host, asset.technologies):
                sw_id = fp.node_id(host)
                if sw_id in self._g:
                    matched = self._ports_for_fingerprint(asset, fp)
                    if not cf.port or cf.port in matched or not matched:
                        return sw_id
        return asset_id

    def _add_edge(
        self,
        source: str,
        target: str,
        relationship: str,
        evidence: str,
        finding_id: str,
        source_tool: str,
        discovered_from: list[str],
        artifact_type: str,
        validation_checks: list[str],
        v: ValidationResult | None,
        *,
        is_inventory: bool = False,
        source_count: int = 1,
        confidence_override: int | None = None,
        is_cve_candidate: bool = False,
        confidence_proof: dict | None = None,
    ) -> None:
        ev_tier = tier_for_edge(source_tool, artifact_type, is_inventory=is_inventory)
        if confidence_override is not None:
            conf = confidence_override
            breakdown = [f"confidence_model={conf}%"]
        elif is_inventory:
            # Phase E: inventory edge strengths are named, documented evidence
            # tiers (surfaced in the edge ConfidenceProof). Values unchanged.
            if artifact_type == "service_fingerprint":
                conf = INVENTORY_EDGE_CONFIDENCE["service_fingerprint"]
                breakdown = [f"+{conf} nmap service fingerprint with version"]
            elif artifact_type == "open_port":
                conf = INVENTORY_EDGE_CONFIDENCE["open_port"]
                breakdown = [f"+{conf} nmap open port confirmed"]
            else:
                conf = INVENTORY_EDGE_CONFIDENCE["default"]
                breakdown = [f"+{conf} scan inventory edge"]
        else:
            conf, breakdown = edge_confidence(
                has_finding=bool(finding_id),
                has_evidence=bool(str(evidence).strip()),
                validation_checks=validation_checks,
                validation=v,
                source_count=source_count,
            )

        proof_edge = ProofEdge(
            source=source,
            target=target,
            relationship=relationship,
            evidence=evidence,
            finding_id=finding_id,
            source_tool=source_tool,
            discovered_from=discovered_from,
            artifact_type=artifact_type,
            confidence=conf,
            validation_checks=validation_checks,
            evidence_tier=ev_tier.value,
            evidence_type=artifact_type,
            evidence_source=source_tool,
        )

        if not finding_id:
            proof_edge.accepted = False
            proof_edge.reject_reason = "no finding_id"
            self._proof.rejected_edges.append(proof_edge)
            return
        if not str(evidence).strip():
            proof_edge.accepted = False
            proof_edge.reject_reason = "no evidence artifact"
            self._proof.rejected_edges.append(proof_edge)
            return
        if not discovered_from:
            proof_edge.accepted = False
            proof_edge.reject_reason = "no discovered_from proof"
            self._proof.rejected_edges.append(proof_edge)
            return
        min_conf = 35 if is_cve_candidate else MIN_EDGE_CONFIDENCE
        if conf < min_conf:
            if artifact_type in ("cve_verified", "cve_enrichment") and source_tool == "cve_catalog":
                conf = max(conf, MIN_EDGE_CONFIDENCE)
                breakdown.append(f"+{MIN_EDGE_CONFIDENCE} verified CVE applicability")
            else:
                proof_edge.accepted = False
                proof_edge.reject_reason = f"confidence {conf}% below threshold {min_conf}%"
                self._proof.rejected_edges.append(proof_edge)
                return

        proof_edge.confidence = conf

        # Phase E: every accepted edge emits a ConfidenceProof. Use the rich
        # proof from exploit applicability when available, else synthesize one
        # from this edge's factors. No edge confidence without a proof.
        edge_proof = confidence_proof or _edge_confidence_proof(
            conf, breakdown, source_tool, artifact_type
        )
        if edge_proof.get("normalized_score") != conf:
            edge_proof = {**edge_proof, "normalized_score": conf}
        proof_edge.confidence_proof = edge_proof

        self._g.add_edge(
            source,
            target,
            edge_id=uuid.uuid4().hex[:12],
            relationship=relationship,
            evidence=evidence,
            finding_id=finding_id,
            source_tool=source_tool,
            discovered_from=discovered_from,
            artifact_type=artifact_type,
            confidence_contribution=conf,
            confidence_breakdown=breakdown,
            validation_checks=validation_checks,
            evidence_tier=ev_tier.value,
            evidence_type=artifact_type,
            evidence_source=source_tool,
            evidence_confidence=conf,
            confidence_proof=edge_proof,
        )
        self._proof.edges.append(proof_edge)


def _edge_confidence_proof(
    conf: int, breakdown: list[str], source_tool: str, artifact_type: str
) -> dict:
    """Synthesize a ConfidenceProof dict for edges that don't carry a richer
    one (inventory, validation-derived, override). Every factor is named and the
    edge's own breakdown is the explanation — no hidden calculation."""
    from vayne.attack_paths.confidence_proof import ConfidenceProof

    proof = ConfidenceProof(
        formula="edge_confidence = evidence-derived (see breakdown)",
        explanation=list(breakdown),
    )
    proof.add(
        "edge_evidence_model",
        round(conf / 100.0, 4),
        conf,
        evidence=[f"source_tool={source_tool or 'n/a'}", f"artifact={artifact_type or 'n/a'}"],
    )
    proof.finalize(raw_score=conf, normalized_score=conf)
    return proof.to_dict()


def _validation_checks(v: ValidationResult) -> list[str]:
    checks: list[str] = []
    if v.host_alive:
        checks.append("host verified")
    if v.port_open:
        checks.append("service verified")
    if v.service_exists:
        checks.append("service identified")
    if getattr(v, "service_fingerprinted", False):
        checks.append("software fingerprinted")
    if v.version_matches:
        checks.append("version confirmed")
    if v.cve_applicable:
        checks.append("CVE confirmed")
    if v.prerequisites_met:
        checks.append("exploit prerequisites met")
    if v.reproducible:
        checks.append("reproduced by second tool")
    if v.privilege_escalation_possible:
        checks.append("privilege escalation evidenced")
    if v.lateral_movement_possible:
        checks.append("lateral movement evidenced")
    if v.reachable:
        checks.append("target reachable")
    return checks


def _discovered_from_finding(cf: CorrelatedFinding) -> list[str]:
    parts = [f"{cf.title} ({cf.sources[0] if cf.sources else 'scan'})"]
    if cf.cve:
        parts.append(f"CVE {cf.cve}")
    if cf.evidence:
        parts.append(cf.evidence[0][:200])
    return parts
