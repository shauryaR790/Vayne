"use client";

import { useMemo, useState } from "react";

import type { EngineTraceEvent } from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

type FormulaDef = {
  id: string;
  name: string;
  expression?: string;
  weights?: Record<string, number>;
  terms?: string[];
  source?: string;
};

type LiveScore = {
  formulaId: string;
  title: string;
  result: number | string;
  contributions: Array<{ label: string; value: number | string; weight?: number }>;
  expression?: string;
};

function catalogFromEvents(events: EngineTraceEvent[]): FormulaDef[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.event === "formula_catalog" && Array.isArray(ev.fields?.formulas)) {
      return ev.fields.formulas as FormulaDef[];
    }
  }
  return [];
}

function liveScoresFromEvents(events: EngineTraceEvent[]): LiveScore[] {
  const scores: LiveScore[] = [];
  for (const ev of events) {
    if (!ev.formula?.name) continue;
    const name = ev.formula.name;
    const id =
      name === "finding_confidence"
        ? "finding_confidence"
        : name === "composite_priority_score"
          ? "composite_priority_score"
          : name;
    const contributions = (ev.formula.contributions || []).map((row) => ({
      label: String(row.label || row.dimension || "factor"),
      value: (row.delta ?? row.weighted ?? row.value) as number | string,
      weight: row.weight as number | undefined,
    }));
    scores.push({
      formulaId: id,
      title: String(ev.fields?.title || ev.message || name),
      result: (ev.formula.result_pct ?? ev.formula.result) as number | string,
      contributions,
      expression: ev.formula.expression,
    });
  }
  return scores;
}

function formatNum(value: number | string): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
  }
  return String(value);
}

export function MathematicalModelPanel({
  events,
  className,
}: {
  events: EngineTraceEvent[];
  className?: string;
}) {
  const catalog = useMemo(() => catalogFromEvents(events), [events]);
  const live = useMemo(() => liveScoresFromEvents(events), [events]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const selected = catalog.find((f) => f.id === (activeId || catalog[0]?.id));
  const activeLive = live.filter((s) => s.formulaId === selected?.id).slice(-3);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-l border-white/[0.08] bg-[#141414]",
        className,
      )}
    >
      <header className="shrink-0 border-b border-white/[0.08] px-4 py-3">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-white/70">
          Mathematical Model
        </p>
        <p className="mt-1 font-mono text-[11px] text-white/35">
          Formulas implemented by the engine — not decorative
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
        <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-white/40">
          Active Formulas
        </p>
        <div className="space-y-1">
          {catalog.length === 0 ? (
            <p className="text-white/35">Waiting for formula catalog…</p>
          ) : (
            catalog.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveId(f.id)}
                className={cn(
                  "block w-full border px-3 py-2 text-left transition-colors",
                  selected?.id === f.id
                    ? "border-white/25 bg-white/[0.06] text-white"
                    : "border-white/[0.08] text-white/55 hover:border-white/20 hover:text-white/80",
                )}
              >
                {f.name}
              </button>
            ))
          )}
        </div>

        {selected ? (
          <div className="mt-5 border-t border-white/[0.08] pt-4">
            <p className="text-white">{selected.name}</p>
            {selected.expression ? (
              <p className="mt-3 whitespace-pre-wrap text-white/65">{selected.expression}</p>
            ) : null}
            {selected.weights && Object.keys(selected.weights).length > 0 ? (
              <div className="mt-4 space-y-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">Weights</p>
                {Object.entries(selected.weights).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 text-white/70">
                    <span>{k}</span>
                    <span className="tabular-nums text-white">{formatNum(v)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {selected.terms?.length ? (
              <div className="mt-4 space-y-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">Terms</p>
                {selected.terms.map((t) => (
                  <p key={t} className="text-white/55">
                    {t}
                  </p>
                ))}
              </div>
            ) : null}
            {selected.source ? (
              <p className="mt-4 text-[11px] text-white/30">{selected.source}</p>
            ) : null}
          </div>
        ) : null}

        {activeLive.length > 0 ? (
          <div className="mt-6 border-t border-white/[0.08] pt-4">
            <p className="mb-3 text-[10px] uppercase tracking-[0.12em] text-white/40">
              Live evaluation
            </p>
            {activeLive.map((score, idx) => (
              <div key={`${score.title}-${idx}`} className="mb-5 border border-white/[0.08] px-3 py-3">
                <p className="text-white/80">{score.title}</p>
                <div className="mt-3 space-y-1">
                  {score.contributions.map((c, i) => (
                    <div key={`${c.label}-${i}`} className="flex justify-between gap-3 text-white/65">
                      <span>{c.label}</span>
                      <span className="tabular-nums text-white">
                        {formatNum(c.value)}
                        {c.weight != null ? (
                          <span className="ml-2 text-white/35">× {formatNum(c.weight)}</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-between border-t border-white/[0.08] pt-2 text-white">
                  <span>Result</span>
                  <span className="tabular-nums">{formatNum(score.result)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
