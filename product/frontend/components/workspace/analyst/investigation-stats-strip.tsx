"use client";

import { MetricTile } from "@/components/shared/workspace-card";
import { PriorityInvestigationRow } from "@/components/workspace/executive-investigation-overview";
import { buildPrioritizedInvestigations } from "@/lib/executive-investigation-overview";
import type { WorkbenchData } from "@/lib/types";
import { missingEvidenceChecklist } from "@/lib/workbench-report-helpers";
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

function InvestigationQueueBrief({ workbench }: { workbench: WorkbenchData }) {
  const queueStatus = workbench.investigation_queue_status;
  const prioritized = buildPrioritizedInvestigations(workbench).slice(0, 4);
  const missingEvidence = missingEvidenceChecklist(workbench).slice(0, 5);

  if (!queueStatus && !prioritized.length && !missingEvidence.length) return null;

  return (
    <div className="mt-8 border-t border-vx-border pt-6">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
        What Needs Analyst Review
      </h3>

      {queueStatus && !queueStatus.empty && prioritized.length ? (
        <div className="mt-4 space-y-1">
          <p className="max-w-[72ch] text-[13px] leading-relaxed text-white/75">
            {queueStatus.headline}
            {queueStatus.urgent ? ` · ${queueStatus.urgent} urgent` : ""}
          </p>
          <div className="mt-3 divide-y divide-vx-border">
            {prioritized.map((item) => (
              <PriorityInvestigationRow key={item.id} item={item} compact />
            ))}
          </div>
        </div>
      ) : null}

      {queueStatus?.empty ? (
        <div className="mt-4 max-w-[72ch] space-y-2">
          <p className="text-[13px] leading-relaxed text-white/75">{queueStatus.headline}</p>
          {(queueStatus.reasons ?? []).length ? (
            <ul className="space-y-1.5">
              {(queueStatus.reasons ?? []).map((reason) => (
                <li key={reason} className="flex gap-2 text-[12px] leading-relaxed text-white/60">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-white/40" aria-hidden />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {queueStatus.next_step ? (
            <p className="text-[12px] text-white/55">{queueStatus.next_step}</p>
          ) : null}
        </div>
      ) : null}

      {missingEvidence.length ? (
        <div className="mt-6">
          <p className="text-[12px] font-medium text-white/70">Evidence still needed to validate conclusions</p>
          <ul className="mt-3 space-y-3">
            {missingEvidence.map((item) => (
              <li key={item.topic} className="text-[12px] leading-relaxed text-white/60">
                <span className="font-medium text-white/80">{item.topic}</span>
                <span className="text-white/45"> — {item.whyItMatters}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!queueStatus?.empty && !missingEvidence.length && !prioritized.length && queueStatus?.headline ? (
        <p className="mt-4 max-w-[72ch] text-[13px] leading-relaxed text-white/75">
          {queueStatus.headline}
        </p>
      ) : null}
    </div>
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
      <InvestigationQueueBrief workbench={workbench} />
    </div>
  );
}
