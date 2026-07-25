"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  STAGE_LABELS,
  type EngineTraceEvent,
} from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

/**
 * CLI-accurate palette (Rich / Windows Terminal look from proof mode).
 * Mostly white — accents only on IPs (green) and ports/CVE/versions (cyan).
 */
const C = {
  bg: "#141414",
  fg: "#CCCCCC",
  white: "#E6E6E6",
  dim: "#9A9A9A",
  green: "#6A9955",
  cyan: "#4EC9B0",
  reject: "#CE9178",
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

function push(out: Seg[], text: string, color: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.color === color) last.text += text;
  else out.push({ text, color });
}

/**
 * Sparse highlighting only — default is plain white/gray like a real terminal.
 * Green = IPv4. Cyan = tcp|udp ports, CVE ids, CANDIDATE/VERIFIED, software versions.
 */
function colorize(line: string): Seg[] {
  if (!line.trim()) return [{ text: "\u00a0", color: C.fg }];

  if (line.startsWith("REJECTED")) {
    return [{ text: line, color: C.reject }];
  }

  // evidence: label dim, rest white + rare accents
  const evMatch = line.match(/^(\s*)(evidence:|Evidence:)(\s*)(.*)$/);
  if (evMatch) {
    const out: Seg[] = [];
    push(out, evMatch[1] + evMatch[2] + evMatch[3], C.dim);
    out.push(...paintAccents(evMatch[4], C.white));
    return out;
  }

  // Field labels stay dim; values stay white (not gold/cyan dumps)
  const field = line.match(
    /^(\s*)(Tool:|Artifact:|Tier:|Confidence:|Validation:|DISCOVERED FROM|Execution:|Formula:|Result:)(.*)$/i,
  );
  if (field) {
    const out: Seg[] = [];
    push(out, field[1] + field[2], C.dim);
    out.push(...paintAccents(field[3], C.white));
    return out;
  }

  return paintAccents(line, C.fg);
}

function paintAccents(text: string, base: string): Seg[] {
  if (!text) return [];
  type Hit = { start: number; end: number; color: string };
  const hits: Hit[] = [];

  const addAll = (re: RegExp, color: string) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, color });
    }
  };

  // IPs first (green) — reserve those spans so versions can't steal octets.
  const ipSpans: Array<{ start: number; end: number }> = [];
  {
    const re = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ipSpans.push({ start: m.index, end: m.index + m[0].length });
      hits.push({ start: m.index, end: m.index + m[0].length, color: C.green });
    }
  }

  const overlapsIp = (start: number, end: number) =>
    ipSpans.some((s) => start < s.end && end > s.start);

  addAll(/\bCVE-\d{4}-\d+\b/g, C.cyan);
  addAll(/\b(?:CANDIDATE|VERIFIED)\b/g, C.cyan);

  // Port digits only: tcp/80 or udp/445
  {
    const re = /(?:tcp|udp)\/(\d{1,5})\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const digit = m[1];
      const start = m.index + m[0].lastIndexOf(digit);
      hits.push({ start, end: start + digit.length, color: C.cyan });
    }
  }

  // Software versions like 3.0.20-Debian — never inside an IP
  {
    const re = /\b\d+\.\d+\.\d+(?:-[A-Za-z0-9._]+)?\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (overlapsIp(m.index, m.index + m[0].length)) continue;
      hits.push({ start: m.index, end: m.index + m[0].length, color: C.cyan });
    }
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const taken: Hit[] = [];
  for (const h of hits) {
    if (taken.some((t) => h.start < t.end && h.end > t.start)) continue;
    taken.push(h);
  }
  taken.sort((a, b) => a.start - b.start);

  const out: Seg[] = [];
  let cursor = 0;
  for (const h of taken) {
    if (h.start > cursor) push(out, text.slice(cursor, h.start), base);
    push(out, text.slice(h.start, h.end), h.color);
    cursor = h.end;
  }
  if (cursor < text.length) push(out, text.slice(cursor), base);
  if (!out.length) push(out, text, base);
  return out;
}

function TerminalLine({ line }: { line: string }) {
  const segs = useMemo(() => colorize(line), [line]);
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

  const lines = useMemo(() => eventsToLines(events), [events]);

  // No artificial drip — show lines as soon as events arrive (real terminal buffer).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <section
      className={cn("flex h-full min-h-0 w-full flex-col border-b border-white/10", className)}
      style={{ backgroundColor: C.bg }}
    >
      <header
        className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-2"
        style={{ backgroundColor: C.bg }}
      >
        <p
          className="font-mono text-[13px] leading-[1.35]"
          style={{
            color: C.fg,
            fontFamily: "Consolas, 'Courier New', ui-monospace, monospace",
          }}
        >
          Engine Trace
        </p>
        <p
          className="font-mono text-[13px] leading-[1.35] tabular-nums"
          style={{
            color: C.fg,
            fontFamily: "Consolas, 'Courier New', ui-monospace, monospace",
          }}
        >
          {running ? "RUNNING" : "COMPLETE"} · {lines.length}
        </p>
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-[13px] leading-[1.35]"
        style={{
          backgroundColor: C.bg,
          color: C.fg,
          fontFamily: "Consolas, 'Courier New', ui-monospace, monospace",
          scrollBehavior: "auto",
        }}
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          stickToBottom.current = atBottom;
          setManualScroll(!atBottom);
        }}
      >
        {lines.length === 0 ? (
          <p style={{ color: C.dim }}>Waiting for engine events…</p>
        ) : null}

        {lines.map((line, index) => (
          <TerminalLine key={index} line={line} />
        ))}

        {running ? (
          <span style={{ color: C.fg }} aria-hidden>
            ▌
          </span>
        ) : null}
      </div>

      {manualScroll ? (
        <button
          type="button"
          className="shrink-0 border-t border-white/[0.08] px-4 py-1.5 text-left font-mono text-[12px]"
          style={{ color: C.white, backgroundColor: C.bg }}
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

      {!running && onViewFullReport ? (
        <div
          className="flex shrink-0 items-center justify-end border-t border-white/[0.08] px-4 py-2"
          style={{ backgroundColor: C.bg }}
        >
          <button
            type="button"
            onClick={onViewFullReport}
            className="font-mono text-[13px] leading-[1.35]"
            style={{
              color: C.fg,
              fontFamily: "Consolas, 'Courier New', ui-monospace, monospace",
            }}
          >
            View full report
          </button>
        </div>
      ) : null}
    </section>
  );
}
