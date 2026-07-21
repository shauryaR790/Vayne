"""Structured analyst action plans derived from engine evidence."""

from __future__ import annotations

from typing import Any


def build_action_plan(
    *,
    priority_queue: list[dict[str, Any]],
    confirmed_findings: list[dict[str, Any]],
    hypotheses: list[dict[str, Any]],
    missing_evidence: list[Any],
    next_actions: list[str],
    investigation_audit: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Concise, ordered validation steps for SOC analysts."""
    tasks: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(
        action: str,
        *,
        priority: str,
        finding_id: str = "",
        validation_type: str = "manual",
        expected_gain: str = "",
    ) -> None:
        key = action.strip().lower()
        if not key or key in seen:
            return
        seen.add(key)
        tasks.append(
            {
                "priority": priority,
                "action": action.strip(),
                "finding_id": finding_id,
                "validation_type": validation_type,
                "expected_gain": expected_gain,
            }
        )

    for item in priority_queue[:5]:
        tier = str(item.get("tier") or "Medium")
        fid = str(item.get("id") or "")
        missing = item.get("missing_evidence") or []
        if missing:
            add(
                str(missing[0]),
                priority=tier,
                finding_id=fid,
                validation_type="evidence_gap",
                expected_gain="Raises confidence or downgrades claim",
            )
        elif item.get("claim_status") in ("needs_validation", "suspected", "unknown"):
            add(
                f"Validate: {item.get('title')}",
                priority=tier,
                finding_id=fid,
                validation_type="exploit_validation",
                expected_gain="Confirm or reject suspected exposure",
            )
        else:
            add(
                f"Review: {item.get('title')}",
                priority=tier,
                finding_id=fid,
                validation_type="analyst_review",
            )

    for finding in confirmed_findings[:8]:
        inv = finding.get("investigation") or {}
        for task in (inv.get("investigation_tasks") or [])[:2]:
            label = str(task.get("label") or task.get("action") or "").strip()
            if label:
                add(
                    label,
                    priority="Medium",
                    finding_id=str(finding.get("id") or ""),
                    validation_type=str(task.get("dimension") or "investigation"),
                    expected_gain=str(task.get("expected_gain") or ""),
                )
        nb = inv.get("structured_notebook") or {}
        step = str(nb.get("recommended_next_step") or "").strip()
        if step:
            add(step, priority="Medium", finding_id=str(finding.get("id") or ""))

    for hyp in hypotheses[:3]:
        req = str(hyp.get("required_validation") or "").strip()
        if req:
            add(req, priority="Medium", validation_type="hypothesis")

    for item in missing_evidence[:4]:
        topic = item.get("topic") if isinstance(item, dict) else str(item)
        needed = item.get("evidence_needed", "") if isinstance(item, dict) else ""
        text = f"{topic}: {needed}".strip(": ") if needed else str(topic)
        if text:
            add(text, priority="Low", validation_type="missing_evidence")

    for action in next_actions[:4]:
        add(action, priority="Medium", validation_type="remediation")

    audit = investigation_audit or {}
    for flagged in (audit.get("flagged_findings") or [])[:3]:
        add(
            f"Self-review incomplete for {flagged.get('title')}: {flagged.get('issues')}",
            priority="High",
            finding_id=str(flagged.get("finding_id") or ""),
            validation_type="self_review",
        )

    return {
        "tasks": tasks[:16],
        "immediate_count": sum(1 for t in tasks if t["priority"] in ("Critical", "High")),
        "summary": (
            f"{len(tasks)} validation step(s) queued; "
            f"{sum(1 for t in tasks if t['priority'] in ('Critical', 'High'))} require immediate attention."
        ),
    }
