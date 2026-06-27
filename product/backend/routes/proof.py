"""Proof artifact download."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session

from product.backend.config import get_storage_root
from product.backend.db.session import get_db
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api", tags=["proof"])


@router.get("/investigation/{inv_id}/proof")
def get_proof(inv_id: str, db: Session = Depends(get_db)):
    svc = InvestigationService(db, get_storage_root())
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    proof_path = svc.export_dir(inv_id) / "proof.txt"
    if not proof_path.exists():
        raise HTTPException(status_code=404, detail="Proof not found")
    return PlainTextResponse(proof_path.read_text(encoding="utf-8"))


@router.get("/investigation/{inv_id}/artifact/{filename}")
def get_artifact(inv_id: str, filename: str, db: Session = Depends(get_db)):
    allowed = {
        "graph.json", "attack_paths.json", "findings.json", "investigation.json",
        "executive_report.md", "analyst_report.md", "remediation_plan.json",
        "attack_story.md", "proof.txt",
    }
    if filename not in allowed:
        raise HTTPException(status_code=400, detail="Artifact not allowed")
    svc = InvestigationService(db, get_storage_root())
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    path = svc.export_dir(inv_id) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact not found")
    return FileResponse(path)
