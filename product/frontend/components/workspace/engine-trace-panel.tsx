"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  STAGE_LABELS,
  type EngineTraceEvent,
} from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

const LINE_INTERVAL_MS = 12;

/** Match CLI / Rich terminal palette from the proof stream screenshots. */
const C = {
  bg: "#141414",
  fg: "#D4D4D4",
  dim: "#8A8A8A",
  cyan: "#4EC9B0",
  green: "#98C379",
  yellow: "#DCDCAA",
  gold: "#D7BA7D",
  teal: "#6A9B9B",
  amber: "#E5C07B",
  white: "#E8E8E8",
} as const;

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

type Seg = { text: string; color: string };

function pushPlain(out: Seg[], text: string, color: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.color === color) last.text += text;
  else out.push({ text, color });
}

function colorizeLine(line: string): Seg[] {
  if (!line.trim()) return [{ text: "\u00a0", color: C.fg }];

  if (line.startsWith("===") || (line.startsWith("[ ") && line.endsWith(" ]"))) {
    return [{ text: line, color: C.white }];
  }
  if (line.startsWith("REJECTED")) {
    return colorizeGeneric(line, C.amber);
  }
  if (line.startsWith("ATTACK CATEGORY")) {
    return colorizeGeneric(line, C.white);
  }
  if (line.startsWith("NODE ")) {
    return colorizeGeneric(line, C.fg, { emphasizeVersions: true });
  }
  if (line.startsWith("EDGE ")) {
    return colorizeEdgeLine(line);
  }

  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);

  const field = trimmed.match(
    /^(evidence:|Evidence:|Tool:|Artifact:|Tier:|Confidence:|Validation:|DISCOVERED FROM|Execution:|Formula:|Result:)(.*)$/i,
  );
  if (field) {
    const segs: Seg[] = [];
    pushPlain(segs, indent, C.dim);
    pushPlain(segs, field[1], C.dim);
    segs.push(...colorizeGeneric(field[2], C.gold));
    return segs;
  }

  if (trimmed.startsWith("- ")) {
    const segs: Seg[] = [];
    pushPlain(segs, indent, C.dim);
    pushPlain(segs, "- ", C.dim);
    segs.push(...colorizeGeneric(trimmed.slice(2), C.gold));
    return segs;
  }

  if (trimmed.startsWith("WHY THIS") || trimmed.startsWith("MATCHED ") || trimmed.startsWith("MITRE ")) {
    return colorizeGeneric(line, C.cyan);
  }
  if (trimmed.startsWith("+ ")) {
    return colorizeGeneric(line, C.green);
  }

  return colorizeGeneric(line, C.fg);
}

function colorizeEdgeLine(line: string): Seg[] {
  const segs: Seg[] = [];
  pushPlain(segs, "EDGE ", C.fg);
  const rest = line.slice(5);
  const parts = rest.split(/\s*(->|→)\s*/);
  if (parts.length >= 3) {
    segs.push(...colorizeEntityRef(parts[0]));
    pushPlain(segs, ` ${parts[1]} `, C.dim);
    segs.push(...colorizeEntityRef(parts[2]));
    for (let i = 3; i < parts.length; i++) {
      segs.push(...colorizeGeneric(parts[i], C.fg));
    }
    return segs;
  }
  return [...segs, ...colorizeGeneric(rest, C.gold)];
}

function colorizeEntityRef(ref: string): Seg[] {
  const m = ref.match(/^([a-z_]+):(.+)$/i);
  if (m) {
    const segs: Seg[] = [];
    pushPlain(segs, `${m[1]}:`, C.teal);
    segs.push(...colorizeGeneric(m[2], C.gold));
    return segs;
  }
  return colorizeGeneric(ref, C.gold);
}

