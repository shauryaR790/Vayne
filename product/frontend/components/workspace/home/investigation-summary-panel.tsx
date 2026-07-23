"use client";

import { MetricTile } from "@/components/shared/workspace-card";
import type { WorkbenchSummaryPanel } from "@/lib/types";

export function InvestigationSummaryPanel({
  summary,
  className,
}: {
  summary: WorkbenchSummaryPanel;
  className?: string;
}) {
  const hours =
    summary.estimated_analyst_hours_saved > 0
      ? `${summary.estimated_analyst_hours_saved}h`
      : "—";

  return (
    <section
      className={`grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3${className ? ` ${className}` : ""}`}
      aria-label="Investigation operating metrics"
    >
      <MetricTile flat label="Files uploaded" value={summary.files_uploaded.toLocaleString()} />
      <MetricTile
        flat
        label="Investigations generated"
        value={summary.investigations_generated.toLocaleString()}
      />
      <MetricTile flat label="Evidence signals" value={summary.evidence_signals.toLocaleString()} />
      <MetricTile
        flat
        label="Duplicate findings removed"
        value={summary.duplicate_findings_removed.toLocaleString()}
      />
      <MetricTile
        flat
        label="Immediate review"
        value={summary.investigations_requiring_immediate_review.toLocaleString()}
      />
      <MetricTile flat label="Analyst hours saved" value={hours} />
    </section>
  );
}
