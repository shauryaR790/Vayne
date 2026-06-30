"""Investigation persistence — stores VAYNE engine output verbatim."""

from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from product.backend.models.investigation import (
    AttackPathORM,
    FindingORM,
    GraphEdgeORM,
    GraphNodeORM,
    InvestigationORM,
)
from product.backend.services.investigation_key import (
    build_investigation_summary,
    compute_investigation_key,
    normalize_source_filename,
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


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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
        source_filename: str | None = None,
    ) -> InvestigationORM:
        source = source_filename or _derive_source_filename(uploaded_paths, name)
        work_dir = self.storage_root / f"_work_{uuid.uuid4().hex}"
        cleanup_dir: Path | None = work_dir

        try:
            report = analyze(name, uploaded_paths, work_dir, proof=proof)
            findings_json = self._load_json(work_dir / "findings.json", {})
            attack_paths_json = self._load_json(work_dir / "attack_paths.json", [])
            validated = findings_json.get("validated") or []
            risk_score = report.attack_surface_score
            investigation_key = compute_investigation_key(
                source,
                validated,
                attack_paths_json,
                risk_score,
            )
            summary = build_investigation_summary(validated, attack_paths_json)

            existing = (
                self.db.query(InvestigationORM)
                .filter(InvestigationORM.investigation_key == investigation_key)
                .order_by(InvestigationORM.updated_at.desc(), InvestigationORM.created_at.desc())
                .first()
            )

            if existing:
                print("existing investigation found", flush=True)
                inv = existing
                inv.status = "running"
                inv.summary = summary
                inv.source_filename = normalize_source_filename(source) or source
                inv.updated_at = _utcnow()
                self.db.commit()

                export_dir = self.export_dir(inv.id)
                self._replace_export_dir(work_dir, export_dir)

                self._clear_children(inv)
                self._persist(inv, report, export_dir)
                inv.status = "complete"
            else:
                print("creating new investigation", flush=True)
                inv_id = str(uuid.uuid4())
                export_dir = self.storage_root / inv_id
                if export_dir.exists():
                    shutil.rmtree(export_dir)
                shutil.move(str(work_dir), str(export_dir))
                cleanup_dir = None

                now = _utcnow()
                inv = InvestigationORM(
                    id=inv_id,
                    name=name,
                    status="running",
                    investigation_key=investigation_key,
                    source_filename=normalize_source_filename(source) or source,
                    summary=summary,
                    created_at=now,
                    updated_at=now,
                )
                self.db.add(inv)
                self.db.commit()
                self._persist(inv, report, export_dir)
                inv.status = "complete"

            self.db.commit()
            self.db.refresh(inv)
            return inv
        except Exception:
            self.db.rollback()
            raise
        finally:
            if cleanup_dir is not None and cleanup_dir.exists():
                shutil.rmtree(cleanup_dir, ignore_errors=True)

    def _clear_children(self, inv: InvestigationORM) -> None:
        inv.attack_paths.clear()
        inv.graph_nodes.clear()
        inv.graph_edges.clear()
        inv.findings.clear()
        self.db.flush()

    @staticmethod
    def _replace_export_dir(src: Path, dest: Path) -> None:
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)

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
        inv.updated_at = _utcnow()

        attack_paths_json = self._load_json(export_dir / "attack_paths.json", [])
        graph_json = self._load_json(export_dir / "graph.json", {})
        findings_json = self._load_json(export_dir / "findings.json", {})
        inv.summary = build_investigation_summary(
            findings_json.get("validated") or [],
            attack_paths_json,
        )

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

    def find_by_investigation_key(self, key: str) -> InvestigationORM | None:
        return (
            self.db.query(InvestigationORM)
            .filter(InvestigationORM.investigation_key == key)
            .order_by(InvestigationORM.updated_at.desc(), InvestigationORM.created_at.desc())
            .first()
        )

    def list_investigations(self, limit: int = 100) -> list[dict]:
        rows = (
            self.db.query(InvestigationORM)
            .order_by(
                InvestigationORM.updated_at.desc(),
                InvestigationORM.created_at.desc(),
            )
            .limit(limit)
            .all()
        )
        items: list[dict] = []
        for inv in rows:
            report = self.get_report_view(inv.id) or {}
            stats = report.get("stats") or {}
            paths = self.get_attack_paths_export(inv.id)
            avg_conf = None
            if paths:
                scores: list[int] = []
                for p in paths:
                    conf = p.get("confidence")
                    if isinstance(conf, dict):
                        scores.append(int(conf.get("score", 0)))
                    elif conf is not None:
                        scores.append(int(conf))
                if scores:
                    avg_conf = round(sum(scores) / len(scores))
            items.append(
                {
                    "id": inv.id,
                    "name": inv.name,
                    "created_at": inv.created_at,
                    "updated_at": inv.updated_at or inv.created_at,
                    "status": inv.status,
                    "attack_surface_score": inv.attack_surface_score,
                    "attack_surface_classification": inv.attack_surface_classification,
                    "path_count": inv.path_count,
                    "critical_count": inv.critical_count,
                    "target": str(report.get("target") or inv.name),
                    "duration_seconds": float(report.get("duration_seconds") or 0),
                    "findings_retained": int(stats.get("findings_retained") or 0),
                    "avg_confidence": avg_conf,
                    "summary": inv.summary or "",
                    "source_filename": inv.source_filename or "",
                }
            )
        return items

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

    def delete_investigation(self, inv_id: str) -> None:
        inv = self.get_investigation(inv_id)
        if not inv:
            return
        export_dir = self.export_dir(inv_id)
        self.db.delete(inv)
        self.db.commit()
        if export_dir.exists():
            shutil.rmtree(export_dir, ignore_errors=True)


def _derive_source_filename(uploaded_paths: list[Path], fallback_name: str) -> str:
    names = [p.name for p in uploaded_paths if p.name]
    if names:
        return ",".join(sorted(names))
    return fallback_name
