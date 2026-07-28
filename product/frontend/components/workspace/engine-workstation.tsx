"use client";

import { useMemo } from "react";

import { InvestigationEngineHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { VayneAsciiTitle } from "@/components/brand/vayne-ascii-title";
import type { EngineTraceEvent } from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

const BG = "#141414";

type PhaseState = {
  phase: string;
  progressPct: number;
  filesIngested: number;
  filesProcessed: number;
  elapsedS: number | null;
  status: string;
  version: string;
  createdBy: string;
};

type AttentionEvidence = {
  scanner: string;
  detail: string;
};

/** One Attention Queue card = one actionable investigation. */
type AttentionItem = {
  finding_id: string;
  title: string;
  subject?: string;
  host: string;
  host_count?: number;
  severity: string;
  priority?: number;
  confidence?: number;
  attention_required?: string;
  evidence?: AttentionEvidence[];
  files?: string[];
  source_file?: string | null;
  source_files?: string[];
  why_this_matters?: string;
  potential_impact?: string;
  recommended_action?: string;
  reason?: string;
  reasons?: string[];
  cve?: string | null;
  on_attack_path?: boolean;
};

function latestPhase(events: EngineTraceEvent[]): PhaseState {
  let state: PhaseState = {
    phase: "Boot",
    progressPct: 0,
    filesIngested: 0,
    filesProcessed: 0,
    elapsedS: null,
    status: "idle",
    version: "0.2.0",
    createdBy: "Nemzyi",
  };
  for (const ev of events) {
    if (ev.event !== "phase" || !ev.fields) continue;
    const f = ev.fields;
    state = {
      phase: String(f.phase || state.phase),
      progressPct: Number(f.progress_pct ?? state.progressPct),
      filesIngested: Number(f.files_ingested ?? state.filesIngested),
      filesProcessed: Number(f.files_processed ?? state.filesProcessed),
      elapsedS: f.elapsed_s != null ? Number(f.elapsed_s) : state.elapsedS,
      status: String(f.status || state.status),
      version: String(f.version || state.version),
      createdBy: String(f.created_by || state.createdBy),
    };
  }
  return state;
}

function attentionQueue(events: EngineTraceEvent[]): AttentionItem[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.event === "attention" && Array.isArray(ev.fields?.findings)) {
      return (ev.fields.findings as AttentionItem[]).slice(0, 6);
    }
  }
  return [];
}

function sourceFiles(item: AttentionItem): string[] {
  const fromList = [...(item.files ?? []), ...(item.source_files ?? [])]
    .map((f) => String(f || "").trim())
    .filter(Boolean);
  if (fromList.length) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of fromList) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }
  if (item.source_file) return [item.source_file];
  return [];
}

