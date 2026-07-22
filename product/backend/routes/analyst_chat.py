"""Ask VAYNE — streaming analyst chat over investigation context."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from product.backend.deps import get_investigation_service
from product.backend.schemas.analyst_chat import AnalystChatRequest
from product.backend.services.analyst_context import build_analyst_context
from product.backend.services.analyst_llm import (
    analyst_status,
    stream_analyst_reply,
    stream_investigation_brief,
)
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api", tags=["analyst"])


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
        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def _brief_stream(inv_id: str, svc: InvestigationService):
    context = build_analyst_context(svc, inv_id)
    export_dir = svc.export_dir(inv_id)

    async for event in stream_investigation_brief(context, export_dir):
        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def _general_stream(body: AnalystChatRequest):
    """Chat with no investigation loaded — general cybersecurity Q&A.

    The LLM answers from its own expertise; there is no scan context to ground
    scan-specific claims in, so we pass an empty context and skip caching.
    """
    history = [{"role": t.role, "content": t.content} for t in body.history]
    async for event in stream_analyst_reply(
        {},
        body.message.strip(),
        history,
        report_mode=body.report_mode,
        preset_id=body.preset_id,
        export_dir=None,
    ):
        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.get("/analyst/status")
async def get_analyst_status():
    return await analyst_status()


@router.post("/chat")
async def general_chat(body: AnalystChatRequest):
    """Ask VAYNE without an investigation — available from an empty workspace."""
    return StreamingResponse(
        _general_stream(body),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
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
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/investigation/{inv_id}/chat")
async def analyst_chat(
    inv_id: str,
    body: AnalystChatRequest,
    svc: InvestigationService = Depends(get_investigation_service),
):
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")

    return StreamingResponse(
        _event_stream(inv_id, body, svc),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
