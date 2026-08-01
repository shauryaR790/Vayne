"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { EngineTraceHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { EngineTraceStandby } from "@/components/workspace/engine-trace-standby";
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
};

type TraceChunk =
  | { kind: "proof"; id: string; text: string }
  | {
      kind: "stage";
      id: string;
      title: string;
      lines: TraceLine[];
    };

/** One terminal step — title header, field row, or proof text line. */
type RevealItem =
  | { kind: "stage-title"; key: string; title: string; first: boolean }
  | { kind: "line"; key: string; line: TraceLine }
  | { kind: "proof-line"; key: string; text: string };

/** Map legacy === banners and shouty labels to plain section titles. */
const SECTION_TITLE_ALIASES: Record<string, string> = {
  "vayne proof mode": "Graph construction",
  "proof mode": "Graph construction",
  "path discovery": "Path discovery",
  "attack category classification": "Attack categories",
  "graph statistics": "Graph statistics",
  summary: "Summary",
  "vayne production proof export": "Production export",
  "attack path proofs": "Attack path evidence",
  "attack surface score": "Attack surface score",
};

function professionalSectionTitle(raw: string): string {
  const key = raw.trim().replace(/^=+\s*|\s*=+$/g, "").trim().toLowerCase();
  if (!key) return "Graph construction";
  return SECTION_TITLE_ALIASES[key] ?? raw.trim().replace(/^=+\s*|\s*=+$/g, "").trim();
}

function sectionTitleFromLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const banner = trimmed.match(/^===\s*(.+?)\s*===$/);
  if (banner) return professionalSectionTitle(banner[1]);
  const lower = trimmed.toLowerCase();
  if (SECTION_TITLE_ALIASES[lower]) return SECTION_TITLE_ALIASES[lower];
  return null;
}

function pushField(
  lines: TraceLine[],
  label: string,
  value: unknown,
  opts?: { arrow?: boolean },
) {
  if (value == null || value === "") return;
  lines.push({ label, value: formatVal(value), arrow: opts?.arrow });
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

/**
 * Live stream: stage telemetry first; graph-construction evidence deferred
 * to the bottom (after investigation assembly and later stages).
 */
export function buildTraceChunks(events: EngineTraceEvent[]): TraceChunk[] {
  const chunks: TraceChunk[] = [];
  const proofChunks: TraceChunk[] = [];
  const proofBuf: string[] = [];
  let proofKey = "proof-0";
  let proofIdx = 0;

  for (const ev of events) {
    if (!ev.stage || ev.stage === "console") continue;
    if (ev.event === "formula_catalog" || ev.event === "phase") continue;

    // Buffer proof lines — do not interleave with stage blocks.
    if (ev.stage === "proof" && ev.event === "line" && ev.message != null) {
      if (!proofBuf.length) {
        proofKey = `proof-${proofIdx++}-${ev.timestamp_ms || chunks.length}`;
      }
      proofBuf.push(ev.message);
      continue;
    }

    const stageLabel = STAGE_LABELS[ev.stage] || ev.stage;
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
          title: "Correlation detail",
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
      chunks.push({ kind: "stage", id, title: "Confidence scoring", lines });
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
      chunks.push({ kind: "stage", id, title: "Priority ranking", lines });
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
      chunks.push({ kind: "stage", id, title: "Attack graph", lines });
      continue;
    }

    if (ev.stage === "attack_graph" && ev.event === "path") {
      pushField(lines, "Path", f.title || ev.message);
      pushField(lines, "Risk", f.risk_score, { arrow: true });
      pushField(lines, "Confidence", f.confidence, { arrow: true });
      pushField(lines, "Effort", f.attacker_effort, { arrow: true });
      chunks.push({ kind: "stage", id, title: "Attack path", lines });
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
      pushField(lines, "Priority findings", f.count);
      chunks.push({ kind: "stage", id, title: "Priority ranking", lines });
      continue;
    }

    if (ev.stage === "summary" && (ev.event === "complete" || ev.event === "deterministic_complete")) {
      pushField(lines, "Execution time", f.execution_time_s != null ? `${f.execution_time_s} s` : null);
      pushField(lines, "Raw findings", f.raw_findings, { arrow: true });
      pushField(lines, "Attack paths", f.attack_paths, { arrow: true });
      pushField(lines, "Average confidence", f.average_confidence, { arrow: true });
      pushField(lines, "Highest priority", f.highest_priority, { arrow: true });
      chunks.push({ kind: "stage", id, title: "Run summary", lines });
      continue;
    }

    if (ev.stage === "ai_explanation") {
      lines.push({ value: "Engine analysis complete. Narrative explanation runs separately." });
      pushField(lines, "AI invoked in engine", f.ai_invoked_in_engine, { arrow: true });
      pushField(
        lines,
        "Engine runtime",
        f.deterministic_execution_ms != null ? `${formatVal(f.deterministic_execution_ms)} ms` : null,
        { arrow: true },
      );
      chunks.push({ kind: "stage", id, title: "Engine complete", lines });
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

  flushProof(proofChunks, proofBuf, proofKey);
  return [...chunks, ...proofChunks];
}

export function flattenTraceChunks(chunks: TraceChunk[]): RevealItem[] {
  const items: RevealItem[] = [];
  let stageIndex = 0;
  let proofIndex = 0;

  for (const chunk of chunks) {
    if (chunk.kind === "proof") {
      const lines = chunk.text.split("\n");
      let emittedHeader = false;
      lines.forEach((text, i) => {
        const section = sectionTitleFromLine(text);
        if (section) {
          items.push({
            kind: "stage-title",
            key: `${chunk.id}-sec-${i}`,
            title: section,
            first: stageIndex === 0 && proofIndex === 0 && !emittedHeader,
          });
          emittedHeader = true;
          return;
        }
        if (!text.trim()) return;
        if (!emittedHeader) {
          items.push({
            kind: "stage-title",
            key: `${chunk.id}-header`,
            title: "Graph construction",
            first: stageIndex === 0 && proofIndex === 0,
          });
          emittedHeader = true;
        }
        items.push({ kind: "proof-line", key: `${chunk.id}-L${i}`, text });
      });
      proofIndex += 1;
      continue;
    }

    items.push({
      kind: "stage-title",
      key: `${chunk.id}-title`,
      title: chunk.title,
      first: stageIndex === 0 && proofIndex === 0,
    });
    chunk.lines.forEach((line, i) => {
      items.push({ kind: "line", key: `${chunk.id}-line-${i}`, line });
    });
    stageIndex += 1;
  }

  return items;
}

function scrollElToEnd(el: HTMLElement | null) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  // Layout can settle one frame later (fonts / wrap) — pin again.
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  });
}

