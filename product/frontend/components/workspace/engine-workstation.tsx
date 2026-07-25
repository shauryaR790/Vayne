"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MathematicalModelPanel } from "@/components/workspace/mathematical-model-panel";
import { STAGE_LABELS, type EngineTraceEvent } from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

const BG = "#141414";

const BANNER = `███████╗ ██╗   ██╗ █████╗ ██╗   ██╗███╗   ██╗███████╗
██╔════╝ ██║   ██║██╔══██╗╚██╗ ██╔╝████╗  ██║██╔════╝
██║      ██║   ██║███████║ ╚████╔╝ ██╔██╗ ██║█████╗  
██║      ╚██╗ ██╔╝██╔══██║  ╚██╔╝  ██║╚██╗██║██╔══╝  
╚██████╗  ╚████╔╝ ██║  ██║   ██║   ██║ ╚████║███████╗
 ╚═════╝   ╚═══╝  ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═══╝╚══════╝`;

type StageCard = {
  stage: string;
  label: string;
  lines: string[];
  active: boolean;
};

function formatVal(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
  }
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Compact engineering cards from real stage events (no fabricated values). */
function buildStageCards(events: EngineTraceEvent[]): StageCard[] {
  const order = [
    "parser",
    "normalization",
    "deduplication",
    "correlation",
    "validation",
    "confidence",
    "attack_graph",
    "priority",
    "investigation",
    "export",
    "summary",
    "ai_explanation",
  ];
  const byStage = new Map<string, EngineTraceEvent[]>();
  for (const ev of events) {
    if (ev.event === "line" || ev.event === "formula_catalog") continue;
    if (!ev.stage || ev.stage === "console" || ev.stage === "proof") continue;
    const list = byStage.get(ev.stage) || [];
    list.push(ev);
    byStage.set(ev.stage, list);
  }

  const cards: StageCard[] = [];
  for (const stage of order) {
    const list = byStage.get(stage);
    if (!list?.length) continue;
    const last = list[list.length - 1];
    const lines: string[] = [];
    if (last.message) lines.push(last.message);
    if (last.execution_ms != null) lines.push(`${formatVal(last.execution_ms)} ms`);

    const f = last.fields || {};
    const pick = (keys: string[]) => {
      for (const k of keys) {
        if (f[k] != null && f[k] !== "") lines.push(`${k.replace(/_/g, " ")}  ${formatVal(f[k])}`);
      }
    };

    if (stage === "parser") {
      pick(["files_processed", "raw_findings", "raw_assets", "hosts", "ports", "services", "cache_hits", "cache_misses"]);
    } else if (stage === "normalization") {
      pick(["mapped_findings", "schema", "uuid_assigned", "service_canonicalization", "version_parsing"]);
    } else if (stage === "deduplication") {
      pick(["raw_findings", "unique_findings", "duplicates_removed"]);
    } else if (stage === "correlation") {
      pick(["correlated_findings", "assets"]);
    } else if (stage === "validation") {
      pick(["validated", "retained", "false_positives"]);
    } else if (stage === "confidence") {
      // Show latest score compactly; count how many score events
      const scores = list.filter((e) => e.event === "score");
      lines.push(`scores computed  ${scores.length}`);
      if (last.fields?.overall_confidence != null) {
        lines.push(`latest  ${formatVal(last.fields.overall_confidence)}`);
      }
      if (last.fields?.title) lines.push(String(last.fields.title));
    } else if (stage === "attack_graph") {
      pick([
        "nodes",
        "edges",
        "rejected_edges",
        "attack_paths",
        "graph_density",
        "average_degree",
        "paths_enumerated",
        "paths_accepted",
        "paths_rejected",
        "algorithm",
      ]);
    } else if (stage === "priority") {
      const scores = list.filter((e) => e.event === "score");
      lines.push(`priority scores  ${scores.length}`);
      if (last.fields?.priority != null) lines.push(`latest  ${formatVal(last.fields.priority)}`);
    } else if (stage === "investigation") {
      pick(["investigations_generated", "full_investigations"]);
    } else if (stage === "export") {
      pick(["export_dir"]);
    } else if (stage === "summary") {
      pick([
        "execution_time_s",
        "files_processed",
        "raw_findings",
        "normalized_findings",
        "duplicates_removed",
        "retained_findings",
        "investigations_generated",
        "attack_graph_nodes",
        "attack_graph_edges",
        "attack_paths",
        "average_confidence",
        "highest_priority",
      ]);
    } else if (stage === "ai_explanation") {
      pick(["ai_invoked_in_engine", "deterministic_execution_ms", "investigations", "average_confidence"]);
    } else {
      for (const [k, v] of Object.entries(f)) {
        if (k === "samples" || k === "note" || k === "files" || k === "formulas") continue;
        if (v == null) continue;
        lines.push(`${k.replace(/_/g, " ")}  ${formatVal(v)}`);
      }
    }

    cards.push({
      stage,
      label: (STAGE_LABELS[stage] || stage).toUpperCase(),
      lines: lines.filter(Boolean),
      active: last.event === "start" || last.event === "score",
    });
  }
  return cards;
}

