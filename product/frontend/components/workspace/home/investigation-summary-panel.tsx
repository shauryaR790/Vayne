"use client";

import type { WorkbenchSummaryPanel } from "@/lib/types";

function SummaryCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">{label}</p>
      <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

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
      className={`grid grid-cols-2 gap-2 sm:grid-cols-3${className ? ` ${className}` : ""}`}
      aria-label="Investigation summary"
    >
      <SummaryCell label="Files uploaded" value={summary.files_uploaded.toLocaleString()} />
      <SummaryCell
        label="Investigations generated"
        value={summary.investigations_generated.toLocaleString()}
      />
      <SummaryCell label="Evidence signals" value={summary.evidence_signals.toLocaleString()} />
      <SummaryCell
        label="Duplicate findings removed"
        value={summary.duplicate_findings_removed.toLocaleString()}
      />
      <SummaryCell
        label="Immediate review"
        value={summary.investigations_requiring_immediate_review.toLocaleString()}
      />
      <SummaryCell label="Analyst hours saved" value={hours} />
    </section>
  );
}
