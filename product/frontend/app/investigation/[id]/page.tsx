import Link from "next/link";
import {
  getInvestigation,
  getReport,
  getFindings,
} from "@/lib/api";
import {
  avgConfidence,
  avgRisk,
  collectMitreFromPaths,
  countServices,
  countSoftware,
  ENGINE_VERSION,
} from "@/lib/report-helpers";
import type { RichMetric } from "@/components/ui/RichMetricGrid";
import { formatTimestamp } from "@/lib/format";
import { InvestigationHeader } from "@/components/investigation/InvestigationHeader";
import { DeploymentPathCard } from "@/components/investigation/AttackPathCard";
import { EmptyPathsExperience } from "@/components/investigation/EmptyPathsExperience";
import { RichMetricGrid } from "@/components/ui/RichMetricGrid";
import {
  Panel,
  SidePanel,
  StatRow,
  WorkstationLayout,
} from "@/components/ui/Workstation";

export default async function InvestigationOverviewPage({
  params,
}: {
  params: { id: string };
}) {
  const [detail, report, findings] = await Promise.all([
    getInvestigation(params.id),
    getReport(params.id),
    getFindings(params.id),
  ]);

  const hasPaths = detail.summary.path_count > 0;
  const stats = report.stats;
  const confidence = hasPaths ? avgConfidence(detail) : null;
  const mitre = collectMitreFromPaths(detail);

  const metrics: RichMetric[] = [
    {
      label: "Assets",
      value: report.assets?.length ?? 0,
      subtitle: "discovered hosts",
      meta: [{ k: "confidence", v: confidence != null ? `${confidence}%` : "—" }],
    },
    {
      label: "Services",
      value: countServices(report),
      subtitle: "open services",
      meta: [{ k: "updated", v: `${report.duration_seconds.toFixed(1)}s ago` }],
    },
    {
      label: "Software",
      value: countSoftware(report),
      subtitle: "fingerprints",
    },
    {
      label: "Findings",
      value: stats.findings_retained,
      subtitle: "retained",
      meta: [{ k: "rejected", v: String(findings.rejected.length) }],
    },
    {
      label: "Vulnerabilities",
      value: stats.confirmed + stats.likely_exploitable,
      subtitle: "verified / exploitable",
    },
    {
      label: "Attack Paths",
      value: detail.summary.path_count,
      subtitle: "verified chains",
    },
    {
      label: "Confidence",
      value: confidence ?? "—",
      subtitle: "average path confidence",
      animate: confidence != null,
    },
    {
      label: "Attack Surface",
      value: detail.attack_surface.score,
      subtitle: detail.attack_surface.classification.toLowerCase(),
      meta: [{ k: "score", v: `${detail.attack_surface.score}/100` }],
    },
  ];

  const sidePanel = (
    <>
      <SidePanel title="Investigation metadata">
        <StatRow label="ID" value={detail.summary.id.slice(0, 8)} />
        <StatRow label="Target" value={report.target.split(/[/\\]/).pop() || report.target} />
        <StatRow label="Created" value={formatTimestamp(detail.summary.created_at)} />
        <StatRow label="Duration" value={`${report.duration_seconds.toFixed(2)}s`} />
        <StatRow label="Engine" value={`v${ENGINE_VERSION}`} />
      </SidePanel>

      <SidePanel title="Confidence overview">
        {Object.entries(stats.confidence_distribution || {}).map(([k, v]) => (
          <StatRow key={k} label={k} value={v} />
        ))}
        {hasPaths && (
          <StatRow label="Average" value={`${avgConfidence(detail)}%`} />
        )}
      </SidePanel>

      <SidePanel title="Path validation">
        <StatRow label="Verified" value={stats.attack_paths} />
        <StatRow label="Rejected" value={stats.paths_rejected ?? 0} />
        <StatRow label="Candidate" value={stats.hypothetical_paths ?? 0} />
        <StatRow label="False positives removed" value={stats.false_positives_removed} />
      </SidePanel>

      <SidePanel title="Risk overview">
        {hasPaths ? (
          <>
            <StatRow label="Average risk" value={avgRisk(detail).toFixed(1)} />
            <StatRow label="Critical paths" value={detail.summary.critical_count} />
            <StatRow label="Max blast radius" value={Math.max(...detail.attack_paths.map((p) => p.blast_radius), 0)} />
          </>
        ) : (
          <p className="text-body text-vercel-muted">No verified paths to score.</p>
        )}
      </SidePanel>

      {mitre.length > 0 && (
        <SidePanel title="MITRE coverage">
          <ul className="space-y-1 text-label text-vercel-muted">
            {mitre.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </SidePanel>
      )}

      <SidePanel title="Engine statistics">
        <StatRow label="Findings loaded" value={stats.findings_loaded} />
        <StatRow label="Paths explored" value={stats.paths_explored ?? stats.attack_paths} />
        <StatRow label="Observed vulns" value={stats.observed} />
        <StatRow label="Unknowns" value={stats.unknowns_requiring_investigation ?? 0} />
      </SidePanel>
    </>
  );

  const mainWithPaths = (
    <>
      <Panel title="Investigation summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-body">
          <StatRow label="Status" value={detail.summary.status} />
          <StatRow label="Classification" value={detail.attack_surface.classification} />
          <StatRow label="Paths verified" value={detail.summary.path_count} />
          <StatRow label="Findings validated" value={findings.validated.length} />
        </div>
      </Panel>

      <Panel title="Attack surface analysis">
        <p className="text-section font-bold text-white tabular-nums">
          {detail.attack_surface.score}
          <span className="text-vercel-muted text-body font-semibold"> / 100</span>
        </p>
        <p className="vx-badge-danger inline-flex mt-2">{detail.attack_surface.classification}</p>
        {report.attack_surface_proof?.formula && (
          <p className="text-label font-mono text-vercel-muted mt-3 break-all">
            {report.attack_surface_proof.formula}
          </p>
        )}
      </Panel>

      <Panel title="Verified attack paths">
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
      </Panel>

      <Panel title="Evidence summary">
        <div className="grid grid-cols-2 gap-4 text-body">
          <StatRow label="Validated findings" value={findings.validated.length} />
          <StatRow label="Rejected findings" value={findings.rejected.length} />
          <StatRow label="Observed" value={stats.observed} />
          <StatRow label="Unknowns" value={stats.unknowns_requiring_investigation ?? 0} />
        </div>
      </Panel>

      <Panel title="Discovery statistics">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatRow label="Hosts" value={report.assets?.length ?? 0} />
          <StatRow label="Services" value={countServices(report)} />
          <StatRow label="Software" value={countSoftware(report)} />
          <StatRow label="Paths explored" value={stats.paths_explored ?? 0} />
          <StatRow label="FP removed" value={stats.false_positives_removed} />
        </div>
      </Panel>

      <Panel title="Top findings">
        <div className="space-y-2">
          {findings.validated.slice(0, 6).map((f, i) => (
            <Link key={f.id || i} href={`/investigation/${params.id}/findings`} className="vx-row-item">
              <span className="text-body truncate font-semibold">{f.title || f.id}</span>
              <span className="vx-badge-neutral ml-auto shrink-0">{f.classification}</span>
            </Link>
          ))}
        </div>
      </Panel>
    </>
  );

  const mainNoPaths = (
    <>
      <Panel title="Investigation summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-body">
          <StatRow label="Status" value={detail.summary.status} />
          <StatRow label="Attack surface" value={detail.attack_surface.score} />
          <StatRow label="Findings" value={stats.findings_retained} />
          <StatRow label="Rejected paths" value={stats.paths_rejected ?? 0} />
        </div>
      </Panel>

      <EmptyPathsExperience report={report} />

      <Panel title="Evidence summary">
        <div className="grid grid-cols-2 gap-4 text-body">
          <StatRow label="Validated" value={findings.validated.length} />
          <StatRow label="Rejected" value={findings.rejected.length} />
          <StatRow label="Observed" value={stats.observed} />
        </div>
      </Panel>

      <Panel title="Top findings">
        <div className="space-y-2">
          {findings.validated.slice(0, 5).map((f, i) => (
            <div key={f.id || i} className="vx-row-item">
              <span className="text-body truncate">{f.title || f.id}</span>
              <span className="vx-badge-neutral ml-auto shrink-0">{f.classification}</span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );

  return (
    <div className="space-y-8 max-w-[1400px]">
      <header className="text-center border-b border-vercel-border pb-6">
        <h1 className="vx-section-title">Overview</h1>
        {!hasPaths && (
          <p className="text-body text-vercel-muted mt-2">No verified attack paths.</p>
        )}
      </header>

      {/* HEADER */}
      <InvestigationHeader detail={detail} report={report} />

      {/* PRIMARY METRICS */}
      <section>
        <RichMetricGrid items={metrics} tier="primary" />
      </section>

      {/* MAIN + METADATA */}
      <WorkstationLayout main={hasPaths ? mainWithPaths : mainNoPaths} side={sidePanel} />
    </div>
  );
}
