"use client";

import type { WorkbenchData } from "@/lib/types";
import { InvestigationSummaryPanel } from "@/components/workspace/home/investigation-summary-panel";

export interface InvestigationStatsSnapshot {
  files: number;
  sources: number;
  retained: number;
  investigations: number;
  crossMatches: number;
  validatedPaths: number;
  rejectedPaths: number;
  hoursSaved: string | number;
}

export function buildInvestigationStatsSnapshot(
  workbench: WorkbenchData,
  uploadedFileCount?: number,
): InvestigationStatsSnapshot {
  const metrics = workbench.executive_metrics;
  const stat = (label: string) =>
    workbench.statistics.find((row) => row.label === label)?.value;

  const hoursSaved =
    metrics?.analyst_hours_saved != null
      ? `${metrics.analyst_hours_saved}h`
      : stat("Analyst Time Saved") ?? "—";

  return {
    files: uploadedFileCount ?? metrics?.files ?? workbench.totals.files ?? 0,
    sources: metrics?.files ? workbench.totals.sources : workbench.totals.sources ?? 0,
    retained:
      metrics?.findings_retained ??
      workbench.totals.confirmed_findings ??
      workbench.confirmed_findings.length,
    investigations:
      metrics?.investigations ??
      workbench.investigations?.length ??
      workbench.priority_queue?.length ??
      0,
    crossMatches: metrics?.cross_source_matches ?? workbench.totals.cross_source_matches ?? 0,
    validatedPaths: metrics?.validated_paths ?? workbench.totals.validated_paths ?? 0,
    rejectedPaths: workbench.totals.rejected_paths ?? 0,
    hoursSaved,
  };
}

function StatCell({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">{label}</p>
      <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-white">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-white/35">{sub}</p> : null}
    </div>
  );
}

export function InvestigationStatsStrip({
  stats,
}: {
  stats: InvestigationStatsSnapshot;
}) {
  return (
    <section
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      aria-label="Investigation statistics"
    >
      <StatCell label="Files ingested" value={stats.files.toLocaleString()} sub="Uploaded evidence" />
      <StatCell
        label="Findings retained"
        value={stats.retained.toLocaleString()}
        sub="Passed evidence review"
      />
      <StatCell
        label="Investigations"
        value={stats.investigations.toLocaleString()}
        sub="Clustered analyst queue"
      />
      <StatCell
        label="Cross-source"
        value={stats.crossMatches.toLocaleString()}
        sub={`${stats.sources} scanner type${stats.sources === 1 ? "" : "s"}`}
      />
      <StatCell
        label="Validated paths"
        value={stats.validatedPaths.toLocaleString()}
        sub={`${stats.rejectedPaths} rejected`}
      />
      <StatCell label="Analyst time saved" value={stats.hoursSaved} sub="Engine triage" />
    </section>
  );
}

export function InvestigationStatisticsSection({
  workbench,
  uploadedFileCount,
}: {
  workbench: WorkbenchData;
  uploadedFileCount?: number;
}) {
  const panel = workbench.summary_panel;

  return (
    <div className="border-b border-vx-border bg-vx-section-body px-6 py-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
        Investigation Statistics
      </h2>
      <div className="mt-4">
        {panel ? (
          <InvestigationSummaryPanel summary={panel} />
        ) : (
          <InvestigationStatsStrip
            stats={buildInvestigationStatsSnapshot(workbench, uploadedFileCount)}
          />
        )}
      </div>
    </div>
  );
}