function ProgressBar({ pct, phase }: { pct: number; phase: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round((clamped / 100) * 28);
  const bar = "█".repeat(filled) + "░".repeat(28 - filled);
  return (
    <div className="py-1 font-mono text-[12px] text-white/75">
      <p className="tracking-wide text-white/90">{bar}</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="tabular-nums text-white">{clamped}%</span>
        <span className="text-white/50">{phase}</span>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-white/[0.06] py-1.5">
      <span className="text-white/45">{label}</span>
      <span className="tabular-nums text-white/85">{value}</span>
    </div>
  );
}

function AttentionCard({
  item,
  onOpen,
}: {
  item: AttentionItem;
  onOpen?: () => void;
}) {
  const subject = item.subject || item.title || "Investigation";
  const hostLabel =
    item.host_count && item.host_count > 1
      ? `${item.host} (+${item.host_count - 1} more)`
      : item.host || "—";
  const files = sourceFiles(item);
  const attentionRequired =
    item.attention_required ||
    item.reasons?.[0] ||
    item.reason ||
    "Needs analyst review";
  const why =
    item.why_this_matters ||
    item.reason ||
    (item.reasons?.length ? item.reasons.join(" ") : "Evidence indicates analyst review is required.");
  const impact = item.potential_impact || "Residual risk remains until validated or closed.";
  const action = item.recommended_action || "Validate manually.";
  const evidence = item.evidence?.length
    ? item.evidence
    : item.cve
      ? [{ scanner: "Engine", detail: item.cve }]
      : [];

  return (
    <article className="border border-white/[0.1] bg-white/[0.02] px-4 py-3.5 font-mono text-[12px]">
      <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">
        {item.severity || "MEDIUM"}
        {item.on_attack_path ? " · PATH" : ""}
      </p>

      <p className="mt-2 text-[13px] leading-snug text-white">{subject}</p>
      <p className="mt-0.5 text-white/55">{hostLabel}</p>

      <div className="mt-3 space-y-3 text-white/55">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Attention Required</p>
          <p className="mt-1 text-white/85">{attentionRequired}</p>
        </div>

        {evidence.length > 0 ? (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Evidence</p>
            <ul className="mt-1 space-y-0.5">
              {evidence.map((row) => (
                <li key={`${row.scanner}-${row.detail}`} className="flex gap-2 text-white/75">
                  <span className="shrink-0 text-white/45">{row.scanner}</span>
                  <span className="min-w-0 break-words text-white/80">{row.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">
            {files.length === 1 ? "Source File" : "Files"}
          </p>
          {files.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-white/80">
              {files.map((name) => (
                <li key={name} className="truncate" title={name}>
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-white/40">Unattributed in this run</p>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Why this matters</p>
          <p className="mt-1 leading-relaxed text-white/70">{why}</p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Potential Impact</p>
          <p className="mt-1 leading-relaxed text-white/80">{impact}</p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Recommended Action</p>
          <p className="mt-1 leading-relaxed text-white/85">{action}</p>
        </div>
      </div>

      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="mt-3.5 text-left text-white/70 transition-colors hover:text-white"
        >
          Open Investigation →
        </button>
      ) : null}
    </article>
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
  const phase = useMemo(() => latestPhase(events), [events]);
  const queue = useMemo(() => attentionQueue(events), [events]);
  const statusLabel = running
    ? phase.status === "complete"
      ? "Complete"
      : "Running"
    : phase.progressPct >= 100
      ? "Complete"
      : events.length
        ? "Complete"
        : "Idle";

  return (
    <section className={cn("flex h-full min-h-0 w-full flex-col", className)} style={{ backgroundColor: BG }}>
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden bg-[#141414]">
        <InvestigationEngineHeader />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-4">
          <div className="shrink-0">
            <VayneAsciiTitle />
          </div>

          <div className="mt-6 flex flex-col pb-2">
            <div className="py-1 font-mono text-[11px] leading-[1.35] text-white/80 sm:text-[12px]">
              <p className="mb-2 text-white/90">Deterministic Investigation Engine</p>
              <MetaRow label="Version" value={phase.version} />
              <MetaRow label="Created By" value={phase.createdBy} />
              <MetaRow label="Current Phase" value={phase.phase} />
              <MetaRow label="Files Ingested" value={String(phase.filesIngested)} />
              <MetaRow
                label="Files Processed"
                value={`${phase.filesProcessed} / ${phase.filesIngested || phase.filesProcessed}`}
              />
              <MetaRow label="Engine Status" value={statusLabel} />
              <MetaRow
                label="Execution Time"
                value={phase.elapsedS != null ? `${phase.elapsedS.toFixed(2)} s` : "—"}
              />

              {!running && onViewFullReport ? (
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={onViewFullReport}
                    className={cn(
                      "border border-white/20 px-4 py-2.5 text-[12px] uppercase tracking-[0.14em] text-white/80",
                      "transition-colors hover:border-white/40 hover:text-white",
                    )}
                  >
                    View full report
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              <ProgressBar pct={phase.progressPct} phase={phase.phase} />
            </div>

            <div className="pt-8 pb-1">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
                  Attention Queue
                </p>
                {queue.length > 0 ? (
                  <p className="font-mono text-[11px] tabular-nums text-white/35">
                    {queue.length} need{queue.length === 1 ? "s" : ""} attention
                  </p>
                ) : null}
              </div>
              {queue.length === 0 ? (
                <p className="font-mono text-[12px] text-white/35">
                  {running
                    ? "Correlating evidence into the Attention Queue…"
                    : "No investigations required attention for this run"}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {queue.map((item) => (
                    <AttentionCard
                      key={item.finding_id}
                      item={item}
                      onOpen={onViewFullReport}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
