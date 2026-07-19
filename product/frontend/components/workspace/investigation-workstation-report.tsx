"use client";

import { CombinedEvidenceBanner } from "@/components/workspace/combined-evidence-banner";
import { GraphExplorer } from "@/components/graph/GraphExplorer";
import type { ReasoningCheck } from "@/components/graph/GraphEmptyState";
import {
  buildInvestigationPresentation,
  type FindingCardData,
  type InvestigationPresentation,
  type RejectedChainPresentation,
  type ValidatedChainPresentation,
} from "@/lib/investigation-presentation";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import {
  buildInvestigationRecordMeta,
  formatInvestigationRecordTimestamp,
} from "@/lib/investigation-record";
import { cn } from "@/lib/utils";
import { parseUploadedFilenames } from "@/lib/source-attribution";
import type { InvestigationMode } from "@/lib/investigation-mode";
import {
  createReveal,
  CollapsibleSection,
  HeaderMetric,
  WorkstationSection,
} from "@/components/workspace/workstation-primitives";
import {
  AttackPathsTimeline,
  BusinessImpactSection,
  ConfirmedFindingsSection,
  DeveloperDetailsSection,
  EngineFileDetailsSection,
  EvidenceSection,
  EvidenceTimelineSection,
  ExecutiveSummarySection,
  ExpertModeProvider,
  InvestigationFlowSection,
  InvestigationMetadataSection,
  InvestigationTimelineSection,
  MissingEvidenceSection,
  RecommendationsSection,
  RiskOverviewSection,
} from "@/components/workspace/investigation-workbench-sections";
import { SectionAskAside } from "@/components/workspace/investigation-report-ask";
import { sectionContextAttackGraph } from "@/lib/section-ask-context";

function InvestigationHeader({
  presentation,
  displayId,
  environment,
  createdAt,
  reveal,
}: {
  presentation: InvestigationPresentation;
  displayId: string;
  environment: string;
  createdAt: string;
  reveal: number;
}) {
  const { executive } = presentation;
  const confidence = presentation.graphConfidence ?? "—";

  return (
    <WorkstationSection title="Investigation Header" reveal={reveal}>
      <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <HeaderMetric label="Investigation ID" value={displayId} mono />
        <HeaderMetric label="Environment" value={environment} mono />
        <HeaderMetric label="Risk" value={executive.risk} />
        <HeaderMetric label="Attack Paths" value={executive.attackPaths} />
        <HeaderMetric label="Findings" value={executive.validatedFindings} />
        <HeaderMetric label="Confidence" value={confidence === "—" ? "—" : `${confidence}%`} />
      </div>
      <p className="mt-3 text-[12px] text-vx-muted">Created {createdAt}</p>
    </WorkstationSection>
  );
}

