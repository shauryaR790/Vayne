import { getInvestigation, getReport } from "@/lib/api";
import { topRejectionReasons } from "@/lib/report-helpers";
import { DeploymentPathCard } from "@/components/investigation/AttackPathCard";
import { Panel, StatRow } from "@/components/ui/Workstation";

export default async function PathsPage({ params }: { params: { id: string } }) {
  const [detail, report] = await Promise.all([
    getInvestigation(params.id),
    getReport(params.id),
  ]);

  const hasPaths = detail.attack_paths.length > 0;
  const stats = report.stats;
  const gp = report.graph_proof as Record<string, unknown>;
  const discovery = (gp?.path_discovery as Record<string, unknown>) || {};
  const rejectedProofs = (discovery.rejected_path_proofs as unknown[]) || [];
  const rejectionReasons = topRejectionReasons(report);

  if (!hasPaths) {
    return (
      <div className="space-y-6 max-w-[1200px]">
        <header className="text-center border-b border-vercel-border pb-6">
          <h1 className="vx-section-title">Attack Paths</h1>
          <p className="text-body text-vercel-muted mt-2">No verified attack paths.</p>
        </header>

        <Panel title="VAYNE Attempted">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-body text-white">
            <StatRow
              label="Candidate paths"
              value={Number(discovery.candidate_paths ?? stats.paths_explored ?? 0)}
            />
            <StatRow label="Verified exploit checks" value={stats.likely_exploitable + stats.confirmed} />
            <StatRow label="Paths explored" value={stats.paths_explored ?? 0} />
            <StatRow label="Paths rejected" value={stats.paths_rejected ?? 0} />
          </div>
        </Panel>

        <Panel title="Reasons Rejected">
          <ul className="space-y-2 text-body text-white">
            {(rejectionReasons.length
              ? rejectionReasons
              : [
                  "no verified exploit",
                  "insufficient confidence",
                  "no privilege chain",
                  "missing credential evidence",
                ]
            ).map((r) => (
              <li key={r} className="flex gap-2 border border-vercel-border px-3 py-2 min-w-0">
                <span className="text-vercel-danger shrink-0">—</span>
                <span className="break-words min-w-0">{r}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {rejectedProofs.length > 0 && (
          <Panel title="Rejected Paths">
            <pre className="text-metadata font-mono text-zinc-300 whitespace-pre-wrap">
              {JSON.stringify(rejectedProofs, null, 2)}
            </pre>
          </Panel>
        )}

        {(gp?.rejected_edges as unknown[])?.length ? (
          <Panel title="Rejected Edges">
            <pre className="text-metadata font-mono text-zinc-300 whitespace-pre-wrap">
              {JSON.stringify(gp.rejected_edges, null, 2)}
            </pre>
          </Panel>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <header className="text-center border-b border-vercel-border pb-6">
        <h1 className="vx-section-title">Attack Paths</h1>
        <p className="text-body text-white mt-2">
          {detail.attack_paths.length} verified paths
        </p>
      </header>

      <div className="space-y-3">
        {detail.attack_paths.map((path, i) => (
          <DeploymentPathCard
            key={path.id}
            path={path}
            index={i}
            investigationId={params.id}
          />
        ))}
      </div>
    </div>
  );
}
