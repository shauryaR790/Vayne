"""Single attack path detail."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from product.backend.config import get_storage_root
from product.backend.db.session import get_db
from product.backend.schemas.investigation import PathDetail
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api", tags=["attack_paths"])


@router.get("/path/{path_id}", response_model=PathDetail)
def get_path(path_id: str, db: Session = Depends(get_db)) -> PathDetail:
    svc = InvestigationService(db, get_storage_root())
    ap = svc.get_attack_path(path_id)
    if not ap:
        raise HTTPException(status_code=404, detail="Attack path not found")

    proof = json.loads(ap.proof or "{}")
    story = json.loads(ap.story or "{}")
    mitre = json.loads(ap.mitre or "{}")
    engine = svc.get_engine_path(path_id) or {}
    narrative = story.get("narrative") or engine.get("title") or ""

    tactics = mitre.get("tactics") or engine.get("mitre_tactics") or []
    techniques = mitre.get("techniques") or engine.get("mitre_techniques") or []

    return PathDetail(
        id=ap.id,
        investigation_id=ap.investigation_id,
        stable_id=ap.stable_id or engine.get("stable_id", ""),
        confidence={
            "score": ap.confidence,
            "proof": proof.get("confidence_proof") or engine.get("confidence_proof") or {},
        },
        risk={
            "score": ap.risk,
            "proof": proof.get("risk_proof") or engine.get("risk_proof") or {},
        },
        proof={
            "accepted": proof.get("accepted_proof") or engine.get("accepted_proof") or {},
            "category": proof.get("attack_category_proof") or engine.get("attack_category_proof") or {},
        },
        story=story or engine.get("attack_story") or {},
        mitre=tactics + techniques,
        mitre_tactics=tactics,
        mitre_techniques=techniques,
        category=ap.category or engine.get("attack_category", ""),
        title=narrative[:120],
        blast_radius=int(engine.get("blast_radius") or 0),
        attacker_effort=engine.get("attacker_effort") or "",
        capability_chain=engine.get("capability_chain") or [],
        nodes=engine.get("nodes") or [],
        edges=engine.get("edges") or [],
    )