function PrimaryAttackVector({
  topPath,
}: {
  topPath: NonNullable<InvestigationPresentation["topPath"]>;
}) {
  const retentionBullets = [
    "Exposure validated against discovered services",
    "Exploitability confirmed through evidence correlation",
    "Privilege or impact path available",
    "Evidence threshold met for retention",
  ];

  return (
    <article className="border border-vx-border bg-vx-app">
      <div className="border-b border-vx-border bg-vx-section-body px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-vx-secondary">
          Primary Attack Vector
        </p>
      </div>
      <div className="space-y-5 px-5 py-5">
        <p className="text-[15px] font-medium leading-relaxed text-white">{topPath.title}</p>

        <div className="flex flex-wrap gap-2">
          {topPath.steps.map((step, i) => (
            <span
              key={`${step}-${i}`}
              className="rounded border border-vx-border bg-vx-elevated px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-vx-body"
            >
              {step}
            </span>
          ))}
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2 border-t border-vx-border pt-4 sm:grid-cols-4">
          <HeaderMetric label="Confidence" value={`${topPath.confidence}%`} />
          <HeaderMetric label="Risk" value={topPath.riskScore.toFixed(1)} />
          <HeaderMetric label="Blast Radius" value={topPath.blastRadius} />
          <HeaderMetric
            label="Tactics"
            value={topPath.mitreTags.length ? topPath.mitreTags.join(" ") : "—"}
            mono
          />
        </div>

        <div className="border-t border-vx-border pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-vx-muted">
            Why it was retained
          </p>
          <ul className="mt-2 space-y-1.5">
            {retentionBullets.map((item) => (
              <li key={item} className="flex gap-2 text-[13px] text-vx-body">
                <span className="text-vx-muted">—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

function SecondaryPathCard({ chain, index }: { chain: ValidatedChainPresentation; index: number }) {
  return (
    <article className="border border-vx-border bg-vx-app p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-vx-muted">
        Validated Path #{index + 1}
      </p>
      <p className="mt-2 text-[14px] text-white">{chain.steps.join(" → ")}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] text-vx-secondary">
        <span>Conf {chain.confidence}%</span>
        <span>Risk {chain.riskScore.toFixed(1)}</span>
        <span>Blast {chain.blastRadius}</span>
      </div>
    </article>
  );
}

function RejectedPathCard({ chain, index }: { chain: RejectedChainPresentation; index: number }) {
  return (
    <article className="border border-vx-border bg-vx-app/80 p-4 opacity-90">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-vx-muted">
        Rejected Path #{index + 1}
      </p>
      <p className="mt-2 text-[13px] text-vx-body">{chain.steps.join(" → ")}</p>
      <p className="mt-2 text-[12px] text-vx-secondary">{chain.reason}</p>
      <p className="mt-1 text-[12px] text-vx-muted">{chain.missingEvidence}</p>
    </article>
  );
}

function FindingWorkstationCard({ finding }: { finding: FindingCardData }) {
  return (
    <article className="border border-vx-border bg-vx-app">
      <div className="grid gap-px border-b border-vx-border bg-vx-border sm:grid-cols-2">
        <div className="bg-vx-section-body px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.1em] text-vx-muted">Asset</p>
          <p className="mt-1 text-[14px] font-medium text-white">{finding.asset}</p>
        </div>
        <div className="bg-vx-section-body px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.1em] text-vx-muted">Finding</p>
          <p className="mt-1 text-[14px] font-medium text-white">{finding.finding}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-vx-border bg-vx-border sm:grid-cols-3">
        <div className="bg-vx-section-body px-4 py-3">
          <p className="text-[10px] uppercase text-vx-muted">Evidence</p>
          <p className="mt-1 text-[14px] text-white">{finding.confidence}%</p>
        </div>
        <div className="bg-vx-section-body px-4 py-3">
          <p className="text-[10px] uppercase text-vx-muted">Status</p>
          <p className="mt-1 text-[14px] text-white">{finding.exploitability}</p>
        </div>
        <div className="bg-vx-section-body px-4 py-3">
          <p className="text-[10px] uppercase text-vx-muted">Priority</p>
          <p className="mt-1 text-[13px] text-white">
            {finding.remediationPriority.split("—")[0]?.trim() || finding.remediationPriority}
          </p>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-vx-muted">
            Why VANE retained it
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-vx-body">{finding.analystNote}</p>
        </div>
        <div className="border-t border-vx-border pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-vx-muted">
            Recommended action
          </p>
          <p className="mt-2 text-[13px] text-white">{finding.remediationPriority}</p>
        </div>
      </div>
    </article>
  );
}

function EvidenceWorkstationCard({
  index,
  finding,
  reason,
}: {
  index: number;
  finding: FindingCardData;
  reason: string;
}) {
  return (
    <article className="border border-vx-border bg-vx-app p-4">
      <p className="text-[11px] font-semibold text-vx-secondary">Evidence #{index + 1}</p>
      <dl className="mt-3 space-y-2 text-[13px]">
        <div className="grid grid-cols-[100px_1fr] gap-2">
          <dt className="text-vx-muted">Type</dt>
          <dd className="text-white">Fingerprint</dd>
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-2">
          <dt className="text-vx-muted">Source</dt>
          <dd className="text-white">VANE Engine</dd>
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-2">
          <dt className="text-vx-muted">Host</dt>
          <dd className="text-white">{finding.asset}</dd>
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-2">
          <dt className="text-vx-muted">Confidence</dt>
          <dd className="text-white">{finding.confidence}%</dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-vx-border pt-3">
        <p className="text-[10px] uppercase text-vx-muted">Proof</p>
        <ul className="mt-2 space-y-1 font-mono text-[11px] text-vx-body">
          <li>version=True</li>
          <li>fingerprint=True</li>
          <li>port=True</li>
        </ul>
      </div>
      <div className="mt-3">
        <p className="text-[10px] uppercase text-vx-muted">Why this matters</p>
        <p className="mt-1 text-[13px] leading-relaxed text-vx-body">{reason}</p>
      </div>
    </article>
  );
}

const EMPTY_GRAPH_CHECKS: ReasoningCheck[] = [
  { label: "Discovery completed", ok: true, variant: "success" },
  { label: "Fingerprinting completed", ok: true, variant: "success" },
  { label: "Vulnerability mapping completed", ok: true, variant: "success" },
  { label: "Exploit verification failed", ok: false, variant: "failure" },
  { label: "Privilege escalation unavailable", ok: false, variant: "failure" },
  { label: "No downstream target discovered", ok: false, variant: "failure" },
];

export function InvestigationWorkstationReport({
  bundle,
  sourceLabel,
  sourceLabels,
  investigationMode,
  sequenceIndex = 1,
  className,
}: {
  bundle: InvestigationBundle;
  sourceLabel?: string;
  sourceLabels?: string[];
  investigationMode?: InvestigationMode;
  sequenceIndex?: number;
  className?: string;
}) {
  const presentation = buildInvestigationPresentation(bundle, sourceLabel, sourceLabels);
  const record = buildInvestigationRecordMeta(bundle, { sourceLabel, sequenceIndex });
  const {
    executive,
    topPath,
    breakdown,
    findings,
    validatedChains,
    rejectedChains,
  } = presentation;

  const secondaryPaths = validatedChains.slice(topPath ? 1 : 0);
  const mitreTags = [
    ...new Set(validatedChains.flatMap((c) => c.mitreTags)),
  ];
  const assetRows = [...new Set(findings.map((f) => f.asset))];
  const workbench = bundle.workbench;
  const uploadedFilenames = parseUploadedFilenames(
    ...(sourceLabels ?? []),
    sourceLabel,
    bundle.report.target,
    bundle.report.name,
  );
  const showCombinedAttribution =
    (investigationMode === "combined" || uploadedFilenames.length > 1) &&
    uploadedFilenames.length > 1;

  const nextDelay = createReveal();

  return (
    <article className={cn("flex w-full min-w-0 flex-col gap-1", className)}>
      {showCombinedAttribution ? (
        <CombinedEvidenceBanner filenames={uploadedFilenames} />
      ) : null}
      {workbench ? (
        <ExpertModeProvider expert={false}>
          <RiskOverviewSection
            workbench={workbench}
            risk={executive.risk}
            confidence={presentation.graphConfidence}
            reveal={nextDelay()}
          />

          <ExecutiveSummarySection
            workbench={workbench}
            risk={executive.risk}
            confidence={presentation.graphConfidence}
            reveal={nextDelay()}
          />

          <ConfirmedFindingsSection
            workbench={workbench}
            sourceFilenames={uploadedFilenames}
            reveal={nextDelay()}
          />

          <RecommendationsSection workbench={workbench} reveal={nextDelay()} />

          {/* Attack graph — interactive chart + path cards below it */}
          <WorkstationSection
            title="Attack Graph"
            bodyClassName="p-0 min-h-[400px]"
            reveal={nextDelay()}
            large
            aside={
              <SectionAskAside
                sectionTitle="Attack Graph"
                engineContext={sectionContextAttackGraph(workbench)}
              />
            }
          >
            <GraphExplorer
              key={`${bundle.detail.summary.id}-${presentation.graph.nodes.length}-${presentation.graph.edges.length}`}
              embedded
              layout="workstation"
              graph={presentation.graph}
              workbench={workbench}
              context={{
                hasPaths: presentation.hasPaths,
                attackPaths: executive.attackPaths,
                rejectedPaths: presentation.rejectedPathCount,
                confidence: presentation.graphConfidence,
                summary: "",
                emptyChecks: EMPTY_GRAPH_CHECKS.filter((c) => c.ok || !presentation.hasPaths),
              }}
            />
            <AttackPathsTimeline workbench={workbench} />
          </WorkstationSection>

          <CollapsibleSection title="Evidence & reasoning" reveal={nextDelay()} defaultOpen={false}>
            <div className="space-y-1">
              <InvestigationFlowSection workbench={workbench} reveal={0} />
              <EvidenceTimelineSection workbench={workbench} reveal={0} />
              <MissingEvidenceSection workbench={workbench} reveal={0} />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Business & audit context" reveal={nextDelay()} defaultOpen={false}>
            <div className="space-y-1">
              <BusinessImpactSection workbench={workbench} reveal={0} />
              <InvestigationTimelineSection workbench={workbench} reveal={0} />
              <EngineFileDetailsSection
                workbench={workbench}
                bundle={bundle}
                sourceLabel={sourceLabel}
                reveal={0}
              />
              <EvidenceSection workbench={workbench} reveal={0} />
              <InvestigationMetadataSection workbench={workbench} reveal={0} />
              <DeveloperDetailsSection workbench={workbench} reveal={0} />
            </div>
          </CollapsibleSection>
        </ExpertModeProvider>
      ) : (
        <>
          <InvestigationHeader
            presentation={presentation}
            displayId={record.displayId}
            environment={presentation.sourceLabel}
            createdAt={formatInvestigationRecordTimestamp(record.createdAt)}
            reveal={nextDelay()}
          />

          <WorkstationSection title="Attack Graph" bodyClassName="p-0 min-h-[420px]" reveal={nextDelay()}>
            <GraphExplorer
              key={`${bundle.detail.summary.id}-${presentation.graph.nodes.length}-${presentation.graph.edges.length}`}
              embedded
              layout="workstation"
              graph={presentation.graph}
              context={{
                hasPaths: presentation.hasPaths,
                attackPaths: executive.attackPaths,
                rejectedPaths: presentation.rejectedPathCount,
                confidence: presentation.graphConfidence,
                summary: "",
                emptyChecks: EMPTY_GRAPH_CHECKS.filter((c) => c.ok || !presentation.hasPaths),
              }}
            />
          </WorkstationSection>

          <WorkstationSection title="Executive Summary" reveal={nextDelay()}>
            <p className="mb-4 max-w-[90ch] text-[14px] leading-relaxed text-vx-body">
              {executive.validatedFindings > 0
                ? `${executive.validatedFindings} validated finding${executive.validatedFindings === 1 ? "" : "s"} across ${executive.assets} asset${executive.assets === 1 ? "" : "s"}. Risk classified ${executive.risk}.`
                : "Investigation completed. No findings met the retention threshold."}
            </p>
            <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
              <HeaderMetric label="Risk" value={executive.risk} />
              <HeaderMetric label="Assets" value={executive.assets} />
              <HeaderMetric label="Findings" value={executive.validatedFindings} />
              <HeaderMetric label="Paths" value={executive.attackPaths} />
              <HeaderMetric label="Blast Radius" value={executive.blastRadius} />
              <HeaderMetric label="Rejected" value={rejectedChains.length} />
            </div>
          </WorkstationSection>

          <WorkstationSection title="Validated Attack Paths" reveal={nextDelay()}>
            <div className="space-y-4">
              {topPath ? <PrimaryAttackVector topPath={topPath} /> : null}
              {secondaryPaths.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {secondaryPaths.map((chain, i) => (
                    <SecondaryPathCard key={chain.id} chain={chain} index={i} />
                  ))}
                </div>
              ) : null}
              {!topPath && !secondaryPaths.length ? (
                <p className="text-[13px] text-vx-muted">No validated attack paths recorded.</p>
              ) : null}
            </div>
          </WorkstationSection>

          {rejectedChains.length > 0 ? (
            <WorkstationSection title="Rejected Paths" reveal={nextDelay()}>
              <div className="grid gap-3 lg:grid-cols-2">
                {rejectedChains.map((chain, i) => (
                  <RejectedPathCard key={`rej-${i}`} chain={chain} index={i} />
                ))}
              </div>
            </WorkstationSection>
          ) : null}

          {findings.length > 0 ? (
            <WorkstationSection title="Findings" reveal={nextDelay()}>
              <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                <HeaderMetric label="Critical" value={breakdown.critical} />
                <HeaderMetric label="High" value={breakdown.high} />
                <HeaderMetric label="Medium" value={breakdown.medium} />
                <HeaderMetric label="Low" value={breakdown.low} />
              </div>
              <div className="space-y-4">
                {findings.map((f) => (
                  <FindingWorkstationCard key={f.id} finding={f} />
                ))}
              </div>
            </WorkstationSection>
          ) : null}

          {findings.some((f) => f.beliefReasons.length) ? (
            <WorkstationSection title="Evidence" reveal={nextDelay()}>
              <div className="grid gap-4 lg:grid-cols-2">
                {findings.flatMap((f, fi) =>
                  f.beliefReasons.slice(0, 2).map((reason, ri) => (
                    <EvidenceWorkstationCard
                      key={`${f.id}-${ri}`}
                      index={fi * 2 + ri}
                      finding={f}
                      reason={reason}
                    />
                  )),
                )}
              </div>
            </WorkstationSection>
          ) : null}

          <WorkstationSection title="Remediation Priority" reveal={nextDelay()}>
            <div className="space-y-3">
              {findings.slice(0, 5).map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border border-vx-border bg-vx-app px-4 py-3"
                >
                  <span className="text-[14px] text-white">{f.finding}</span>
                  <span className="text-[12px] text-vx-secondary">{f.remediationPriority}</span>
                </div>
              ))}
            </div>
          </WorkstationSection>

          <WorkstationSection title="Validation Logic" reveal={nextDelay()}>
            <ul className="space-y-2">
              {validatedChains.map((chain) => (
                <li
                  key={chain.id}
                  className="border border-vx-border bg-vx-app px-4 py-3 text-[13px] text-vx-body"
                >
                  <span className="font-medium text-white">Path {chain.id}: </span>
                  {chain.analystNote}
                </li>
              ))}
              {rejectedChains.map((chain, i) => (
                <li
                  key={`val-rej-${i}`}
                  className="border border-vx-border bg-vx-app/80 px-4 py-3 text-[13px] text-vx-muted"
                >
                  Rejected: {chain.reason}
                </li>
              ))}
            </ul>
          </WorkstationSection>

          {mitreTags.length > 0 ? (
            <WorkstationSection title="MITRE Mapping" reveal={nextDelay()}>
              <div className="flex flex-wrap gap-2">
                {mitreTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-vx-border bg-vx-elevated px-3 py-1.5 text-[12px] text-vx-body"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </WorkstationSection>
          ) : null}

          <WorkstationSection title="Confidence Breakdown" reveal={nextDelay()}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {findings.map((f) => (
                <div key={f.id} className="border border-vx-border bg-vx-app px-4 py-3">
                  <p className="text-[12px] text-vx-muted">{f.finding}</p>
                  <p className="mt-1 text-[18px] font-semibold text-white">{f.confidence}%</p>
                </div>
              ))}
            </div>
          </WorkstationSection>

          <WorkstationSection title="Asset Exposure Matrix" reveal={nextDelay()}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {assetRows.map((asset) => {
                const assetFindings = findings.filter((f) => f.asset === asset);
                return (
                  <div key={asset} className="border border-vx-border bg-vx-app px-4 py-3">
                    <p className="text-[14px] font-medium text-white">{asset}</p>
                    <p className="mt-1 text-[12px] text-vx-secondary">
                      {assetFindings.length} finding{assetFindings.length === 1 ? "" : "s"} · max
                      risk {Math.max(...assetFindings.map((f) => f.riskScore), 0)}/10
                    </p>
                  </div>
                );
              })}
            </div>
          </WorkstationSection>
        </>
      )}
    </article>
  );
}
