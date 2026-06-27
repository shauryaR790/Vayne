"""Investigation persistence — stores VAYNE engine output verbatim."""

from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from product.backend.models.investigation import (
    AttackPathORM,
    FindingORM,
    GraphEdgeORM,
    GraphNodeORM,
    InvestigationORM,
)
from product.backend.services.vayne_runner import analyze
from vayne.models import InvestigationReport

EXPORT_ARTIFACTS = (
    "investigation.json",
    "graph.json",
    "attack_paths.json",
    "findings.json",
    "proof.txt",
    "executive_report.md",
    "analyst_report.md",
    "remediation_plan.json",
)


class InvestigationService:
    def __init__(self, db: Session, storage_root: Path):
        self.db = db
        self.storage_root = storage_root
        self.storage_root.mkdir(parents=True, exist_ok=True)

    def run_analysis(
        self,
        name: str,
        uploaded_paths: list[Path],
        *,
        proof: bool = True,
    ) -> InvestigationORM:
        inv_id = str(uuid.uuid4())
        export_dir = self.storage_root / inv_id
        export_dir.mkdir(parents=True, exist_ok=True)

        inv = InvestigationORM(id=inv_id, name=name, status="running")
        self.db.add(inv)
        self.db.commit()

        try:
            report = analyze(name, uploaded_paths, export_dir, proof=proof)
            self._persist(inv, report, export_dir)
            inv.status = "complete"
        except Exception:
            inv.status = "failed"
            raise
        finally:
            self.db.commit()
            self.db.refresh(inv)
        return inv

    def _persist(
        self,
        inv: InvestigationORM,
        report: InvestigationReport,
        export_dir: Path,
    ) -> None:
        inv.attack_surface_score = report.attack_surface_score
        inv.attack_surface_classification = report.attack_surface_classification
        inv.path_count = len(report.attack_paths)
        inv.critical_count = sum(
            1 for p in report.attack_paths if p.risk_score >= 8.0
        )
        inv.raw_report_path = str(export_dir / "investigation.json")

        attack_paths_json = self._load_json(export_dir / "attack_paths.json", [])
        graph_json = self._load_json(export_dir / "graph.json", {})
        findings_json = self._load_json(export_dir / "findings.json", {})

        for item in attack_paths_json:
            proof_bundle = {
                "confidence_proof": item.get("confidence_proof", {}),
                "risk_proof": item.get("risk_proof", {}),
                "accepted_proof": item.get("accepted_proof", {}),
                "attack_category_proof": item.get("attack_category_proof", {}),
            }
            ap = AttackPathORM(
                investigation_id=inv.id,
                stable_id=item.get("stable_id", ""),
                engine_path_id=item.get("id", ""),
                confidence=int(item.get("confidence", 0)),
                risk=float(item.get("risk", 0)),
                category=item.get("attack_category", ""),
                mitre=json.dumps({
                    "tactics": item.get("mitre_tactics", []),
                    "techniques": item.get("mitre_techniques", []),
                }),
                story=json.dumps(item.get("attack_story", {})),
                proof=json.dumps(proof_bundle),
            )
            self.db.add(ap)

        for node in graph_json.get("nodes", []):
            self.db.add(
                GraphNodeORM(
                    investigation_id=inv.id,
                    node_id=node.get("id", ""),
                    node_type=node.get("type", ""),
                    data=json.dumps(node),
                )
            )

        for edge in graph_json.get("edges", []):
            self.db.add(
                GraphEdgeORM(
                    investigation_id=inv.id,
                    source=edge.get("source", ""),
                    target=edge.get("target", ""),
                    data=json.dumps(edge),
                )
            )

        for section in ("validated", "rejected"):
            for f in findings_json.get(section, []):
                self.db.add(
                    FindingORM(
                        investigation_id=inv.id,
                        finding_id=f.get("id", f.get("title", "")),
                        severity=f.get("classification", section),
                        classification=f.get("classification", section),
                        data=json.dumps(f),
                    )
                )

    @staticmethod
    def _load_json(path: Path, default):
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))

    def get_investigation(self, inv_id: str) -> InvestigationORM | None:
        return self.db.get(InvestigationORM, inv_id)

    def get_attack_path(self, path_id: str) -> AttackPathORM | None:
        return self.db.get(AttackPathORM, path_id)

    def list_paths(self, inv_id: str) -> list[AttackPathORM]:
        inv = self.get_investigation(inv_id)
        if not inv:
            return []
        return sorted(
            inv.attack_paths,
            key=lambda p: (-p.risk, -p.confidence, p.stable_id),
        )

    def get_graph(self, inv_id: str) -> dict:
        inv = self.get_investigation(inv_id)
        if not inv:
            return {"nodes": [], "edges": []}
        nodes = [json.loads(n.data) for n in inv.graph_nodes]
        edges = [json.loads(e.data) for e in inv.graph_edges]
        return {"nodes": nodes, "edges": edges}

    def export_dir(self, inv_id: str) -> Path:
        return self.storage_root / inv_id

    def artifact_exists(self, inv_id: str, name: str) -> bool:
        return (self.export_dir(inv_id) / name).exists()

    def load_artifact(self, inv_id: str, name: str):
        path = self.export_dir(inv_id) / name
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def get_report_view(self, inv_id: str) -> dict | None:
        return self.load_artifact(inv_id, "investigation.json")

    def get_findings_export(self, inv_id: str) -> dict:
        return self.load_artifact(inv_id, "findings.json") or {
            "validated": [],
            "rejected": [],
        }

    def get_remediation_export(self, inv_id: str) -> dict:
        return self.load_artifact(inv_id, "remediation_plan.json") or {
            "items": [],
            "total_items": 0,
        }

    def get_full_graph(self, inv_id: str) -> dict:
        disk = self.load_artifact(inv_id, "graph.json")
        if disk:
            return disk
        g = self.get_graph(inv_id)
        return {
            "nodes": g["nodes"],
            "edges": g["edges"],
            "attack_paths": [],
            "statistics": {},
        }

    def get_attack_paths_export(self, inv_id: str) -> list[dict]:
        data = self.load_artifact(inv_id, "attack_paths.json")
        return data if isinstance(data, list) else []

    def get_engine_path(self, path_id: str) -> dict | None:
        ap = self.get_attack_path(path_id)
        if not ap:
            return None
        for item in self.get_attack_paths_export(ap.investigation_id):
            if item.get("stable_id") == ap.stable_id or item.get("id") == ap.engine_path_id:
                return item
        return None
