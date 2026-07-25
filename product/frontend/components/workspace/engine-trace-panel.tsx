"use client";

import { useEffect, useRef, useState } from "react";

import {
  STAGE_LABELS,
  type EngineTraceEvent,
} from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

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

function StageHeader({ stage }: { stage: string }) {
  return (
    <div className="mt-5 mb-2 border-b border-white/10 pb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
      [ {STAGE_LABELS[stage] || stage} ]
    </div>
  );
}

function FieldGrid({ fields }: { fields: Record<string, unknown> }) {
  const entries = Object.entries(fields).filter(
    ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
  );
  if (!entries.length) return null;
  return (
    <div className="mt-2 grid grid-cols-[minmax(120px,180px)_1fr] gap-x-4 gap-y-1 font-mono text-[12px] leading-relaxed">
      {entries.map(([key, value]) => {
        if (key === "samples" && Array.isArray(value)) {
          return (
            <div key={key} className="col-span-2 space-y-2">
              <p className="text-white/45">Samples</p>
              {value.slice(0, 5).map((sample, idx) => (
                <div key={idx} className="border border-white/10 px-3 py-2 text-white/80">
                  {typeof sample === "object" && sample
                    ? Object.entries(sample as Record<string, unknown>).map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-white/40">{k}</span>
                          <span className="text-white">{formatValue(v)}</span>
                        </div>
                      ))
                    : formatValue(sample)}
                </div>
              ))}
            </div>
          );
        }
        if (key === "contributions") return null;
        return (
          <div key={key} className="contents">
            <span className="text-white/40">{key.replace(/_/g, " ")}</span>
            <span className="break-all text-white">{formatValue(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function FormulaBlock({ formula }: { formula: NonNullable<EngineTraceEvent["formula"]> }) {
  const contributions = formula.contributions || [];
  return (
    <div className="mt-3 border border-white/10 bg-black/30 px-3 py-3 font-mono text-[12px]">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">
        {formula.name || "Computed From"}
      </p>
      {formula.expression ? (
        <p className="mt-2 text-white/70">{formula.expression}</p>
      ) : null}
      <div className="mt-3 space-y-1">
        {contributions.map((row, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_auto] gap-3 text-white/80">
            <span>{String(row.label || row.dimension || "factor")}</span>
            <span className="tabular-nums text-white">
              {formatValue(row.delta ?? row.weighted ?? row.value)}
              {row.weight != null ? (
                <span className="ml-2 text-white/35">× {formatValue(row.weight)}</span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-white">
        <span>Result</span>
        <span className="tabular-nums">
          {formatValue(formula.result_pct ?? formula.result)}
        </span>
      </div>
    </div>
  );
}

export function EngineTracePanel({
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

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [events]);

  let lastStage = "";

  return (
    <section
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-b border-vx-border bg-[#0a0a0a]",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            Engine Trace
          </p>
          <p className="mt-1 text-[12px] text-white/45">
            Live deterministic investigation engine — not AI
          </p>
        </div>
        <p className="font-mono text-[11px] tabular-nums text-white/50">
          {running ? "RUNNING" : "COMPLETE"} · {events.length} events
        </p>
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          stickToBottom.current = atBottom;
          setManualScroll(!atBottom);
        }}
      >
        {events.length === 0 ? (
          <p className="font-mono text-[12px] text-white/40">Waiting for engine events…</p>
        ) : null}

        {events.map((ev, index) => {
          const showStage = ev.stage !== lastStage;
          lastStage = ev.stage;
          return (
            <div key={ev.id || `${ev.stage}-${ev.event}-${index}`}>
              {showStage ? <StageHeader stage={ev.stage} /> : null}
              <article className="mb-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[12px]">
                  <span className="text-white/35">{ev.event}</span>
                  {ev.message ? <span className="text-white">{ev.message}</span> : null}
                  {ev.execution_ms != null ? (
                    <span className="text-white/40">{formatValue(ev.execution_ms)} ms</span>
                  ) : null}
                </div>
                {ev.stage === "ai_explanation" ? (
                  <p className="mt-1 font-mono text-[11px] text-white/35">
                    Optional · does not alter deterministic scores
                  </p>
                ) : null}
                {ev.fields ? <FieldGrid fields={ev.fields} /> : null}
                {ev.formula ? <FormulaBlock formula={ev.formula} /> : null}
              </article>
            </div>
          );
        })}

        {running ? (
          <p className="mt-4 font-mono text-[12px] text-white/35">Computing…</p>
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
    </section>
  );
}
