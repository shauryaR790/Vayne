"""Investigation persistence — stores VAYNE engine output verbatim."""

from __future__ import annotations

import json
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from product.backend.logging_config import get_logger

logger = get_logger()

from product.backend.models.investigation import (
    AttackPathORM,
    FindingORM,
    GraphEdgeORM,
    GraphNodeORM,
    InvestigationORM,
)
from dataclasses import dataclass

from product.backend.services.investigation_key import (
    build_investigation_summary,
    compact_investigation_name,
    compute_investigation_key,
    normalize_source_filename,
)
from product.backend.services.investigation_mode import resolve_investigation_mode
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


@dataclass
class AnalysisBatchResult:
    mode: str
    investigation_group_id: str
    investigations: list[InvestigationORM]

    @property
    def primary(self) -> InvestigationORM:
        return self.investigations[0]


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
        investigation_group_id: str | None = None,
        mode: str = "combined",
        group_index: int = 0,
    ) -> InvestigationORM:
        source = source_filename or _derive_source_filename(uploaded_paths, name)
        display_name = compact_investigation_name(
            name,
            filenames=[p.name for p in uploaded_paths if p.name] or source.split(","),
        )
        stored_source = source
        work_dir = self.storage_root / f"_work_{uuid.uuid4().hex}"
        cleanup_dir: Path | None = work_dir

        stage_clock = {"last": time.perf_counter()}

        def _on_stage(index: int, label: str, detail: str) -> None:
            now = time.perf_counter()
            elapsed_ms = (now - stage_clock["last"]) * 1000
            stage_clock["last"] = now
            logger.info(
                "  \u2193 stage %d/%d | %-24s | %s (+%.0f ms)",
                index,
                7,
                label,
                detail,
                elapsed_ms,
            )

        try:
            engine_started = time.perf_counter()
            logger.info("Engine run started for %s", source)
            parse_cache_dir = self.storage_root / "parse_cache"
            report = analyze(
                name,
                uploaded_paths,
                work_dir,
                proof=proof,
                on_stage=_on_stage,
                cache_dir=parse_cache_dir,
            )
            logger.info(
                "Engine run finished for %s in %.0f ms",
                source,
                (time.perf_counter() - engine_started) * 1000,
            )
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
                inv.name = display_name
                inv.source_filename = stored_source
                inv.investigation_group_id = investigation_group_id or inv.investigation_group_id
                inv.mode = mode or inv.mode
                inv.group_index = group_index
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
                    shutil.rmtree(export_dir, ignore_errors=True)
                try:
                    shutil.move(str(work_dir), str(export_dir))
                except OSError:
                    shutil.copytree(work_dir, export_dir, dirs_exist_ok=True)
                cleanup_dir = None

                now = _utcnow()
                inv = InvestigationORM(
                    id=inv_id,
                    name=display_name,
                    status="running",
                    investigation_key=investigation_key,
                    source_filename=stored_source,
                    summary=summary,
                    investigation_group_id=investigation_group_id,
                    mode=mode,
                    group_index=group_index,
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
            logger.exception("Engine run failed for %s", source)
            self.db.rollback()
            raise
        finally:
            if cleanup_dir is not None and cleanup_dir.exists():
                shutil.rmtree(cleanup_dir, ignore_errors=True)

    def run_analysis_batch(
        self,
        name: str,
        uploads: list[tuple[Path, str]],
        *,
        prompt: str | None = None,
        explicit_mode: str | None = None,
        proof: bool = True,
    ) -> AnalysisBatchResult:
        """Run combined or per-file investigations before any cross-file correlation."""
        if not uploads:
            raise ValueError("No uploads provided")

        mode = resolve_investigation_mode(
            file_count=len(uploads),
            prompt=prompt,
            explicit=explicit_mode,
        )
        group_id = str(uuid.uuid4())
        investigations: list[InvestigationORM] = []

        if mode == "separate":
            for index, (path, original_name) in enumerate(uploads):
                inv = self.run_analysis(
                    name,
                    [path],
                    proof=proof,
                    source_filename=original_name,
                    investigation_group_id=group_id,
                    mode=mode,
                    group_index=index,
                )
                investigations.append(inv)
        else:
            paths = [path for path, _ in uploads]
            source = ",".join(sorted(original for _, original in uploads))
            inv = self.run_analysis(
                name,
                paths,
                proof=proof,
                source_filename=source,
                investigation_group_id=group_id,
                mode=mode,
                group_index=0,
            )
            investigations.append(inv)

        return AnalysisBatchResult(
            mode=mode,
            investigation_group_id=group_id,
            investigations=investigations,
        )

    def _clear_children(self, inv: InvestigationORM) -> None:
        inv.attack_paths.clear()
        inv.graph_nodes.clear()
        inv.graph_edges.clear()
        inv.findings.clear()
        self.db.flush()

    @staticmethod
    def _replace_export_dir(src: Path, dest: Path) -> None:
        """Replace export artifacts without deleting the parent folder (Windows-safe)."""
        if not dest.exists():
            shutil.copytree(src, dest)
            return

        staging = dest.parent / f"{dest.name}__staging_{uuid.uuid4().hex}"
        retired = dest.parent / f"{dest.name}__retired_{uuid.uuid4().hex}"
        shutil.copytree(src, staging)
        try:
            dest.rename(retired)
            staging.rename(dest)
            shutil.rmtree(retired, ignore_errors=True)
        except OSError:
            shutil.rmtree(staging, ignore_errors=True)
            InvestigationService._merge_export_dir(src, dest)

    @staticmethod
    def _merge_export_dir(src: Path, dest: Path) -> None:
        dest.mkdir(parents=True, exist_ok=True)
        for item in src.iterdir():
            target = dest / item.name
            if item.is_dir():
                shutil.rmtree(target, ignore_errors=True)
                shutil.copytree(item, target)
            else:
                try:
                    target.unlink(missing_ok=True)
                except OSError:
                    pass
                shutil.copy2(item, target)

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
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            return default
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return default

    def get_investigation(self, inv_id: str) -> InvestigationORM | None:
        return self.db.get(InvestigationORM, inv_id)

    def find_by_investigation_key(self, key: str) -> InvestigationORM | None:
        return (
            self.db.query(InvestigationORM)
            .filter(InvestigationORM.investigation_key == key)
            .order_by(InvestigationORM.updated_at.desc(), InvestigationORM.created_at.desc())
            .first()
        )

    def list_investigations(self, limit: int = 500) -> list[dict]:
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

    def list_investigations_in_group(self, group_id: str) -> list[InvestigationORM]:
        if not group_id:
            return []
        return (
            self.db.query(InvestigationORM)
            .filter(InvestigationORM.investigation_group_id == group_id)
            .order_by(InvestigationORM.group_index.asc(), InvestigationORM.created_at.asc())
            .all()
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
        disk = self.load_artifact(inv_id, "investigation.json")
        if disk:
            return disk
        return self.build_fallback_report_view(inv_id)

    def build_fallback_report_view(self, inv_id: str) -> dict | None:
        """Rebuild a report payload from DB when export artifacts are missing."""
        inv = self.get_investigation(inv_id)
        if not inv:
            return None

        findings = self.get_findings_export(inv_id)
        validated = findings.get("validated") or []
        rejected = findings.get("rejected") or []

        def _count_class(values: list[dict], needle: str) -> int:
            return sum(
                1
                for item in values
                if str(item.get("classification") or "").lower() == needle
            )

        stats = {
            "findings_loaded": len(validated) + len(rejected),
            "findings_correlated": len(validated),
            "findings_retained": len(validated),
            "attack_paths": inv.path_count,
            "false_positives_removed": len(rejected),
            "confirmed": _count_class(validated, "confirmed"),
            "likely_exploitable": _count_class(validated, "likely_exploitable"),
            "observed": _count_class(validated, "observed"),
            "critical_count": inv.critical_count,
            "confidence_distribution": {},
        }

        return {
            "name": inv.name,
            "target": inv.source_filename or inv.name,
            "duration_seconds": 0,
            "stats": stats,
            "attack_surface_score": inv.attack_surface_score,
            "attack_surface_classification": inv.attack_surface_classification,
            "attack_surface_proof": {},
            "graph_proof": {},
            "assets": [],
            "discovered_assets": [],
        }

    def get_workbench(self, inv_id: str) -> dict | None:
        """Rich analyst-workstation payload derived from engine exports."""
        from product.backend.services.investigation_workbench import build_workbench

        inv = self.get_investigation(inv_id)
        if not inv:
            return None
        report = self.get_report_view(inv_id) or {}
        graph = self.get_full_graph(inv_id)
        findings = self.get_findings_export(inv_id)
        remediation = self.get_remediation_export(inv_id)
        review = self.load_artifact(inv_id, "review.json")
        evidence_ledger = self.load_artifact(inv_id, "evidence_ledger.json")
        return build_workbench(
            report,
            graph,
            findings,
            source_filename=inv.source_filename or "",
            created_at=inv.created_at,
            remediation=remediation,
            review=review,
            evidence_ledger=evidence_ledger,
        )

    def get_findings_export(self, inv_id: str) -> dict:
        disk = self.load_artifact(inv_id, "findings.json")
        if disk:
            return disk

        inv = self.get_investigation(inv_id)
        if not inv or not inv.findings:
            return {"validated": [], "rejected": []}

        validated: list[dict] = []
        rejected: list[dict] = []
        for row in inv.findings:
            data = json.loads(row.data) if row.data else {}
            if row.severity == "rejected" or row.classification == "rejected":
                rejected.append(data)
            else:
                validated.append(data)
        return {"validated": validated, "rejected": rejected}

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

    def get_progressive_graph(
        self,
        inv_id: str,
        *,
        level: int = 1,
        parent_id: str | None = None,
        filters: dict | None = None,
    ) -> dict | None:
        from product.backend.services.investigation_progressive_graph import build_progressive_graph

        inv = self.get_investigation(inv_id)
        if not inv:
            return None
        graph = self.get_full_graph(inv_id)
        workbench = self.get_workbench(inv_id)
        return build_progressive_graph(
            graph=graph,
            workbench=workbench,
            level=level,
            parent_id=parent_id,
            filters=filters,
        )

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

    def reset_workspace(self) -> dict[str, int]:
        """Delete every investigation, related rows, and on-disk export artifacts."""
        rows = self.db.query(InvestigationORM).all()
        investigation_count = len(rows)
        for inv in rows:
            self.db.delete(inv)
        self.db.commit()

        storage_dirs_removed = 0
        storage_files_removed = 0
        if self.storage_root.exists():
            for child in list(self.storage_root.iterdir()):
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
                    storage_dirs_removed += 1
                elif child.is_file():
                    child.unlink(missing_ok=True)
                    storage_files_removed += 1

        return {
            "investigations_deleted": investigation_count,
            "storage_dirs_removed": storage_dirs_removed,
            "storage_files_removed": storage_files_removed,
        }


def _derive_source_filename(uploaded_paths: list[Path], fallback_name: str) -> str:
    names = [p.name for p in uploaded_paths if p.name]
    if names:
        return ",".join(sorted(names))
    return fallback_name
