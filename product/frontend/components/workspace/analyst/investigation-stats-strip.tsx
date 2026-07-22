"use client";

import { MetricTile } from "@/components/shared/workspace-card";
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

export function InvestigationStatsStrip({
  stats,
}: {
  stats: InvestigationStatsSnapshot;
}) {
  return (
    <section
      className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6"
      aria-label="Investigation statistics"
    >
      <MetricTile flat label="Files ingested" value={stats.files.toLocaleString()} sub="Uploaded evidence" />
      <MetricTile
        flat
        label="Findings retained"
        value={stats.retained.toLocaleString()}
        sub="Passed evidence review"
      />
      <MetricTile
        flat
        label="Investigations"
        value={stats.investigations.toLocaleString()}
        sub="Clustered analyst queue"
      />
      <MetricTile
        flat
        label="Cross-source"
        value={stats.crossMatches.toLocaleString()}
        sub={`${stats.sources} scanner type${stats.sources === 1 ? "" : "s"}`}
      />
      <MetricTile
        flat
        label="Validated paths"
        value={stats.validatedPaths.toLocaleString()}
        sub={`${stats.rejectedPaths} rejected`}
      />
      <MetricTile flat label="Analyst time saved" value={stats.hoursSaved} sub="Engine triage" />
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
  const queueStatus = workbench.investigation_queue_status;

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
      {queueStatus?.empty && (queueStatus.retained_findings ?? 0) > 0 ? (
        <div className="mt-6 max-w-[72ch] space-y-2">
          <p className="text-[13px] leading-relaxed text-white/75">{queueStatus.headline}</p>
          <ul className="space-y-1.5">
            {(queueStatus.reasons ?? []).map((reason) => (
              <li key={reason} className="flex gap-2 text-[12px] leading-relaxed text-white/60">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-white/40" aria-hidden />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          {queueStatus.next_step ? (
            <p className="text-[12px] text-white/55">{queueStatus.next_step}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
