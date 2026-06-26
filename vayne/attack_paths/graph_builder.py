"""Build strict evidence graph — every node is a concrete scan artifact."""

from __future__ import annotations

import uuid

import networkx as nx

from vayne.attack_paths.artifact_links import build_validated_links
from vayne.attack_paths.artifacts import find_cross_host_links
from vayne.attack_paths.evidence_entities import extract_entities
from vayne.attack_paths.formulas import MIN_EDGE_CONFIDENCE, edge_confidence
from vayne.attack_paths.graph_filters import is_security_finding
from vayne.attack_paths.proof import GraphProof, ProofEdge, ProofNode
from vayne.attack_paths.software import SoftwareFingerprint, dedupe_software
from vayne.models import (
    Asset,
    AssetService,
    Classification,
    CorrelatedFinding,
    DiscoveredAsset,
    Finding,
    ValidationResult,
)


ALLOWED_NODE_TYPES = frozenset({
    "asset", "service", "software", "endpoint",
    "vulnerability", "credential", "identity", "database",
})


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

        return self._g

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
        self._g.add_node(
            nid,
            label="internet",
            node_type="endpoint",
            is_entry=True,
            evidence=["External attack surface entry point"],
            finding_ids=[],
        )
        self._proof.nodes.append(
            ProofNode(id=nid, label="internet", node_type="endpoint", evidence=["External attack surface entry point"])
        )

    def _add_asset(self, asset: Asset) -> None:
        self._ensure_discovered_asset(asset)
        nid = f"asset:{asset.host}"
        evidence = [f"Host {asset.host} discovered in scan"]
        if asset.ip:
            evidence.append(f"IP {asset.ip}")
        self._g.add_node(
            nid,
            label=asset.host,
            node_type="asset",
            evidence=evidence,
            finding_ids=[],
            ip=asset.ip,
        )
        self._proof.nodes.append(
            ProofNode(id=nid, label=asset.host, node_type="asset", evidence=evidence)
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
            if svc_id not in self._g:
                self._g.add_node(
                    svc_id,
                    label=label,
                    node_type="service",
                    evidence=[ev],
                    finding_ids=[],
                    host=asset.host,
                    port=port,
                )
                self._proof.nodes.append(
                    ProofNode(id=svc_id, label=label, node_type="service", evidence=[ev])
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
        for fp in fingerprints:
            sw_id = fp.node_id(asset.host)
            label = fp.label()
            ev = f"Nmap service fingerprint: {label}"
            if sw_id not in self._g:
                self._g.add_node(
                    sw_id,
                    label=label,
                    node_type="software",
                    evidence=[ev],
                    finding_ids=[],
                    host=asset.host,
                    vendor=fp.vendor,
                    product=fp.product,
                    version=fp.version,
                )
                self._proof.nodes.append(
                    ProofNode(id=sw_id, label=label, node_type="software", evidence=[ev])
                )
            parent_ports = [
                f"service:{asset.host}:{port}"
                for port in asset.ports
                if f"service:{asset.host}:{port}" in self._g
            ] or [asset_id]
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
            for port in asset.ports:
                if port in port_services:
                    port_services[port].software = label

        if port_services:
            rec.services = list(port_services.values())

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
        self._g.add_node(
            vuln_id,
            label=vuln_label,
            node_type="vulnerability",
            evidence=vuln_evidence,
            finding_ids=[cf.id],
        )
        self._proof.nodes.append(
            ProofNode(
                id=vuln_id,
                label=vuln_label,
                node_type="vulnerability",
                evidence=vuln_evidence,
                finding_ids=[cf.id],
            )
        )
        rec.vulnerabilities.append(vuln_label)

        checks = _validation_checks(validation)
        src_count = len(cf.sources) if cf.sources else 1

        entities = extract_entities(cf, asset)
        for ent in entities:
            if ent.node_type not in ALLOWED_NODE_TYPES:
                continue
            if ent.node_id not in self._g:
                self._g.add_node(
                    ent.node_id,
                    label=ent.label,
                    node_type=ent.node_type,
                    evidence=[ent.evidence],
                    finding_ids=[cf.id],
                )
                self._proof.nodes.append(
                    ProofNode(
                        id=ent.node_id,
                        label=ent.label,
                        node_type=ent.node_type,
                        evidence=[ent.evidence],
                        finding_ids=[cf.id],
                    )
                )

        source_tool = cf.sources[0] if cf.sources else "scan"
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

    def _vuln_parent(
        self,
        asset_id: str,
        cf: CorrelatedFinding,
        asset: Asset | None,
    ) -> str:
        host = cf.host
        if asset:
            for fp in dedupe_software(host, asset.technologies):
                sw_id = fp.node_id(host)
                if sw_id in self._g:
                    return sw_id
        if cf.port:
            port_id = f"service:{host}:{cf.port}"
            if port_id in self._g:
                return port_id
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
    ) -> None:
        if is_inventory:
            conf = 55
            breakdown = ["+55 host verified in scan scope"]
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
        if conf < MIN_EDGE_CONFIDENCE:
            proof_edge.accepted = False
            proof_edge.reject_reason = f"confidence {conf}% below threshold {MIN_EDGE_CONFIDENCE}%"
            self._proof.rejected_edges.append(proof_edge)
            return

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
        )
        self._proof.edges.append(proof_edge)


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
