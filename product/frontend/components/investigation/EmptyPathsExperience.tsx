import { RejectedChainsPanel } from "@/components/investigation/RejectedChainsPanel";
import { Panel, StatRow } from "@/components/ui/Workstation";
import { IconCheck } from "@/components/ui/icons";
import type { InvestigationReport } from "@/lib/types";
import { parseRejectedChains } from "@/lib/report-helpers";
import { countServices, countSoftware } from "@/lib/report-helpers";

export function EmptyPathsExperience({ report }: { report: InvestigationReport }) {
  const stats = report.stats;
  const gp = report.graph_proof as Record<string, unknown>;
  const discovery = (gp?.path_discovery as Record<string, unknown>) || {};
  const chains = parseRejectedChains(report);

  const checks = [
    { label: "assets", value: report.assets?.length ?? 0 },
    { label: "services", value: countServices(report) },
    { label: "software", value: countSoftware(report) },
    { label: "candidate vulns", value: stats.observed },
  ];

  return (
    <div className="space-y-4">
      <Panel title="No verified attack paths">
        <p className="text-body text-vercel-muted mb-4">
          VAYNE completed analysis but could not verify a complete attack chain.
        </p>

        <p className="vx-label mb-3">VAYNE investigated</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {checks.map((c) => (
            <div key={c.label} className="vx-panel border border-vercel-border p-3">
              <div className="flex items-center gap-2 text-vercel-success mb-1">
                <IconCheck className="w-3 h-3" />
                <span className="text-label font-bold uppercase">{c.label}</span>
              </div>
              <p className="text-card font-bold text-white tabular-nums">{c.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-body border-t border-vercel-border pt-4">
          <StatRow label="Candidate paths" value={Number(discovery.raw_paths_enumerated ?? stats.hypothetical_paths ?? 0)} />
          <StatRow label="Rejected paths" value={stats.paths_rejected ?? 0} />
          <StatRow label="Exploit checks" value={stats.likely_exploitable + stats.confirmed} />
          <StatRow label="Paths explored" value={stats.paths_explored ?? 0} />
          <StatRow label="False positives removed" value={stats.false_positives_removed} />
          <StatRow label="Unknowns" value={stats.unknowns_requiring_investigation ?? 0} />
        </div>
      </Panel>

      {chains.length > 0 && <RejectedChainsPanel chains={chains} />}
    </div>
  );
}
