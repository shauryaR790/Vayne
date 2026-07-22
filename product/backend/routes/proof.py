"""Proof artifact download."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse

from product.backend.deps import get_investigation_service
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api", tags=["proof"])


@router.get("/investigation/{inv_id}/proof")
def get_proof(
    inv_id: str,
    svc: InvestigationService = Depends(get_investigation_service),
):
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    proof_path = svc.export_dir(inv_id) / "proof.txt"
    if not proof_path.exists():
        raise HTTPException(status_code=404, detail="Proof not found")
    return PlainTextResponse(proof_path.read_text(encoding="utf-8"))


@router.get("/investigation/{inv_id}/artifact/{filename}")
def get_artifact(
    inv_id: str,
    filename: str,
    svc: InvestigationService = Depends(get_investigation_service),
):
    allowed = {
        "graph.json", "attack_paths.json", "findings.json", "investigation.json",
        "executive_report.md", "analyst_report.md", "remediation_plan.json",
        "attack_story.md", "proof.txt",
    }
    if filename not in allowed:
        raise HTTPException(status_code=400, detail="Artifact not allowed")
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    path = svc.export_dir(inv_id) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact not found")
    return FileResponse(path)
