"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { STAGE_LABELS, type EngineTraceEvent } from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

function formatVal(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
  }
  if (Array.isArray(value)) return String(value.length);
  return String(value);
}

type TraceBlock = {
  id: string;
  stage: string;
  title: string;
  lines: Array<{ label?: string; value?: string; muted?: boolean; arrow?: boolean }>;
};

function pushField(
  lines: TraceBlock["lines"],
  label: string,
  value: unknown,
  opts?: { arrow?: boolean },
) {
  if (value == null || value === "") return;
  lines.push({ label, value: formatVal(value), arrow: opts?.arrow });
}

/** Build live reasoning blocks from real engine events only — no fabricated math. */
export function buildTraceBlocks(events: EngineTraceEvent[]): TraceBlock[] {
  const blocks: TraceBlock[] = [];

  for (const ev of events) {
    if (!ev.stage || ev.stage === "console") continue;
    if (ev.event === "formula_catalog" || ev.event === "phase") continue;

    const stageLabel = (STAGE_LABELS[ev.stage] || ev.stage).toUpperCase();
    const f = ev.fields || {};
    const lines: TraceBlock["lines"] = [];
    const id = `${ev.id || `${ev.stage}-${ev.event}-${ev.timestamp_ms || blocks.length}`}`;

    if (ev.stage === "proof" && ev.event === "line" && ev.message) {
      blocks.push({
        id,
        stage: ev.stage,
        title: "PROOF",
        lines: [{ value: ev.message }],
      });
      continue;
    }

    if (ev.event === "start") {
      lines.push({ value: ev.message || "Started" });
      if (Array.isArray(f.files)) {
        lines.push({ label: "Files detected", value: String(f.files.length), arrow: true });
      }
      blocks.push({ id, stage: ev.stage, title: stageLabel, lines });
      continue;
    }

    if (ev.stage === "parser" && ev.event === "complete") {
      pushField(lines, "Files processed", f.files_processed);
      pushField(lines, "Findings extracted", f.raw_findings, { arrow: true });
      pushField(lines, "Assets", f.raw_assets, { arrow: true });
      pushField(lines, "Hosts", f.hosts, { arrow: true });
      pushField(lines, "Ports", f.ports, { arrow: true });
      pushField(lines, "Services", f.services, { arrow: true });
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      blocks.push({ id, stage: ev.stage, title: stageLabel, lines });
      continue;
    }

    if (ev.stage === "normalization" && ev.event === "complete") {
      pushField(lines, "Mapped findings", f.mapped_findings);
      pushField(lines, "Schema", f.schema, { arrow: true });
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      blocks.push({ id, stage: ev.stage, title: stageLabel, lines });
      continue;
    }

    if (ev.stage === "deduplication" && ev.event === "complete") {
      pushField(lines, "Raw findings", f.raw_findings);
      pushField(lines, "Unique findings", f.unique_findings, { arrow: true });
      pushField(lines, "Duplicates removed", f.duplicates_removed, { arrow: true });
      blocks.push({ id, stage: ev.stage, title: stageLabel, lines });
      continue;
    }

    if (ev.stage === "correlation" && ev.event === "complete") {
      pushField(lines, "Correlated findings", f.correlated_findings);
      pushField(lines, "Assets", f.assets, { arrow: true });
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      blocks.push({ id, stage: ev.stage, title: stageLabel, lines });

      const samples = Array.isArray(f.samples) ? f.samples : [];
      for (const sample of samples.slice(0, 12)) {
        if (!sample || typeof sample !== "object") continue;
        const s = sample as Record<string, unknown>;
        const sLines: TraceBlock["lines"] = [];
        pushField(sLines, "Finding", s.title);
        pushField(sLines, "Host", s.host, { arrow: true });
        if (s.cve) pushField(sLines, "Matched", s.cve, { arrow: true });
        if (s.scanner_agreement != null) {
          pushField(sLines, "Scanner Agreement", s.scanner_agreement, { arrow: true });
        }
        if (Array.isArray(s.sources) && s.sources.length) {
          pushField(sLines, "Sources", (s.sources as unknown[]).join(", "), { arrow: true });
        }
        if (s.finding_id) {
          pushField(sLines, "Merged Investigation", `#${String(s.finding_id).slice(0, 8)}`, {
            arrow: true,
          });
        }
        blocks.push({
          id: `${id}-sample-${String(s.finding_id || s.title)}`,
          stage: "correlation",
          title: "CORRELATION",
          lines: sLines,
        });
      }
      continue;
    }

    if (ev.stage === "validation" && ev.event === "complete") {
      pushField(lines, "Validated", f.validated);
      pushField(lines, "Retained", f.retained, { arrow: true });
      pushField(lines, "False positives", f.false_positives, { arrow: true });
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      blocks.push({ id, stage: ev.stage, title: stageLabel, lines });
      continue;
    }

    if (ev.event === "score" && ev.formula?.name === "finding_confidence") {
      lines.push({ label: "finding_confidence()", muted: true });
      if (f.title) pushField(lines, "Finding", f.title);
      for (const row of ev.formula.contributions || []) {
        const label = String(row.label || row.dimension || "term");
        const value = row.value ?? row.delta;
        const weight = row.weight;
        if (value == null) continue;
        const display =
          weight != null
            ? `${formatVal(value)}  ×  ${formatVal(weight)}`
            : formatVal(value);
        lines.push({ label, value: display, arrow: true });
      }
      const final =
        ev.formula.result_pct ??
        (typeof ev.formula.result === "number" && ev.formula.result <= 1
          ? ev.formula.result * 100
          : ev.formula.result);
      pushField(lines, "Final", final, { arrow: true });
      blocks.push({ id, stage: ev.stage, title: "CONFIDENCE", lines });
      continue;
    }

    if (ev.event === "score" && ev.formula?.name === "composite_priority_score") {
      lines.push({ label: "priority_score()", muted: true });
      if (f.title) pushField(lines, "Finding", f.title);
      pushField(lines, "Exploitability", f.exploitability);
      pushField(lines, "Business Impact", f.business_impact, { arrow: true });
      if (f.internet_exposure != null) {
        const exposed = Number(f.internet_exposure) >= 60;
        pushField(lines, "Internet Exposure", exposed, { arrow: true });
      }
      pushField(lines, "Priority", ev.formula.result ?? f.priority, { arrow: true });
      blocks.push({ id, stage: ev.stage, title: "PRIORITY", lines });
      continue;
    }

    if (ev.stage === "attack_graph" && ev.event === "complete") {
      pushField(lines, "Nodes", f.nodes);
      pushField(lines, "Edges", f.edges, { arrow: true });
      pushField(lines, "Rejected edges", f.rejected_edges, { arrow: true });
      pushField(lines, "Traversal", f.algorithm, { arrow: true });
      pushField(lines, "Paths accepted", f.paths_accepted, { arrow: true });
      pushField(lines, "Paths rejected", f.paths_rejected, { arrow: true });
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      blocks.push({ id, stage: ev.stage, title: "ATTACK GRAPH", lines });
      continue;
    }

    if (ev.stage === "attack_graph" && ev.event === "path") {
      pushField(lines, "Path", f.title || ev.message);
      pushField(lines, "Risk", f.risk_score, { arrow: true });
      pushField(lines, "Confidence", f.confidence, { arrow: true });
      pushField(lines, "Effort", f.attacker_effort, { arrow: true });
      blocks.push({ id, stage: ev.stage, title: "ATTACK PATH", lines });
      continue;
    }

    if (ev.stage === "investigation" && ev.event === "complete") {
      pushField(lines, "Investigations", f.investigations_generated);
      pushField(lines, "Full investigations", f.full_investigations, { arrow: true });
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      blocks.push({ id, stage: ev.stage, title: stageLabel, lines });
      continue;
    }

    if (ev.stage === "priority" && ev.event === "attention") {
      pushField(lines, "Attention findings", f.count);
      blocks.push({ id, stage: ev.stage, title: "PRIORITY", lines });
      continue;
    }

    if (ev.stage === "summary" && (ev.event === "complete" || ev.event === "deterministic_complete")) {
      pushField(lines, "Execution time", f.execution_time_s != null ? `${f.execution_time_s} s` : null);
      pushField(lines, "Raw findings", f.raw_findings, { arrow: true });
      pushField(lines, "Attack paths", f.attack_paths, { arrow: true });
      pushField(lines, "Average confidence", f.average_confidence, { arrow: true });
      pushField(lines, "Highest priority", f.highest_priority, { arrow: true });
      blocks.push({ id, stage: ev.stage, title: "SUMMARY", lines });
      continue;
    }

    if (ev.stage === "ai_explanation") {
      lines.push({ value: "Deterministic engine complete — AI boundary reached" });
      pushField(lines, "AI invoked in engine", f.ai_invoked_in_engine, { arrow: true });
      pushField(lines, "Deterministic ms", f.deterministic_execution_ms, { arrow: true });
      blocks.push({ id, stage: ev.stage, title: "AI BOUNDARY", lines });
      continue;
    }

    if (ev.event === "complete" || ev.event === "score" || ev.event === "path") {
      if (ev.message) lines.push({ value: ev.message });
      for (const [k, v] of Object.entries(f)) {
        if (k === "samples" || k === "findings" || k === "files" || k === "formulas") continue;
        if (v == null || typeof v === "object") continue;
        pushField(lines, k.replace(/_/g, " "), v, { arrow: true });
      }
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      if (lines.length) {
        blocks.push({ id, stage: ev.stage, title: stageLabel, lines });
      }
    }
  }

  return blocks;
}

