"""Schemas for Ask VAYNE analyst chat."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=16000)


ReportMode = Literal["executive", "technical", "remediation", "audit"]


class AnalystChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=40)
    report_mode: ReportMode | None = None
    preset_id: str | None = Field(default=None, max_length=64)
