"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  STAGE_LABELS,
  type EngineTraceEvent,
} from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

const LINE_INTERVAL_MS = 12;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return value.slice(0, 12).join(", ") + (value.length > 12 ? "…" : "");
    }
    return `${value.length} items`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Map engine events into terminal lines (backend text only — no invented values). */
function eventsToLines(events: EngineTraceEvent[]): string[] {
  const lines: string[] = [];
  let lastStage = "";

  for (const ev of events) {
    if (ev.event === "line" && ev.message != null) {
      lines.push(ev.message);
      continue;
    }

    if (ev.stage !== lastStage && ev.stage !== "console" && ev.stage !== "proof") {
      lines.push("");
      lines.push(`[ ${STAGE_LABELS[ev.stage] || ev.stage} ]`);
      lastStage = ev.stage;
    }

    const head = [ev.event, ev.message].filter(Boolean).join(" — ");
    if (head) lines.push(head);
    if (ev.execution_ms != null) {
      lines.push(`  Execution: ${formatValue(ev.execution_ms)} ms`);
    }
    if (ev.fields) {
      for (const [key, value] of Object.entries(ev.fields)) {
        if (value == null) continue;
        if (key === "samples" && Array.isArray(value)) {
          lines.push(`  samples: ${value.length}`);
          continue;
        }
        if (key === "note" && typeof value === "string") {
          lines.push(`  ${value}`);
          continue;
        }
        lines.push(`  ${key}: ${formatValue(value)}`);
      }
    }
    if (ev.formula) {
      lines.push(`  Formula: ${ev.formula.name || "computed"}`);
      if (ev.formula.expression) lines.push(`    ${ev.formula.expression}`);
      for (const row of ev.formula.contributions || []) {
        const label = String(row.label || row.dimension || "factor");
        const val = formatValue(row.delta ?? row.weighted ?? row.value);
        const weight = row.weight != null ? ` × ${formatValue(row.weight)}` : "";
        lines.push(`    ${label}: ${val}${weight}`);
      }
      if (ev.formula.result_pct != null || ev.formula.result != null) {
        lines.push(`    Result: ${formatValue(ev.formula.result_pct ?? ev.formula.result)}`);
      }
    }
  }
  return lines;
}

/** CLI / Rich-inspired colors on a dark terminal surface. */
function lineClass(line: string): string {
  const t = line.trimStart();
  if (!line.trim()) return "h-3";
  if (line.startsWith("===")) return "font-semibold text-white";
  if (line.startsWith("[ ") && line.endsWith(" ]")) return "font-semibold text-cyan-300";
  if (line.startsWith("REJECTED")) return "text-amber-400";
  if (line.startsWith("NODE ")) return "text-cyan-400";
  if (line.startsWith("EDGE ")) return "text-emerald-400";
  if (line.startsWith("ATTACK CATEGORY")) return "font-semibold text-white";
  if (line.startsWith("[VAYNE]")) return "text-[#c8c8c8]";
  if (t.startsWith("evidence:") || t.startsWith("Evidence:")) return "text-white/45";
  if (t.startsWith("Tool:") || t.startsWith("Artifact:") || t.startsWith("Tier:")) {
    return "text-white/40";
  }
  if (t.startsWith("Confidence:")) return "text-[#d4d4d4]";
  if (t.startsWith("Validation:")) return "text-white/50";
  if (t.startsWith("DISCOVERED FROM")) return "text-sky-300/80";
  if (t.startsWith("- ")) return "text-white/45";
  if (t.startsWith("WHY THIS") || t.startsWith("MATCHED ") || t.startsWith("MITRE ")) {
    return "text-sky-300/85";
  }
  if (t.startsWith("+ ")) return "text-emerald-400/75";
  if (t.startsWith("sample path:") || t.startsWith("Why this path")) return "text-[#d4d4d4]";
  if (
    t.startsWith("Algorithm:") ||
    t.startsWith("Entry nodes:") ||
    t.startsWith("Terminal nodes:") ||
    t.startsWith("Paths ") ||
    t.startsWith("Nodes ") ||
    t.startsWith("Edges ") ||
    t.startsWith("Connected ") ||
    t.startsWith("Average ") ||
    t.startsWith("Reachable ") ||
    t.startsWith("Candidate ") ||
    t.startsWith("Valid ") ||
    t.startsWith("Analyst ")
  ) {
    return "text-[#e5e5e5]";
  }
  if (t.startsWith("Formula:") || t.startsWith("Execution:")) return "text-white/55";
  if (t.startsWith("Optional")) return "text-white/35";
  return "text-white/55";
}