export function EngineTraceLive({
  events,
  running,
  className,
}: {
  events: EngineTraceEvent[];
  running?: boolean;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [manualScroll, setManualScroll] = useState(false);
  const blocks = useMemo(() => buildTraceBlocks(events), [events]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [blocks.length, events.length]);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-l border-white/[0.08] bg-[#141414]",
        className,
      )}
    >
      <header className="shrink-0 border-b border-white/[0.08] px-4 py-3">
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-white/75">
          Engine Trace
        </p>
        <p className="mt-1 font-mono text-[11px] text-white/35">
          Live execution telemetry — formulas only when evaluated
        </p>
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.55]"
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          stickToBottom.current = atBottom;
          setManualScroll(!atBottom);
        }}
      >
        {blocks.length === 0 ? (
          <p className="text-white/35">
            {running ? "Awaiting engine events…" : "No engine events yet"}
          </p>
        ) : (
          blocks.map((block, idx) => (
            <div key={block.id} className={cn(idx > 0 && "mt-5 border-t border-white/[0.08] pt-5")}>
              <p className="mb-2 tracking-[0.12em] text-white/85">[{block.title}]</p>
              <div className="space-y-1">
                {block.lines.map((line, i) => (
                  <div key={i}>
                    {line.arrow ? <p className="text-white/25">↓</p> : null}
                    {line.label && line.muted ? (
                      <p className="text-white/45">{line.label}</p>
                    ) : line.label ? (
                      <div className="flex justify-between gap-4 text-white/65">
                        <span>{line.label}</span>
                        <span className="tabular-nums text-white/90">{line.value}</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-white/70">{line.value}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        {running ? <span className="mt-3 inline-block text-white/40">▌</span> : null}
      </div>

      {manualScroll ? (
        <button
          type="button"
          className="shrink-0 border-t border-white/[0.08] px-4 py-1.5 text-left font-mono text-[11px] text-white/60"
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
    </aside>
  );
}
