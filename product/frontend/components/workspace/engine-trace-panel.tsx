"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import type { EngineTraceEvent } from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

/**
 * CLI proof-mode palette (matches Cursor terminal / Rich output).
 * Mostly white — green IPs, cyan ports/CVE/versions only.
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

/**
 * Engine Trace shows the same text the CLI prints in proof mode.
 * Structured telemetry ([ Parser ], formulas, field dumps) is kept in the
 * event audit trail but never rendered here — that is what made the UI diverge.
 */
function eventsToLines(events: EngineTraceEvent[]): string[] {
  const lines: string[] = [];
  for (const ev of events) {
    if (ev.event !== "line") continue;
    // Proof stream only (NODE / EDGE / === sections) — identical to CLI --proof.
    if (ev.stage !== "proof") continue;
    lines.push(ev.message ?? "");
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

function colorize(line: string): Seg[] {
  if (!line.trim()) return [{ text: "\u00a0", color: C.fg }];

  if (line.startsWith("REJECTED")) {
    return [{ text: line, color: C.reject }];
  }

  const evMatch = line.match(/^(\s*)(evidence:|Evidence:)(\s*)(.*)$/);
  if (evMatch) {
    const out: Seg[] = [];
    push(out, evMatch[1] + evMatch[2] + evMatch[3], C.dim);
    out.push(...paintAccents(evMatch[4], C.white));
    return out;
  }

  const field = line.match(
    /^(\s*)(Tool:|Artifact:|Tier:|Confidence:|Validation:|DISCOVERED FROM)(.*)$/i,
  );
  if (field) {
    const out: Seg[] = [];
    push(out, field[1] + field[2], C.dim);
    out.push(...paintAccents(field[3], C.white));
    return out;
  }

  if (line.trimStart().startsWith("- ")) {
    return paintAccents(line, C.white);
  }

  return paintAccents(line, C.fg);
}

function paintAccents(text: string, base: string): Seg[] {
  if (!text) return [];
  type Hit = { start: number; end: number; color: string };
  const hits: Hit[] = [];
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

  {
    const re = /\bCVE-\d{4}-\d+\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, color: C.cyan });
    }
  }
  {
    const re = /\b(?:CANDIDATE|VERIFIED)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, color: C.cyan });
    }
  }
  {
    const re = /(?:tcp|udp)\/(\d{1,5})\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const digit = m[1];
      const start = m.index + m[0].lastIndexOf(digit);
      hits.push({ start, end: start + digit.length, color: C.cyan });
    }
  }
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
          <p style={{ color: C.dim }}>
            {running ? "Running deterministic engine…" : "No proof output for this run."}
          </p>
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
