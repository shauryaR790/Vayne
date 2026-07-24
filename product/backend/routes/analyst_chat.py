"""Ask VAYNE — streaming analyst chat over investigation context."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from product.backend.auth import resolve_workspace_id
from product.backend.db.session import get_db
from product.backend.deps import get_investigation_service
from product.backend.schemas.analyst_chat import AnalystChatRequest
from product.backend.security.middleware import client_ip
from product.backend.services.analyst_context import build_analyst_context
from product.backend.services.analyst_llm import (
    analyst_status,
    stream_analyst_reply,
    stream_investigation_brief,
)
from product.backend.services.chat_quota import (
    FREE_TIER_MESSAGE_LIMIT,
    QUOTA_EXCEEDED_CODE,
    QUOTA_EXCEEDED_MESSAGE,
    build_quota_key,
    consume_chat_quota,
    get_quota_status,
)
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api", tags=["analyst"])


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def _quota_exceeded_stream(status_used: int, status_limit: int):
    yield _sse(
        {
            "type": "error",
            "code": QUOTA_EXCEEDED_CODE,
            "message": QUOTA_EXCEEDED_MESSAGE,
            "used": status_used,
            "limit": status_limit,
            "remaining": 0,
        }
    )


async def _event_stream(inv_id: str, body: AnalystChatRequest, svc: InvestigationService):
    context = build_analyst_context(svc, inv_id)
    history = [{"role": t.role, "content": t.content} for t in body.history]
    export_dir = svc.export_dir(inv_id)

    async for event in stream_analyst_reply(
        context,
        body.message.strip(),
        history,
        report_mode=body.report_mode,
        preset_id=body.preset_id,
        export_dir=export_dir,
    ):
        yield _sse(event)


async def _brief_stream(inv_id: str, svc: InvestigationService):
    context = build_analyst_context(svc, inv_id)
    export_dir = svc.export_dir(inv_id)

    async for event in stream_investigation_brief(context, export_dir):
        yield _sse(event)


async def _general_stream(body: AnalystChatRequest):
    """Chat with no investigation loaded — cybersecurity Q&A only."""
    history = [{"role": t.role, "content": t.content} for t in body.history]
    async for event in stream_analyst_reply(
        {},
        body.message.strip(),
        history,
        report_mode=body.report_mode,
        preset_id=body.preset_id,
        export_dir=None,
    ):
        yield _sse(event)


_SSE_HEADERS = {
    "Cache-Control": "no-cache, no-store",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _consume_or_block(db: Session, workspace_id: str, request: Request):
    key = build_quota_key(workspace_id=workspace_id, client_ip=client_ip(request))
    return consume_chat_quota(db, key), key


@router.get("/analyst/status")
async def get_analyst_status():
    """Public readiness probe — never returns secrets or raw provider errors."""
    status = await analyst_status()
    # Keep the surface minimal for recon resistance.
    return {
        "online": bool(status.get("online")),
        "configured": bool(status.get("configured")),
        "provider": "vayne",
        "model": "analyst",
    }


@router.get("/chat/quota")
async def chat_quota(
    request: Request,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(resolve_workspace_id),
):
    key = build_quota_key(workspace_id=workspace_id, client_ip=client_ip(request))
    status = get_quota_status(db, key)
    return {
        "used": status.used,
        "limit": status.limit,
        "remaining": status.remaining,
        "allowed": status.allowed,
    }


@router.post("/chat")
async def general_chat(
    body: AnalystChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(resolve_workspace_id),
):
    """Ask VAYNE without an investigation — free-tier message quota enforced server-side."""
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message required")

    status, _ = _consume_or_block(db, workspace_id, request)
    if not status.allowed:
        return StreamingResponse(
            _quota_exceeded_stream(status.used, status.limit),
            media_type="text/event-stream",
            headers={
                **_SSE_HEADERS,
                "X-Vayne-Chat-Remaining": "0",
                "X-Vayne-Chat-Limit": str(FREE_TIER_MESSAGE_LIMIT),
            },
        )

    return StreamingResponse(
        _general_stream(body),
        media_type="text/event-stream",
        headers={
            **_SSE_HEADERS,
            "X-Vayne-Chat-Remaining": str(status.remaining),
            "X-Vayne-Chat-Limit": str(status.limit),
        },
    )


@router.get("/investigation/{inv_id}/brief")
async def investigation_brief(
    inv_id: str,
    svc: InvestigationService = Depends(get_investigation_service),
):
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")

    return StreamingResponse(
        _brief_stream(inv_id, svc),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/investigation/{inv_id}/chat")
async def analyst_chat(
    inv_id: str,
    body: AnalystChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(resolve_workspace_id),
    svc: InvestigationService = Depends(get_investigation_service),
):
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message required")

    status, _ = _consume_or_block(db, workspace_id, request)
    if not status.allowed:
        return StreamingResponse(
            _quota_exceeded_stream(status.used, status.limit),
            media_type="text/event-stream",
            headers={
                **_SSE_HEADERS,
                "X-Vayne-Chat-Remaining": "0",
                "X-Vayne-Chat-Limit": str(FREE_TIER_MESSAGE_LIMIT),
            },
        )

    return StreamingResponse(
        _event_stream(inv_id, body, svc),
        media_type="text/event-stream",
        headers={
            **_SSE_HEADERS,
            "X-Vayne-Chat-Remaining": str(status.remaining),
            "X-Vayne-Chat-Limit": str(status.limit),
        },
    )
