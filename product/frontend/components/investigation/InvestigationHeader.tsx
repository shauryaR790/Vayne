import { formatTimestamp } from "@/lib/format";
import { ENGINE_VERSION } from "@/lib/report-helpers";
import type { InvestigationDetail, InvestigationReport } from "@/lib/types";

export function InvestigationHeader({
  detail,
  report,
}: {
  detail: InvestigationDetail;
  report: InvestigationReport;
}) {
  const s = detail.summary;
  const statusClass =
    s.status === "complete"
      ? "vx-badge-success"
      : s.status === "failed"
        ? "vx-badge-danger"
        : "vx-badge-warning";

  return (
    <header className="border border-vercel-border bg-vercel-panel px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-body">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-card font-bold text-white truncate">{s.name}</h1>
        <span className={statusClass}>{s.status}</span>
      </div>
      <span className="text-vercel-muted font-semibold">{report.duration_seconds.toFixed(1)}s analysis</span>
      <span
        className="text-vercel-muted font-mono text-label min-w-0 max-w-[240px] break-all"
        title={report.target}
      >
        {report.target.split(/[/\\]/).pop()}
      </span>
      <span className="text-vercel-muted font-semibold">{formatTimestamp(s.created_at)}</span>
      <span className="text-vercel-muted font-mono text-label">v{ENGINE_VERSION}</span>
      <span className="text-vercel-muted font-mono text-label ml-auto">{s.id}</span>
    </header>
  );
}