function EngineBootBanner({ version }: { version: string }) {
  return (
    <div className="border border-white/[0.1] bg-[#141414] px-4 py-4 font-mono text-[11px] leading-[1.35] text-white/80 sm:text-[12px]">
      <p className="mb-2 tracking-[0.18em] text-white/50">VAYNE ENGINE</p>
      <pre className="overflow-x-auto whitespace-pre text-white/90">{BANNER}</pre>
      <div className="mt-4 space-y-1 border-t border-white/[0.08] pt-3 text-white/55">
        <p>Deterministic Investigation Engine</p>
        <p>Build {version}</p>
        <p>Graph Engine ✓</p>
        <p>Confidence Engine ✓</p>
        <p>Priority Engine ✓</p>
        <p>Attack Path Engine ✓</p>
      </div>
    </div>
  );
}

export function EngineWorkstation({
  events,
  running,
  onViewFullReport,
  className,
}: {
  events: EngineTraceEvent[];
  running?: boolean;
  onViewFullReport?: () => void;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [manualScroll, setManualScroll] = useState(false);
  const cards = useMemo(() => buildStageCards(events), [events]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [cards.length, events.length]);

  return (
    <section className={cn("flex h-full min-h-0 w-full flex-col", className)} style={{ backgroundColor: BG }}>
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-2">
        <p className="font-mono text-[13px] text-white/70">VAYNE ENGINE</p>
        <p className="font-mono text-[13px] tabular-nums text-white/70">
          {running ? "RUNNING" : "COMPLETE"} · {events.length} events
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          style={{ scrollBehavior: "auto" }}
          onScroll={() => {
            const el = scrollerRef.current;
            if (!el) return;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
            stickToBottom.current = atBottom;
            setManualScroll(!atBottom);
          }}
        >
          <EngineBootBanner version="0.2.0" />

          <div className="mt-5 space-y-0 font-mono text-[12.5px] leading-[1.45] text-white/75">
            {cards.length === 0 && running ? (
              <p className="text-white/40">Booting deterministic pipeline…</p>
            ) : null}

            {cards.map((card) => (
              <div key={card.stage} className="border-b border-white/[0.08] py-4">
                <p className="mb-2 tracking-[0.14em] text-white/90">{card.label}</p>
                <div className="space-y-1">
                  {card.lines.map((line, i) => (
                    <p key={i} className="tabular-nums text-white/60">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            {running ? <span className="mt-2 inline-block text-white/50">▌</span> : null}
          </div>
        </div>

        <div className="h-[40vh] shrink-0 border-t border-white/[0.08] lg:h-auto lg:w-[340px] lg:border-t-0 xl:w-[380px]">
          <MathematicalModelPanel events={events} className="h-full" />
        </div>
      </div>

      {manualScroll ? (
        <button
          type="button"
          className="shrink-0 border-t border-white/[0.08] px-4 py-1.5 text-left font-mono text-[12px] text-white/70"
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
        <div className="flex shrink-0 justify-end border-t border-white/[0.08] px-4 py-2">
          <button
            type="button"
            onClick={onViewFullReport}
            className="font-mono text-[13px] text-white/70 hover:text-white"
          >
            View full report
          </button>
        </div>
      ) : null}
    </section>
  );
}