export function EngineTracePanel({
  events,
  running,
  className,
  onViewFullReport,
}: {
  events: EngineTraceEvent[];
  running?: boolean;
  className?: string;
  onViewFullReport?: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [manualScroll, setManualScroll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const wasRunning = useRef(false);

  const lines = useMemo(() => eventsToLines(events), [events]);

  // Cleared events = new investigation run.
  useEffect(() => {
    if (events.length === 0) {
      wasRunning.current = false;
      setVisibleCount(0);
    }
  }, [events.length]);

  // New run: reset reveal once. Audit reopen: show everything immediately.
  useEffect(() => {
    if (running) {
      if (!wasRunning.current) {
        setVisibleCount(0);
      }
      wasRunning.current = true;
      return;
    }
    if (!wasRunning.current && lines.length > 0) {
      setVisibleCount(lines.length);
    }
  }, [running, lines.length]);

  // Drain lines one-by-one quickly (no chunk pop-in).
  useEffect(() => {
    if (visibleCount >= lines.length) return;
    const id = window.setTimeout(() => {
      setVisibleCount((n) => Math.min(n + 1, lines.length));
    }, LINE_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [visibleCount, lines.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleCount]);

  const shown = lines.slice(0, visibleCount);
  const catchingUp = visibleCount < lines.length;

  return (
    <section
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-b border-white/10 bg-[#0c0c0c]",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            Engine Trace
          </p>
          <p className="mt-1 font-mono text-[12px] text-white/40">
            Deterministic engine output — same proof stream as the CLI
          </p>
        </div>
        <p className="font-mono text-[11px] tabular-nums text-cyan-300/70">
          {running || catchingUp ? "RUNNING" : "COMPLETE"} · {shown.length}/{lines.length}
        </p>
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4 font-mono text-[12.5px] leading-[1.55] antialiased"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          stickToBottom.current = atBottom;
          setManualScroll(!atBottom);
        }}
      >
        {shown.length === 0 ? (
          <p className="text-white/35">Waiting for engine events…</p>
        ) : null}

        {shown.map((line, index) => (
          <div
            key={`${index}-${line.slice(0, 24)}`}
            className={cn("whitespace-pre-wrap break-all", lineClass(line))}
          >
            {line || "\u00a0"}
          </div>
        ))}

        {running || catchingUp ? (
          <span className="mt-1 inline-block h-4 w-[7px] animate-pulse bg-cyan-300/80" aria-hidden />
        ) : null}
      </div>

      {manualScroll ? (
        <button
          type="button"
          className="shrink-0 border-t border-white/10 px-5 py-2 text-left font-mono text-[11px] text-white/55 hover:text-white"
          onClick={() => {
            stickToBottom.current = true;
            setManualScroll(false);
            const el = scrollerRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          Resume auto-scroll
        </button>
      ) : null}

      {!running && !catchingUp && onViewFullReport ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
          <p className="font-mono text-[11px] text-white/40">
            Engine panel stays open until you continue
          </p>
          <button
            type="button"
            onClick={onViewFullReport}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-cyan-300 hover:text-white"
          >
            View full report
          </button>
        </div>
      ) : null}
    </section>
  );
}