function delayForTraceItem(item: RevealItem | undefined): number {
  if (!item) return 40;
  if (item.kind === "stage-title") return 70;
  if (item.kind === "proof-line") return 28;
  if (item.kind === "line" && item.line.arrow) return 45;
  return 35;
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
  const liveSessionRef = useRef(false);
  const [manualScroll, setManualScroll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  const chunks = useMemo(() => buildTraceChunks(events), [events]);
  const items = useMemo(() => flattenTraceChunks(chunks), [chunks]);

  // Reset reveal when a new run starts (events cleared).
  useEffect(() => {
    if (events.length === 0) {
      setVisibleCount(0);
      stickToBottom.current = true;
      setManualScroll(false);
      liveSessionRef.current = false;
    }
  }, [events.length]);

  useEffect(() => {
    if (running) liveSessionRef.current = true;
  }, [running]);

  // Historical resume only: show the full Trace immediately.
  // Live / just-finished runs always type line-by-line with thinking holds.
  useEffect(() => {
    if (running || liveSessionRef.current) return;
    if (events.length === 0) return;
    if (visibleCount !== 0) return;
    if (items.length === 0) return;
    setVisibleCount(items.length);
  }, [running, events.length, items.length, visibleCount]);

  // Line-by-line terminal reveal with ~0.1–0.2s thinking holds.
  useEffect(() => {
    if (visibleCount >= items.length) return;
    // Resume path dumps historical traces above.
    if (!running && !liveSessionRef.current && visibleCount === 0 && items.length > 0) {
      return;
    }

    const delay = delayForTraceItem(items[visibleCount]);
    const timer = window.setTimeout(() => {
      setVisibleCount((n) => Math.min(items.length, n + 1));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [visibleCount, items, running]);

  // Catch up when new items append during a live run.
  useEffect(() => {
    if (visibleCount > items.length) setVisibleCount(items.length);
  }, [items.length, visibleCount]);

  const revealing = visibleCount < items.length;
  const showCursor = Boolean(running) || revealing;

  // Keep pinned to the bottom while typing, and force end when finished.
  useEffect(() => {
    if (!stickToBottom.current) return;
    scrollElToEnd(scrollerRef.current);
  }, [visibleCount, showCursor]);

  useEffect(() => {
    if (revealing) return;
    if (!items.length) return;
    // Finished printing — always land on the tail (fixes mid-panel stuck scroll).
    stickToBottom.current = true;
    setManualScroll(false);
    scrollElToEnd(scrollerRef.current);
  }, [revealing, items.length]);

  const visibleItems = items.slice(0, visibleCount);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col overflow-x-hidden bg-[#141414]",
        className,
      )}
    >
      <EngineTraceHeader />

      {items.length === 0 ? (
        <EngineTraceStandby running={running} />
      ) : (
        <>
          <div
            ref={scrollerRef}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 font-mono text-[11.5px] leading-[1.45]"
            onScroll={() => {
              const el = scrollerRef.current;
              if (!el) return;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
              stickToBottom.current = atBottom;
              setManualScroll(!atBottom);
            }}
          >
            {visibleItems.map((item) => {
              if (item.kind === "stage-title") {
                return (
                  <div
                    key={item.key}
                    className={cn("min-w-0", !item.first && "mt-4 border-t border-white/[0.08] pt-4")}
                  >
                    <p className="mb-2 text-[12px] font-medium text-white/90">{item.title}</p>
                  </div>
                );
              }
              if (item.kind === "proof-line") {
                return (
                  <pre
                    key={item.key}
                    className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-white/75"
                  >
                    {item.text}
                  </pre>
                );
              }

              const line = item.line;
              return (
                <div key={item.key} className="min-w-0">
                  {line.arrow ? <p className="text-white/25">↓</p> : null}
                  {line.label && line.muted ? (
                    <p className="break-words text-white/45">{line.label}</p>
                  ) : line.label ? (
                    <div className="flex min-w-0 justify-between gap-3 text-white/65">
                      <span className="min-w-0 break-words">{line.label}</span>
                      <span className="shrink-0 tabular-nums text-white/90">{line.value}</span>
                    </div>
                  ) : (
                    <p className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-white/70">
                      {line.value}
                    </p>
                  )}
                </div>
              );
            })}
            {showCursor ? <span className="mt-3 inline-block animate-pulse text-white/40">▌</span> : null}
          </div>

          {manualScroll ? (
            <button
              type="button"
              className="shrink-0 border-t border-white/[0.08] px-4 py-1.5 text-left font-mono text-[11px] text-white/60"
              onClick={() => {
                stickToBottom.current = true;
                setManualScroll(false);
                scrollElToEnd(scrollerRef.current);
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
