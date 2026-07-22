"""Extended investigation read endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from product.backend.deps import get_investigation_service
from product.backend.schemas.investigation import (
    AttackPathSummary,
    AttackSurfaceSummary,
    FindingsResponse,
    GraphResponse,
    ProgressiveGraphResponse,
    InvestigationDetail,
    InvestigationListResponse,
    InvestigationListItem,
    InvestigationReportView,
    InvestigationStats,
    InvestigationSummary,
    RemediationResponse,
)
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api", tags=["investigations"])


@router.get("/investigations", response_model=InvestigationListResponse)
def list_investigations(
    svc: InvestigationService = Depends(get_investigation_service),
) -> InvestigationListResponse:
    items = [InvestigationListItem(**row) for row in svc.list_investigations()]
    return InvestigationListResponse(investigations=items)


@router.get("/investigation/{inv_id}", response_model=InvestigationDetail)
def get_investigation(
    inv_id: str,
    svc: InvestigationService = Depends(get_investigation_service),
) -> InvestigationDetail:
    inv = svc.get_investigation(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    paths = svc.list_paths(inv_id)
    export_by_stable = {
        p.get("stable_id"): p for p in svc.get_attack_paths_export(inv_id)
    }
    return InvestigationDetail(
        summary=InvestigationSummary(
            id=inv.id,
            name=inv.name,
            created_at=inv.created_at,
            status=inv.status,
            attack_surface_score=inv.attack_surface_score,
            attack_surface_classification=inv.attack_surface_classification,
            path_count=inv.path_count,
            critical_count=inv.critical_count,
        ),
        attack_surface=AttackSurfaceSummary(
            score=inv.attack_surface_score,
            classification=inv.attack_surface_classification,
        ),
        attack_paths=[
            AttackPathSummary(
                id=p.id,
                stable_id=p.stable_id,
                confidence=p.confidence,
                risk=p.risk,
                category=p.category,
                title=json.loads(p.story).get("narrative", "")[:80] if p.story else "",
                blast_radius=int(
                    export_by_stable.get(p.stable_id, {}).get("blast_radius") or 0
                ),
                mitre_tactics=export_by_stable.get(p.stable_id, {}).get(
                    "mitre_tactics", []
                )[:2],
            )
            for p in paths
        ],
    )


@router.get("/investigation/{inv_id}/report", response_model=InvestigationReportView)
def get_report(
    inv_id: str,
    svc: InvestigationService = Depends(get_investigation_service),
) -> InvestigationReportView:
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    raw = svc.get_report_view(inv_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Investigation not found")
    stats_raw = raw.get("stats") or {}
    return InvestigationReportView(
        name=raw.get("name", ""),
        target=raw.get("target", ""),
        duration_seconds=float(raw.get("duration_seconds") or 0),
        stats=InvestigationStats(
            findings_loaded=int(stats_raw.get("findings_loaded") or 0),
            findings_correlated=int(stats_raw.get("findings_correlated") or 0),
            findings_retained=int(stats_raw.get("findings_retained") or 0),
            attack_paths=int(stats_raw.get("attack_paths") or 0),
            false_positives_removed=int(stats_raw.get("false_positives_removed") or 0),
            confirmed=int(stats_raw.get("confirmed") or 0),
            likely_exploitable=int(stats_raw.get("likely_exploitable") or 0),
            observed=int(stats_raw.get("observed") or 0),
            critical_count=int(stats_raw.get("critical_count") or 0),
            confidence_distribution=stats_raw.get("confidence_distribution") or {},
        ),
        attack_surface_score=int(raw.get("attack_surface_score") or 0),
        attack_surface_classification=raw.get("attack_surface_classification") or "",
        attack_surface_proof=raw.get("attack_surface_proof") or {},
        graph_proof=raw.get("graph_proof") or {},
        assets=raw.get("assets") or [],
        discovered_assets=raw.get("discovered_assets") or [],
    )


@router.get("/investigation/{inv_id}/workbench")
def get_workbench(
    inv_id: str,
    svc: InvestigationService = Depends(get_investigation_service),
):
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    data = svc.get_workbench(inv_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Workbench not found")
    return data


@router.get("/investigation/{inv_id}/findings", response_model=FindingsResponse)
def get_findings(
    inv_id: str,
    svc: InvestigationService = Depends(get_investigation_service),
) -> FindingsResponse:
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    data = svc.get_findings_export(inv_id)
    return FindingsResponse(
        validated=data.get("validated") or [],
        rejected=data.get("rejected") or [],
    )


@router.get("/investigation/{inv_id}/remediation", response_model=RemediationResponse)
def get_remediation(
    inv_id: str,
    svc: InvestigationService = Depends(get_investigation_service),
) -> RemediationResponse:
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    data = svc.get_remediation_export(inv_id)
    return RemediationResponse(
        items=data.get("items") or [],
        total_items=int(data.get("total_items") or len(data.get("items") or [])),
    )


@router.get("/investigation/{inv_id}/graph", response_model=GraphResponse)
def get_graph(
    inv_id: str,
    svc: InvestigationService = Depends(get_investigation_service),
) -> GraphResponse:
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    g = svc.get_full_graph(inv_id)
    return GraphResponse(
        nodes=g.get("nodes") or [],
        edges=g.get("edges") or [],
        attack_paths=g.get("attack_paths") or [],
        statistics=g.get("statistics") or {},
    )


@router.get("/investigation/{inv_id}/graph/progressive", response_model=ProgressiveGraphResponse)
def get_progressive_graph(
    inv_id: str,
    level: int = 1,
    parent_id: str | None = None,
    critical: bool = False,
    exploitable: bool = False,
    internet: bool = False,
    lateral: bool = False,
    svc: InvestigationService = Depends(get_investigation_service),
) -> ProgressiveGraphResponse:
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    filters = {
        k: v
        for k, v in {
            "critical": critical,
            "exploitable": exploitable,
            "internet": internet,
            "lateral": lateral,
        }.items()
        if v
    }
    data = svc.get_progressive_graph(
        inv_id,
        level=level,
        parent_id=parent_id,
        filters=filters or None,
    )
    if not data:
        raise HTTPException(status_code=404, detail="Progressive graph unavailable")
    return ProgressiveGraphResponse(**data)


@router.get("/investigation/{inv_id}/reports/{report_type}")
def get_report_markdown(
    inv_id: str,
    report_type: str,
    svc: InvestigationService = Depends(get_investigation_service),
):
    allowed = {"executive", "analyst", "attack_story", "remediation"}
    if report_type not in allowed:
        raise HTTPException(status_code=400, detail="Report type not allowed")
    filename = {
        "executive": "executive_report.md",
        "analyst": "analyst_report.md",
        "attack_story": "attack_story.md",
        "remediation": "remediation_plan.md",
    }[report_type]
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    path = svc.export_dir(inv_id) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return PlainTextResponse(path.read_text(encoding="utf-8"))
