"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { EngineTraceHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { EngineTraceStandby } from "@/components/workspace/engine-trace-standby";
import { TraceSyntaxText, toTraceKeyword } from "@/components/workspace/engine-trace-syntax";
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

type TraceLine = {
  label?: string;
  value?: string;
  muted?: boolean;
  arrow?: boolean;
  code?: boolean;
  highlight?: boolean;
};

type TraceChunk =
  | { kind: "proof"; id: string; text: string }
  | {
      kind: "stage";
      id: string;
      title: string;
      accent?: "formula" | "stage";
      lines: TraceLine[];
    };

function pushField(
  lines: TraceLine[],
  label: string,
  value: unknown,
  opts?: { arrow?: boolean; code?: boolean; highlight?: boolean },
) {
  if (value == null || value === "") return;
  lines.push({ label, value: formatVal(value), arrow: opts?.arrow, code: opts?.code, highlight: opts?.highlight });
}

function flushProof(
  chunks: TraceChunk[],
  proofBuf: string[],
  key: string,
) {
  if (!proofBuf.length) return;
  chunks.push({ kind: "proof", id: key, text: proofBuf.join("\n") });
  proofBuf.length = 0;
}

/** Live CLI-faithful stream: proof dumps as continuous text; formulas only when evaluated. */
export function buildTraceChunks(events: EngineTraceEvent[]): TraceChunk[] {
  const chunks: TraceChunk[] = [];
  const proofBuf: string[] = [];
  let proofKey = "proof-0";
  let proofIdx = 0;

  for (const ev of events) {
    if (!ev.stage || ev.stage === "console") continue;
    if (ev.event === "formula_catalog" || ev.event === "phase") continue;

    // Exact CLI proof stream — append as raw lines (no per-line [PROOF] chrome).
    if (ev.stage === "proof" && ev.event === "line" && ev.message) {
      if (!proofBuf.length) {
        proofKey = `proof-${proofIdx++}-${ev.timestamp_ms || chunks.length}`;
      }
      proofBuf.push(ev.message);
      continue;
    }

    flushProof(chunks, proofBuf, proofKey);

    const stageLabel = (STAGE_LABELS[ev.stage] || ev.stage).toUpperCase();
    const f = ev.fields || {};
    const lines: TraceLine[] = [];
    const id = `${ev.id || `${ev.stage}-${ev.event}-${ev.timestamp_ms || chunks.length}`}`;

    if (ev.event === "start") {
      lines.push({ value: ev.message || "Started" });
      if (Array.isArray(f.files)) {
        lines.push({ label: "Files detected", value: String(f.files.length), arrow: true });
      }
      chunks.push({ kind: "stage", id, title: stageLabel, lines });
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
      chunks.push({ kind: "stage", id, title: stageLabel, lines });
      continue;
    }

    if (ev.stage === "normalization" && ev.event === "complete") {
      pushField(lines, "Mapped findings", f.mapped_findings);
      pushField(lines, "Schema", f.schema, { arrow: true });
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      chunks.push({ kind: "stage", id, title: stageLabel, lines });
      continue;
    }

    if (ev.stage === "deduplication" && ev.event === "complete") {
      pushField(lines, "Raw findings", f.raw_findings);
      pushField(lines, "Unique findings", f.unique_findings, { arrow: true });
      pushField(lines, "Duplicates removed", f.duplicates_removed, { arrow: true });
      chunks.push({ kind: "stage", id, title: stageLabel, lines });
      continue;
    }

    if (ev.stage === "correlation" && ev.event === "complete") {
      pushField(lines, "Correlated findings", f.correlated_findings);
      pushField(lines, "Assets", f.assets, { arrow: true });
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      chunks.push({ kind: "stage", id, title: stageLabel, lines });

      // Compact sample merges (not a full dump) — top agreements only.
      const samples = Array.isArray(f.samples) ? f.samples : [];
      for (const sample of samples.slice(0, 6)) {
        if (!sample || typeof sample !== "object") continue;
        const s = sample as Record<string, unknown>;
        const sLines: typeof lines = [];
        pushField(sLines, "Finding", s.title);
        if (s.cve) pushField(sLines, "Matched", s.cve, { arrow: true });
        if (s.scanner_agreement != null) {
          pushField(sLines, "Scanner Agreement", s.scanner_agreement, { arrow: true });
        }
        if (s.finding_id) {
          pushField(sLines, "Merged Investigation", `#${String(s.finding_id).slice(0, 8)}`, {
            arrow: true,
          });
        }
        chunks.push({
          kind: "stage",
          id: `${id}-sample-${String(s.finding_id || s.title)}`,
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
      chunks.push({ kind: "stage", id, title: stageLabel, lines });
      continue;
    }

    if (ev.event === "score" && ev.formula?.name === "finding_confidence") {
      lines.push({ label: "finding_confidence()", muted: true, code: true });
      if (f.title) pushField(lines, "Finding", f.title);
      for (const row of ev.formula.contributions || []) {
        const label = String(row.label || row.dimension || "term");
        const value = row.value ?? row.delta;
        const weight = row.weight;
        if (value == null) continue;
        const kw = toTraceKeyword(label);
        const rhs =
          weight != null
            ? `${formatVal(value)} × ${formatVal(weight)}`
            : formatVal(value);
        const noteRaw = row.note ?? row.source ?? row.detail;
        const note = noteRaw != null && String(noteRaw) ? ` (${String(noteRaw)})` : "";
        lines.push({
          value: `${kw} = ${rhs}${note}`,
          code: true,
          arrow: true,
        });
      }
      const final =
        ev.formula.result_pct ??
        (typeof ev.formula.result === "number" && ev.formula.result <= 1
          ? ev.formula.result * 100
          : ev.formula.result);
      const dims = (ev.formula.contributions || [])
        .map((row) => toTraceKeyword(String(row.label || row.dimension || "")))
        .filter(Boolean);
      const formulaExpr =
        dims.length > 0
          ? `confidence = round(100 × ${dims.join(" × ")})`
          : `confidence = ${formatVal(final)}`;
      lines.push({ value: formulaExpr, code: true, highlight: true, arrow: true });
      if (final != null) {
        lines.push({
          value: `result = ${formatVal(final)}`,
          code: true,
          highlight: true,
        });
      }
      chunks.push({ kind: "stage", id, title: "CONFIDENCE", accent: "formula", lines });
      continue;
    }

    if (ev.event === "score" && ev.formula?.name === "composite_priority_score") {
      lines.push({ label: "priority_score()", muted: true });
      if (f.title) pushField(lines, "Finding", f.title);
      pushField(lines, "Exploitability", f.exploitability);
      pushField(lines, "Business Impact", f.business_impact, { arrow: true });
      if (f.internet_exposure != null) {
        pushField(lines, "Internet Exposure", Number(f.internet_exposure) >= 60, { arrow: true });
      }
      pushField(lines, "Priority", ev.formula.result ?? f.priority, { arrow: true });
      chunks.push({ kind: "stage", id, title: "PRIORITY", lines });
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
      chunks.push({ kind: "stage", id, title: "ATTACK GRAPH", lines });
      continue;
    }

    if (ev.stage === "attack_graph" && ev.event === "path") {
      pushField(lines, "Path", f.title || ev.message);
      pushField(lines, "Risk", f.risk_score, { arrow: true });
      pushField(lines, "Confidence", f.confidence, { arrow: true });
      pushField(lines, "Effort", f.attacker_effort, { arrow: true });
      chunks.push({ kind: "stage", id, title: "ATTACK PATH", lines });
      continue;
    }

    if (ev.stage === "investigation" && ev.event === "complete") {
      pushField(lines, "Investigations", f.investigations_generated);
      pushField(lines, "Full investigations", f.full_investigations, { arrow: true });
      if (ev.execution_ms != null) {
        pushField(lines, "Execution", `${formatVal(ev.execution_ms)} ms`, { arrow: true });
      }
      chunks.push({ kind: "stage", id, title: stageLabel, lines });
      continue;
    }

    if (ev.stage === "priority" && ev.event === "attention") {
      pushField(lines, "Attention findings", f.count);
      chunks.push({ kind: "stage", id, title: "PRIORITY", lines });
      continue;
    }

    if (ev.stage === "summary" && (ev.event === "complete" || ev.event === "deterministic_complete")) {
      pushField(lines, "Execution time", f.execution_time_s != null ? `${f.execution_time_s} s` : null);
      pushField(lines, "Raw findings", f.raw_findings, { arrow: true });
      pushField(lines, "Attack paths", f.attack_paths, { arrow: true });
      pushField(lines, "Average confidence", f.average_confidence, { arrow: true });
      pushField(lines, "Highest priority", f.highest_priority, { arrow: true });
      chunks.push({ kind: "stage", id, title: "SUMMARY", lines });
      continue;
    }

    if (ev.stage === "ai_explanation") {
      lines.push({ value: "Deterministic engine complete — AI boundary reached" });
      pushField(lines, "AI invoked in engine", f.ai_invoked_in_engine, { arrow: true });
      pushField(lines, "Deterministic ms", f.deterministic_execution_ms, { arrow: true });
      chunks.push({ kind: "stage", id, title: "AI BOUNDARY", lines });
      continue;
    }

    if (ev.event === "complete" || ev.event === "score" || ev.event === "path" || ev.event === "intake") {
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
        chunks.push({ kind: "stage", id, title: stageLabel, lines });
      }
    }
  }

  flushProof(chunks, proofBuf, proofKey);
  return chunks;
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
  const chunks = useMemo(() => buildTraceChunks(events), [events]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [chunks.length, events.length]);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-l border-white/[0.08] bg-vx-trace-bg",
        className,
      )}
    >
      <EngineTraceHeader />

      {chunks.length === 0 ? (
        <EngineTraceStandby running={running} />
      ) : (
        <>
          <div
            ref={scrollerRef}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3 font-mono text-[11.5px] leading-[1.5]"
            onScroll={() => {
              const el = scrollerRef.current;
              if (!el) return;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              stickToBottom.current = atBottom;
              setManualScroll(!atBottom);
            }}
          >
            {chunks.map((chunk, idx) =>
              chunk.kind === "proof" ? (
                <div
                  key={chunk.id}
                  className={cn(
                    "rounded-sm px-2 py-2",
                    idx > 0 && "mt-3",
                    "bg-vx-trace-kw-bg/60",
                  )}
                >
                  <p className="mb-2 tracking-[0.12em] text-vx-trace-keyword">
                    === VAYNE PROOF MODE ===
                  </p>
                  <pre className="whitespace-pre-wrap break-words text-white/75">{chunk.text}</pre>
                </div>
              ) : (
                <div
                  key={chunk.id}
                  className={cn("rounded-sm px-1 py-1", idx > 0 && "mt-3")}
                >
                  <p
                    className={cn(
                      "mb-2 inline-block rounded-sm px-2 py-0.5 tracking-[0.12em]",
                      chunk.accent === "formula"
                        ? "bg-vx-trace-line-hl text-vx-trace-string"
                        : "bg-vx-trace-kw-bg text-vx-trace-keyword",
                    )}
                  >
                    [{chunk.title}]
                  </p>
                  <div className="space-y-0.5">
                    {chunk.lines.map((line, i) => (
                      <div key={i}>
                        {line.arrow ? <p className="text-vx-trace-op">↓</p> : null}
                        {line.code && (line.value || line.label) ? (
                          <p
                            className={cn(
                              "rounded-sm px-2 py-0.5",
                              line.highlight && "bg-vx-trace-line-hl",
                              line.muted && !line.highlight && "bg-vx-trace-kw-bg/50",
                            )}
                          >
                            {line.label && line.value ? (
                              <>
                                <TraceSyntaxText text={line.label} />
                                <span className="text-vx-trace-op"> = </span>
                                <TraceSyntaxText text={line.value} />
                              </>
                            ) : (
                              <TraceSyntaxText text={line.value || line.label || ""} />
                            )}
                          </p>
                        ) : line.label && line.muted ? (
                          <p className="rounded-sm bg-vx-trace-kw-bg/40 px-2 py-0.5 text-vx-trace-keyword">
                            {line.label}
                          </p>
                        ) : line.label ? (
                          <div className="flex justify-between gap-4 rounded-sm px-2 py-0.5 hover:bg-white/[0.02]">
                            <span className="text-vx-trace-keyword">{line.label}</span>
                            <span className="tabular-nums text-vx-trace-number">{line.value}</span>
                          </div>
                        ) : (
                          <p className="px-2 py-0.5">
                            <TraceSyntaxText text={line.value || ""} />
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ),
            )}
            {running ? (
              <span className="mt-3 inline-block text-vx-trace-keyword">▌</span>
            ) : null}
          </div>

          {manualScroll ? (
            <button
              type="button"
              className="shrink-0 border-t border-white/[0.08] bg-vx-trace-bg px-4 py-1.5 text-left font-mono text-[11px] text-vx-trace-keyword"
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
        </>
      )}
    </aside>
  );
}