function colorizeGeneric(
  text: string,
  base: string,
  opts?: { emphasizeVersions?: boolean },
): Seg[] {
  if (!text) return [];
  const segs: Seg[] = [];
  const patterns: Array<{ re: RegExp; color: string }> = [
    { re: /\bCVE-\d{4}-\d+\b/g, color: C.cyan },
    { re: /\b(?:CANDIDATE|VERIFIED)\b/g, color: C.cyan },
    { re: /\b(?:TIER[123]|TIER\s*[123])\b/gi, color: C.gold },
    { re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, color: C.green },
    { re: /\b[A-Z][A-Z0-9_]{2,}=/g, color: C.gold },
    { re: /\b\d{1,3}%\b/g, color: C.gold },
    { re: /(?<=(?:tcp|udp)\/)\d{1,5}\b/gi, color: C.cyan },
    { re: /(?<=:)\d{2,5}\b(?!\.\d)/g, color: C.cyan },
  ];
  if (opts?.emphasizeVersions) {
    patterns.push({
      re: /\b\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._]+)?\b/g,
      color: C.yellow,
    });
  }

  type Hit = { start: number; end: number; color: string };
  const hits: Hit[] = [];
  for (const { re, color } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, color });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);

  const taken: Hit[] = [];
  for (const h of hits) {
    if (taken.some((t) => h.start < t.end && h.end > t.start)) continue;
    taken.push(h);
  }
  taken.sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const h of taken) {
    if (h.start > cursor) pushPlain(segs, text.slice(cursor, h.start), base);
    pushPlain(segs, text.slice(h.start, h.end), h.color);
    cursor = h.end;
  }
  if (cursor < text.length) pushPlain(segs, text.slice(cursor), base);
  if (!segs.length) pushPlain(segs, text, base);
  return segs;
}

function TerminalLine({ line }: { line: string }) {
  const segs = useMemo(() => colorizeLine(line), [line]);
  return (
    <div className="whitespace-pre-wrap break-all">
      {segs.map((s, i) => (
        <Fragment key={i}>
          <span style={{ color: s.color }}>{s.text}</span>
        </Fragment>
      ))}
    </div>
  );
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

  useEffect(() => {
    if (events.length === 0) {
      wasRunning.current = false;
      setVisibleCount(0);
    }
  }, [events.length]);

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
      className={cn("flex h-full min-h-0 w-full flex-col border-b border-white/10", className)}
      style={{ backgroundColor: C.bg }}
    >
      <header
        className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3"
        style={{ backgroundColor: C.bg }}
      >
        <div>
          <p
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: C.white }}
          >
            Engine Trace
          </p>
          <p className="mt-1 font-mono text-[12px]" style={{ color: C.dim }}>
            Deterministic engine output — same proof stream as the CLI
          </p>
        </div>
        <p className="font-mono text-[11px] tabular-nums" style={{ color: C.cyan }}>
          {running || catchingUp ? "RUNNING" : "COMPLETE"} · {shown.length}/{lines.length}
        </p>
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4 font-mono text-[12.5px] leading-[1.55] antialiased"
        style={{
          backgroundColor: C.bg,
          color: C.fg,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        }}
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          stickToBottom.current = atBottom;
          setManualScroll(!atBottom);
        }}
      >
        {shown.length === 0 ? (
          <p style={{ color: C.dim }}>Waiting for engine events…</p>
        ) : null}

        {shown.map((line, index) => (
          <TerminalLine key={`${index}-${line.slice(0, 24)}`} line={line} />
        ))}

        {running || catchingUp ? (
          <span
            className="mt-1 inline-block h-4 w-[7px] animate-pulse"
            style={{ backgroundColor: C.cyan }}
            aria-hidden
          />
        ) : null}
      </div>

      {manualScroll ? (
        <button
          type="button"
          className="shrink-0 border-t border-white/10 px-5 py-2 text-left font-mono text-[11px] hover:opacity-100"
          style={{ color: C.dim, backgroundColor: C.bg }}
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
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-5 py-3"
          style={{ backgroundColor: C.bg }}
        >
          <p className="font-mono text-[11px]" style={{ color: C.dim }}>
            Engine panel stays open until you continue
          </p>
          <button
            type="button"
            onClick={onViewFullReport}
            className="font-mono text-[11px] uppercase tracking-[0.14em] hover:opacity-100"
            style={{ color: C.cyan }}
          >
            View full report
          </button>
        </div>
      ) : null}
    </section>
  );
}
