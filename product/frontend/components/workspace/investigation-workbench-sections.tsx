"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { ChevronDown } from "lucide-react";

import { EVIDENCE_LIST_COMPACT_THRESHOLD } from "@/lib/staged-files-summary";

import type {
  WorkbenchCandidatePath,
  WorkbenchConfirmedFinding,
  WorkbenchCorrelation,
  WorkbenchData,
  WorkbenchEvidenceSource,
  WorkbenchEvidenceTrailEvent,
  WorkbenchFileContribution,
  WorkbenchTimelineStep,
} from "@/lib/types";
import {
  BADGE_MEANING,
  buildFindingExplainability,
  buildReadableVerdict,
  type ReadableVerdictTone,
  businessImpactRows,
  coreStatistics,
  evidenceAgainst,
  evidenceChecklist,
  evidenceTimelineSteps,
  exploitVerification,
  findingDisplayStatus,
  investigationStorySteps,
  investigationVerdict,
  missingEvidenceChecklist,
  normalizeFailureReason,
  polishEngineText,
  recommendationTasks,
  riskOverviewMetrics,
  statusMeaning,
  stripLeadingEnumeration,
  summarizePathFailures,
} from "@/lib/workbench-report-helpers";
import {
  sectionContextAtGlance,
  sectionContextAttackGraph,
  sectionContextEvidenceTimeline,
  sectionContextExecutiveSummary,
  sectionContextFindings,
  sectionContextInvestigationStory,
  sectionContextMissingEvidence,
  sectionContextRecommendations,
} from "@/lib/section-ask-context";
import { SectionAskAside } from "@/components/workspace/investigation-report-ask";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MetricTile, SectionLabel, WorkspaceCard } from "@/components/shared/workspace-card";
import { AnalystEngineFileBoxes } from "@/components/workspace/analyst/analyst-engine-file-boxes";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { findingSourceFile } from "@/lib/source-attribution";
import { buildEngineFileInsights } from "@/lib/engine-file-insights";
import {
  CollapsibleSection,
  ExpandToggle,
  shortStep,
  WorkstationSection,
} from "@/components/workspace/workstation-primitives";

function severityVariant(severity: string): "critical" | "high" | "medium" | "default" {
  const s = severity.toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  return "default";
}

// Analyst (default) vs Expert (researcher) audience mode — P11. Same page,
// two depths: expert reveals raw evidence, CVE/CPE, and scanner metadata.
const ExpertModeContext = createContext(false);
export function ExpertModeProvider({
  expert,
  children,
}: {
  expert: boolean;
  children: React.ReactNode;
}) {
  return <ExpertModeContext.Provider value={expert}>{children}</ExpertModeContext.Provider>;
}
function useExpertMode() {
  return useContext(ExpertModeContext);
}

function StatePill({
  active,
  label,
  title,
}: {
  active: boolean;
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? BADGE_MEANING[label]}
      className={cn(
        "border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        BADGE_MEANING[label] || title ? "cursor-help" : "",
        active ? "border-vx-border-strong bg-vx-text text-vx-app" : "border-vx-border text-vx-muted",
      )}
    >
      {label}
    </span>
  );
}

/** Visual ✓ / ✗ evidence readout (P7). */
function EvidenceChecklist({ items }: { items: { label: string; ok: boolean }[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.map((row) => (
        <li key={row.label} className="flex items-center gap-2 text-[11px] leading-snug">
          <span className={cn("font-mono", row.ok ? "text-white" : "text-white/30")}>
            {row.ok ? "✓" : "✗"}
          </span>
          <span className={cn(row.ok ? "text-white/75" : "text-white/40")}>{row.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Verified-vs-inferred exploitability, stated honestly (P4, P12). */
function ExploitBadge({
  verification,
}: {
  verification: ReturnType<typeof exploitVerification>;
}) {
  if (!verification) return null;
  return (
    <div className="border border-vx-border bg-vx-inset px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            verification.confirmed
              ? "border-white/50 bg-white text-black"
              : "border-white/25 text-white/60",
          )}
        >
          {verification.confirmed ? "Confirmed" : "Inferred"}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-white/70">
          {verification.label}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-white/55">{verification.detail}</p>
    </div>
  );
}

function ExplainabilityBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function BulletList({ items, prefix }: { items: string[]; prefix?: string }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-white">
          <span className="shrink-0 text-white">{prefix ?? "•"}</span>
          <span>{polishEngineText(item)}</span>
        </li>
      ))}
    </ul>
  );
}

function VerdictStatusPill({ label, tone }: { label: string; tone: ReadableVerdictTone }) {
  return (
    <span
      className={cn(
        "inline-block border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
        tone === "confirmed" && "border-white bg-white text-black",
        tone === "action" && "border-amber-500/50 text-amber-200",
        tone === "clear" && "border-white/30 text-white/50",
        tone === "neutral" && "border-white/40 text-white/70",
      )}
    >
      {label}
    </span>
  );
}

export function ExecutiveSummarySection({
  workbench,
  risk,
  confidence,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  risk: string;
  confidence: number | null;
  reveal: number;
  embedded?: boolean;
}) {
  const verdict = buildReadableVerdict(workbench, risk, confidence);

  return (
    <WorkstationSection
      title="Impact Brief"
      reveal={reveal}
      large
      embedded={embedded}
      aside={
        <SectionAskAside
          sectionTitle="Impact Brief"
          engineContext={sectionContextExecutiveSummary(workbench, risk, confidence)}
        />
      }
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <VerdictStatusPill label={verdict.statusLabel} tone={verdict.tone} />
          <h3 className="max-w-[48ch] text-[20px] font-bold leading-snug text-white">{verdict.headline}</h3>
          <p className="max-w-[72ch] text-[15px] leading-relaxed text-white">{verdict.summary}</p>
        </div>

        <div className="grid gap-4 border-t border-vx-border pt-5 md:grid-cols-3">
          <div>
            <SectionLabel>What VAYNE knows</SectionLabel>
            <p className="mt-2 text-[13px] leading-relaxed text-white">{verdict.whatWeKnow}</p>
          </div>
          <div>
            <SectionLabel>{verdict.stillOpen ? "What remains open" : "Status"}</SectionLabel>
            <p className="mt-2 text-[13px] leading-relaxed text-white">
              {verdict.stillOpen ?? "No outstanding validation gaps were flagged for the priority finding."}
            </p>
          </div>
          <div>
            <SectionLabel>Why this warrants attention</SectionLabel>
            <p className="mt-2 text-[13px] leading-relaxed text-white">{verdict.whyRespond}</p>
          </div>
        </div>
      </div>
    </WorkstationSection>
  );
}

export function InvestigationVerdictSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const verdict = investigationVerdict(workbench);

  return (
    <WorkstationSection title="Investigation Verdict" reveal={reveal} large>
      <WorkspaceCard className="p-6">
        <SectionLabel>What VAYNE discovered</SectionLabel>
        <p className="mt-3 max-w-[80ch] text-[16px] font-medium leading-[1.7] text-vx-text">
          {verdict.headline}
        </p>
        {verdict.topFinding ? (
          <p className="mt-3 text-[12px] text-vx-secondary">
            Highest-priority finding:{" "}
            <span className="font-bold uppercase tracking-wide text-vx-text">
              {verdict.topFinding}
            </span>
            {verdict.topHost ? <span className="font-mono text-vx-muted"> · {verdict.topHost}</span> : null}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-vx-border pt-5 sm:grid-cols-4">
          {verdict.counts.map((c) => (
            <div key={c.label} className="border border-vx-border bg-vx-inset px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-vx-muted">
                {c.label}
              </p>
              <p className="mt-1 font-mono text-[22px] font-black leading-none text-vx-text">
                {c.value}
              </p>
            </div>
          ))}
        </div>
      </WorkspaceCard>
    </WorkstationSection>
  );
}

export function InvestigationFlowSection({
  workbench,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  reveal: number;
  embedded?: boolean;
}) {
  const steps = investigationStorySteps(workbench);

  return (
    <WorkstationSection
      title="Investigation Story"
      reveal={reveal}
      large
      embedded={embedded}
      aside={
        <SectionAskAside
          sectionTitle="Investigation Story"
          engineContext={sectionContextInvestigationStory(workbench)}
        />
      }
    >
      <p className="mb-4 max-w-[72ch] text-[13px] leading-relaxed text-white">
        How VAYNE reached its conclusions — from raw scanner output through correlation, validation,
        and final retention.
      </p>
      <ol className="list-none divide-y divide-vx-border border-y border-vx-border pl-0">
          {steps.map((step, i) => (
            <li key={`${step.label}-${i}`} className="flex gap-4 px-5 py-4">
              <div className="flex w-6 shrink-0 flex-col items-center pt-1">
                <span className={cn("size-2 rounded-full", step.done ? "bg-white" : "bg-white/40")} />
                {i < steps.length - 1 ? (
                  <span className="mt-2 text-[12px] text-white">↓</span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold uppercase tracking-wide text-white">{step.label}</p>
                {step.detail ? (
                  <p className="mt-1 text-[13px] leading-relaxed text-white">
                    {polishEngineText(step.detail)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
      </ol>
    </WorkstationSection>
  );
}

export function EngineFileDetailsSection({
  workbench,
  bundle,
  sourceLabel,
  sourceLabels,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  bundle?: InvestigationBundle;
  sourceLabel?: string;
  sourceLabels?: string[];
  reveal: number;
  embedded?: boolean;
}) {
  const insights = useMemo(
    () => buildEngineFileInsights(workbench, { bundle, sourceLabel, sourceLabels }),
    [workbench, bundle, sourceLabel, sourceLabels],
  );

  if (!insights.length) return null;

  return (
    <WorkstationSection title="Evidence Files" reveal={reveal} large embedded={embedded}>
      <p className="mb-4 max-w-[72ch] text-[13px] leading-relaxed text-vx-secondary">
        Per-file engine output — what VAYNE extracted, retained, and rejected from each evidence
        source.
      </p>
      <AnalystEngineFileBoxes
        workbench={workbench}
        bundle={bundle}
        sourceLabel={sourceLabel}
        sourceLabels={sourceLabels}
      />
    </WorkstationSection>
  );
}

const RISK_TILE_MEANING: Record<string, string> = {
  "Attack surface": "How exposed the environment is if attack paths hold",
  "Retained findings": "Findings that passed evidence review",
  Assets: "Distinct hosts in scope",
  Files: "Scan files parsed",
  Paths: "Validated vs rejected attack paths",
  Correlations: "Findings confirmed by multiple scanners",
};

export function RiskOverviewSection({
  workbench,
  risk,
  confidence,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  risk: string;
  confidence: number | null;
  reveal: number;
  embedded?: boolean;
}) {
  const metrics = riskOverviewMetrics(workbench, risk, confidence);
  return (
    <WorkstationSection
      title="At a Glance"
      reveal={reveal}
      large
      embedded={embedded}
      aside={
        <SectionAskAside
          sectionTitle="At a Glance"
          engineContext={sectionContextAtGlance(workbench, risk, confidence)}
        />
      }
    >
      <p className="mb-5 max-w-[72ch] text-[13px] leading-relaxed text-white/70">
        Snapshot of retained findings, assets, and path outcomes for this investigation.
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <MetricTile
            key={m.label}
            label={m.label}
            value={m.value}
            large={Boolean(m.highlight)}
            flat
            sub={m.sub ?? RISK_TILE_MEANING[m.label]}
          />
        ))}
      </div>
    </WorkstationSection>
  );
}

export function InvestigationMetadataSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const stats = coreStatistics(workbench.statistics);
  if (!stats.length) return null;
  return (
    <CollapsibleSection
      title="Investigation Metadata"
      reveal={reveal}
      forceOpen
      aside={
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          scan counts
        </span>
      }
    >
      <p className="mb-5 max-w-[72ch] text-[13px] leading-relaxed text-white/55">
        Scope and scan statistics. Useful context, but not decision drivers — which is why they live
        here rather than at the top.
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <MetricTile key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function AnalystFindingCard({
  finding,
  allScanners,
  sourceFilenames,
  contributions,
  priorityIndex,
  priorityTotal,
}: {
  finding: WorkbenchConfirmedFinding;
  allScanners: string[];
  sourceFilenames?: string[];
  contributions?: WorkbenchFileContribution[];
  priorityIndex?: number;
  priorityTotal?: number;
}) {
  const expert = useExpertMode();
  const explain = buildFindingExplainability(finding);
  const state = findingDisplayStatus(finding);
  const against = evidenceAgainst(finding);
  const exploit = exploitVerification(finding);
  const evidenceMeta = finding.evidence_summary;

  const agreed = new Set(
    finding.scanner_agreement?.agreed || finding.sources,
  );
  const capable =
    finding.scanner_agreement?.capable ||
    (allScanners.length > 0 ? allScanners : finding.sources);
  const agreementRatio =
    finding.scanner_agreement?.ratio ||
    `${agreed.size} / ${Math.max(capable.length, 1)}`;
  const showCapableAgreement = capable.length > 1;
  const sourceFile =
    sourceFilenames?.length
      ? findingSourceFile(finding, sourceFilenames, contributions)
      : undefined;

  const sourcesLine = [
    ...finding.sources,
    sourceFile,
  ]
    .filter((v): v is string => Boolean(v))
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const showConclusion =
    explain.finalConclusion &&
    explain.finalConclusion.toLowerCase() !== state.meaning.toLowerCase();

  const nextProbe = explain.confidenceWouldIncrease[0];

  return (
    <WorkspaceCard className="flex w-full flex-col overflow-hidden p-0">
      <div className="min-h-0 flex-1">
        <div className="border-b border-vx-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {priorityIndex && priorityTotal ? (
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                  Finding {priorityIndex} of {priorityTotal}
                </p>
              ) : null}
              <h4 className="text-[13px] font-black uppercase leading-snug tracking-wide text-white">
                {stripLeadingEnumeration(finding.title)}
              </h4>
              <p className="mt-1 font-mono text-[11px] text-white/70">
                {finding.host || "—"}
                {sourcesLine.length ? (
                  <span className="text-white/40"> · {sourcesLine.join(" · ")}</span>
                ) : null}
              </p>
            </div>
            <Badge variant={severityVariant(finding.severity)} title="Scanner severity">
              {finding.severity}
            </Badge>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatePill active label={state.label} />
            <p className="text-[11px] leading-snug text-white/70">{state.meaning}</p>
          </div>

          {showConclusion ? (
            <p className="mt-3 border-t border-vx-border pt-3 text-[13px] leading-relaxed text-white">
              {explain.finalConclusion}
            </p>
          ) : null}
        </div>

        <div className="space-y-5 p-4">
          {explain.whyBelieve.length ? (
            <ExplainabilityBlock title="Why retained">
              <BulletList items={explain.whyBelieve} />
            </ExplainabilityBlock>
          ) : null}

          {exploit ? <ExploitBadge verification={exploit} /> : null}

          {against.length ? (
            <div>
              <SectionLabel>Conflicts</SectionLabel>
              <ul className="mt-2 space-y-1">
                {against.map((a) => (
                  <li key={a} className="text-[12px] leading-snug text-white/70">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showCapableAgreement ? (
            <div>
              <SectionLabel>Scanner agreement · {agreementRatio}</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {capable.map((s) => (
                  <span
                    key={s}
                    className={cn(
                      "border px-2 py-1 font-mono text-[11px]",
                      agreed.has(s)
                        ? "border-white/25 text-white"
                        : "border-white/10 text-white/35",
                    )}
                  >
                    {agreed.has(s) ? "✓" : "✗"} {s}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {nextProbe ? (
            <div>
              <SectionLabel>Next validation</SectionLabel>
              <p className="mt-2 text-[13px] leading-relaxed text-white">
                {nextProbe.item}
                {nextProbe.explanation ? (
                  <span className="text-white/55"> — {nextProbe.explanation}</span>
                ) : null}
              </p>
            </div>
          ) : null}

          {expert ? (
            <div className="border-t border-vx-border pt-4">
              <SectionLabel>Technical details</SectionLabel>
              <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { label: "CVE", value: finding.cve || "—" },
                  { label: "CPE", value: evidenceMeta?.cpe || "—" },
                  { label: "Version", value: evidenceMeta?.version || "—" },
                  { label: "Category", value: evidenceMeta?.category || "—" },
                ].map((row) => (
                  <div key={row.label} className="border border-vx-border bg-vx-inset px-3 py-2">
                    <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
                      {row.label}
                    </dt>
                    <dd className="mt-0.5 truncate font-mono text-[12px] text-white/75" title={row.value}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {finding.evidence.length ? (
                <ul className="mt-3 space-y-1">
                  {finding.evidence.slice(0, 4).map((e, i) => (
                    <li
                      key={`${e}-${i}`}
                      className="border border-white/10 bg-vx-app px-3 py-1.5 font-mono text-[11px] leading-snug text-white/60"
                    >
                      {e}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </WorkspaceCard>
  );
}

export function ConfirmedFindingsSection({
  workbench,
  sourceFilenames,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  sourceFilenames?: string[];
  reveal: number;
  embedded?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const findings = workbench.confirmed_findings;
  const visible = showAll ? findings : findings.slice(0, 6);
  const allScanners = workbench.evidence_sources.map((s) => s.label);

  if (!findings.length) return null;

  return (
    <WorkstationSection
      title="Confirmed Findings"
      reveal={reveal}
      large
      embedded={embedded}
      aside={
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white">
            {findings.length} retained
          </span>
          <SectionAskAside
            sectionTitle="Confirmed Findings"
            engineContext={sectionContextFindings(workbench)}
          />
        </div>
      }
    >
      <p className="mb-5 max-w-[72ch] text-[13px] leading-relaxed text-white">
        Full reasoning for each retained finding — evidence, proof, and scanner agreement.
      </p>
      <div className="space-y-4">
        {visible.map((finding) => (
          <AnalystFindingCard
            key={finding.id}
            finding={finding}
            allScanners={allScanners}
            sourceFilenames={sourceFilenames}
            contributions={workbench.file_contributions}
            priorityIndex={findings.indexOf(finding) + 1}
            priorityTotal={findings.length}
          />
        ))}
      </div>
      {findings.length > 6 ? (
        <ExpandToggle
          open={showAll}
          onClick={() => setShowAll((v) => !v)}
          label={showAll ? "Show fewer" : "Show all findings"}
          count={findings.length}
        />
      ) : null}
    </WorkstationSection>
  );
}

/** An attack path rendered as a simulation: the chain, its status, and — if
 *  blocked — why, and what would unlock it (P9). */
function PathSimulationCard({ path }: { path: WorkbenchCandidatePath }) {
  const steps = path.steps.map(shortStep);
  const blocked = path.status === "REJECTED";
  const missing = (path.missing || []).map(normalizeFailureReason);
  const unlock = path.tools_that_help || [];
  return (
    <WorkspaceCard className="p-5">
      <ol className="space-y-0.5">
        {steps.map((step, i) => (
          <li key={`${step}-${i}`}>
            <div className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 bg-white/60" />
              <span className="text-[12px] font-bold uppercase tracking-wide text-white/85">
                {step}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <span className="ml-[2px] block text-[12px] leading-tight text-white/25">↓</span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-vx-border pt-3">
        <span
          title={
            blocked
              ? "This chain cannot be completed with the current evidence."
              : "The evidence supports this chain end to end."
          }
          className={cn(
            "cursor-help border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            blocked ? "border-white/25 text-white/60" : "border-white/50 bg-white text-black",
          )}
        >
          {blocked ? "Blocked" : "Reachable"}
        </span>
      </div>

      {blocked ? (
        <div className="mt-4 space-y-3 border-t border-vx-border pt-3">
          <div>
            <SectionLabel>Why blocked</SectionLabel>
            <ul className="mt-1.5 space-y-1">
              {[normalizeFailureReason(path.reason), ...missing]
                .filter((v, idx, arr) => v && arr.indexOf(v) === idx)
                .slice(0, 3)
                .map((r) => (
                  <li key={r} className="flex items-center gap-2 text-[12px] text-white/55">
                    <span className="font-mono text-white/40">✗</span>
                    <span>{r}</span>
                  </li>
                ))}
            </ul>
          </div>
          {unlock.length ? (
            <div>
              <SectionLabel>What would unlock it</SectionLabel>
              <ul className="mt-1.5 space-y-1">
                {unlock.slice(0, 3).map((u) => (
                  <li key={u} className="flex items-center gap-2 text-[12px] text-white/70">
                    <span className="font-mono text-white/50">→</span>
                    <span>{u}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[12px] leading-relaxed text-white/55">
          Validated — the evidence supports this chain from entry point to impact.
        </p>
      )}
    </WorkspaceCard>
  );
}

export function AttackPathsTimeline({ workbench }: { workbench: WorkbenchData }) {
  const [showRejected, setShowRejected] = useState(false);
  const paths = workbench.candidate_paths;
  const validated = paths.filter((p) => p.status === "VALIDATED");
  const rejected = paths.filter((p) => p.status === "REJECTED");
  const reasons = summarizePathFailures(paths);
  if (!paths.length) return null;

  return (
    <div className="border-t border-vx-border bg-vx-app px-6 py-6">
      <div className="mb-4 border-b border-white pb-3">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.15em] text-white">
          Candidate Attack Paths
        </h3>
        <p className="mt-1 text-[12px] uppercase tracking-wider text-white/50">
          {validated.length} validated · {rejected.length} rejected
        </p>
        <p className="mt-2 max-w-[72ch] text-[12px] normal-case leading-relaxed tracking-normal text-white/50">
          Could an attacker actually chain these findings into real impact? Paths that survived
          validation are shown first; the rest were ruled out for the reasons listed.
        </p>
      </div>

      {validated.length ? (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {validated.map((path, i) => (
            <PathSimulationCard key={`v-${i}`} path={path} />
          ))}
        </div>
      ) : null}

      {rejected.length ? (
        <WorkspaceCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SectionLabel>Rejected Paths</SectionLabel>
              <p className="mt-2 text-[32px] font-black leading-none text-white">
                {rejected.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRejected((v) => !v)}
              className="text-[11px] font-bold uppercase tracking-wider text-white/50 hover:text-white"
            >
              {showRejected ? "Hide details" : "Expand"}
            </button>
          </div>
          <div className="mt-5 space-y-2 border-t border-vx-border pt-4">
            <SectionLabel>Reasons</SectionLabel>
            {reasons.map((row) => (
              <div
                key={row.reason}
                className="flex items-center justify-between gap-3 text-[13px]"
              >
                <span className="text-white/75">
                  {row.count} {row.reason}
                </span>
              </div>
            ))}
          </div>
          {showRejected ? (
            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-vx-border pt-4 lg:grid-cols-2">
              {rejected.map((path, i) => (
                <PathSimulationCard key={`r-${i}`} path={path} />
              ))}
            </div>
          ) : null}
        </WorkspaceCard>
      ) : null}
    </div>
  );
}

export function EvidenceTimelineSection({
  workbench,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  reveal: number;
  embedded?: boolean;
}) {
  const top = workbench.confirmed_findings[0];
  const steps = useMemo(
    () => (top ? evidenceTimelineSteps(workbench, top) : evidenceTimelineSteps(workbench)),
    [workbench, top],
  );
  if (!steps.length) return null;

  return (
    <WorkstationSection
      title="Evidence Timeline"
      reveal={reveal}
      large
      embedded={embedded}
      aside={
        <SectionAskAside
          sectionTitle="Evidence Timeline"
          engineContext={sectionContextEvidenceTimeline(workbench)}
        />
      }
    >
      <p className="mb-4 max-w-[72ch] text-[13px] leading-relaxed text-white">
        How evidence accumulated for the highest-priority finding — from initial scanner signal
        through to retention.
        {top ? <span> ({top.title})</span> : null}
      </p>
      <ol className="list-none divide-y divide-vx-border border-y border-vx-border pl-0">
        {steps.map((step, i) => (
          <li key={`${step.label}-${i}`} className="flex gap-4 py-4">
              <div className="flex w-6 shrink-0 flex-col items-center pt-1">
                <span className="size-2 rounded-full bg-white" />
                {i < steps.length - 1 ? (
                  <span className="mt-2 text-[12px] text-white">↓</span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold uppercase tracking-wide text-white">
                  {step.label}
                </p>
                {step.detail ? (
                  <p className="mt-1 text-[12px] leading-relaxed text-white">
                    {polishEngineText(step.detail)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
      </ol>
    </WorkstationSection>
  );
}

export function MissingEvidenceSection({
  workbench,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  reveal: number;
  embedded?: boolean;
}) {
  const items = useMemo(() => missingEvidenceChecklist(workbench), [workbench]);
  if (!items.length) return null;

  return (
    <WorkstationSection
      title="Missing Evidence"
      reveal={reveal}
      large
      embedded={embedded}
      aside={
        <SectionAskAside
          sectionTitle="Missing Evidence"
          engineContext={sectionContextMissingEvidence(workbench)}
        />
      }
    >
      <div className="divide-y divide-vx-border border-y border-vx-border">
        {items.map((item, i) => (
          <div key={`${item.topic}-${i}`} className="flex gap-4 py-4">
            <span className="mt-0.5 shrink-0 font-mono text-[16px] text-white" aria-hidden>
              ☐
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="text-[14px] font-bold text-white">{item.topic}</h4>
              <p className="mt-2 text-[13px] leading-relaxed text-white">
                <span className="font-medium">Why it matters: </span>
                {item.whyItMatters}
              </p>
            </div>
          </div>
        ))}
      </div>
    </WorkstationSection>
  );
}

/** @deprecated Use MissingEvidenceSection */
export function UnknownsSection(props: { workbench: WorkbenchData; reveal: number }) {
  return <MissingEvidenceSection {...props} />;
}

export function BusinessImpactSection({
  workbench,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  reveal: number;
  embedded?: boolean;
}) {
  const rows = useMemo(() => businessImpactRows(workbench), [workbench]);
  if (!rows.length) return null;

  return (
    <WorkstationSection title="Impact" reveal={reveal} large embedded={embedded}>
      <p className="mb-5 max-w-[72ch] text-[13px] leading-relaxed text-white/55">
        What could actually happen to your organization if these issues are exploited — not the technical steps, but the real-world damage.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <WorkspaceCard key={row.id} className="p-5">
            <h4 className="text-[14px] font-black uppercase tracking-wide text-white">
              {row.title}
            </h4>
            <p className="mt-1 font-mono text-[11px] text-white/50">{row.host}</p>
            <p className="mt-3 text-[14px] font-medium leading-relaxed text-white/90">{row.summary}</p>
            {row.whatCouldHappen || row.whoIsAtRisk || row.businessAreas ? (
              <dl className="mt-4 space-y-3 border-t border-vx-border pt-4">
                {[
                  { label: "What could go wrong", value: row.whatCouldHappen },
                  { label: "Who's at risk", value: row.whoIsAtRisk },
                  { label: "Areas affected", value: row.businessAreas },
                ]
                  .filter((r) => r.value)
                  .map((r) => (
                    <div key={r.label}>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
                        {r.label}
                      </dt>
                      <dd className="mt-1 text-[13px] leading-relaxed text-white/75">{r.value}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}
          </WorkspaceCard>
        ))}
      </div>
    </WorkstationSection>
  );
}

export function RecommendationsSection({
  workbench,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  reveal: number;
  embedded?: boolean;
}) {
  const tasks = recommendationTasks(workbench);
  if (!tasks.length) return null;
  return (
    <WorkstationSection
      title="Recommendations"
      reveal={reveal}
      large
      embedded={embedded}
      aside={
        <SectionAskAside
          sectionTitle="Recommendations"
          engineContext={sectionContextRecommendations(workbench)}
        />
      }
    >
      <div className="divide-y divide-vx-border border-y border-vx-border">
        {tasks.map((task, i) => (
          <div key={`${task.action}-${i}`} className="flex items-start gap-4 py-5">
            <span className="shrink-0 border border-white/40 px-2 py-1 text-[10px] font-bold uppercase text-white">
              P{i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium leading-relaxed text-white">{task.action}</p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 pt-1">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white">
                    Expected result
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-white">{task.expectedResult}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </WorkstationSection>
  );
}

export function InvestigationTimelineSection({
  workbench,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  reveal: number;
  embedded?: boolean;
}) {
  const steps: WorkbenchTimelineStep[] = workbench.investigation_timeline?.length
    ? workbench.investigation_timeline
    : (workbench.evidence_trail || []).map((e) => ({
        event: e.event,
        detail: e.detail,
        kind: e.kind,
      }));
  if (!steps.length) return null;

  return (
    <WorkstationSection title="Investigation Timeline" reveal={reveal} large embedded={embedded}>
      <WorkspaceCard className="p-0">
        <ol className="divide-y divide-white/15">
          {steps.map((step, i) => (
            <li key={`${step.event}-${i}`} className="flex gap-4 px-5 py-4">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span className="mt-1 size-2 rounded-full bg-white" />
                {i < steps.length - 1 ? (
                  <span className="mt-2 text-[12px] text-white/30">↓</span>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold uppercase tracking-wide text-white/85">
                  {step.event}
                </p>
                {step.detail ? (
                  <p className="mt-1 text-[13px] leading-relaxed text-white/55">{step.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </WorkspaceCard>
    </WorkstationSection>
  );
}

function ScannerAgreementCard({
  corr,
  allScanners,
}: {
  corr: WorkbenchCorrelation;
  allScanners: string[];
}) {
  const agreed = new Set(corr.sources);
  return (
    <WorkspaceCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h4 className="text-[14px] font-black uppercase tracking-wide text-white">
          {corr.subject}
        </h4>
      </div>
      <div className="mt-4 space-y-3 border-t border-vx-border pt-4">
        <SectionLabel>Scanner agreement</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-3">
          {allScanners.map((s) => (
            <span
              key={s}
              className={cn(
                "text-[12px] font-bold uppercase tracking-wide",
                agreed.has(s) ? "text-white" : "text-white/35",
              )}
            >
              {s} {agreed.has(s) ? "✓" : "✖"}
            </span>
          ))}
        </div>
        {corr.consensus ? (
          <p className="text-[13px] leading-relaxed text-white/60">Consensus: {corr.consensus}</p>
        ) : null}
      </div>
    </WorkspaceCard>
  );
}

function EvidenceSourceCard({
  source,
  hosts,
}: {
  source: WorkbenchEvidenceSource;
  hosts: number;
}) {
  return (
    <WorkspaceCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-[14px] font-black uppercase tracking-wide text-white">
          {source.label}
        </h4>
        <Badge variant="default">{source.status}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-vx-border pt-4 sm:grid-cols-4">
        {[
          { label: "Hosts", value: hosts },
          { label: "Findings", value: source.findings },
          { label: "Critical", value: source.critical },
          { label: "Warnings", value: source.high },
        ].map((stat) => (
          <div key={stat.label} className="border border-vx-border bg-vx-inset p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-black leading-none text-white">{stat.value}</p>
          </div>
        ))}
      </div>
    </WorkspaceCard>
  );
}

function buildFallbackTrail(workbench: WorkbenchData): WorkbenchEvidenceTrailEvent[] {
  return workbench.pipeline.slice(0, 12).map((s) => ({
    time: s.timestamp,
    event: s.label,
    detail: s.detail,
    kind: s.id.split(":")[0],
  }));
}

export function EvidenceSection({
  workbench,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  reveal: number;
  embedded?: boolean;
}) {
  const hostByTool = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of workbench.file_contributions) {
      map.set(row.tool, (map.get(row.tool) ?? 0) + row.hosts);
    }
    return map;
  }, [workbench.file_contributions]);

  const scanners = workbench.evidence_sources.map((s) => s.label);
  const provenance = workbench.provenance || [];
  const findingProof = workbench.confirmed_findings
    .flatMap((f) => {
      const rows =
        f.proof?.length
          ? f.proof.map((p) => ({
              finding: f.title,
              host: f.host,
              source: p.source,
              detail: p.detail,
            }))
          : (f.evidence || []).map((e) => ({
              finding: f.title,
              host: f.host,
              source: f.sources[0] || "Evidence",
              detail: e,
            }));
      return rows;
    })
    .slice(0, 24);

  const hasContent =
    provenance.length > 0 ||
    workbench.evidence_sources.length > 0 ||
    workbench.correlations.length > 0 ||
    findingProof.length > 0;

  const body = (
    <div className={cn("space-y-6", embedded && "px-6 py-6")}>
      {!hasContent ? (
        <p className="text-[13px] leading-relaxed text-white/55">
          No retained evidence rows for this investigation yet.
        </p>
      ) : null}

      {provenance.length ? (
        <div className="space-y-3">
          <SectionLabel>Why VAYNE believes this</SectionLabel>
          {provenance.map((row, i) => (
            <WorkspaceCard key={`${row.claim}-${i}`} className="p-4">
              <p className="text-[13px] font-medium leading-snug text-white">{row.claim}</p>
              {row.supports?.length ? (
                <ul className="mt-3 space-y-2">
                  {row.supports.map((s, j) => (
                    <li
                      key={`${s.source}-${j}`}
                      className="grid grid-cols-[6.5rem_1fr] gap-3 border border-vx-border bg-vx-inset px-3 py-2"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wide text-white/55">
                        {s.source}
                      </span>
                      <span className="font-mono text-[12px] leading-snug text-white/80">
                        {s.evidence}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </WorkspaceCard>
          ))}
        </div>
      ) : null}

      {workbench.evidence_sources.length ? (
        <div className="space-y-3">
          <SectionLabel>Sources</SectionLabel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {workbench.evidence_sources.map((s) => (
              <EvidenceSourceCard
                key={s.tool}
                source={s}
                hosts={hostByTool.get(s.label) ?? hostByTool.get(s.tool) ?? 0}
              />
            ))}
          </div>
        </div>
      ) : null}

      {!provenance.length && findingProof.length ? (
        <div className="space-y-3">
          <SectionLabel>Proof</SectionLabel>
          <ul className="space-y-2">
            {findingProof.map((row, i) => (
              <li
                key={`${row.finding}-${row.source}-${i}`}
                className="border border-vx-border bg-vx-inset px-3 py-2"
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">
                  {row.finding}
                  {row.host ? ` · ${row.host}` : ""}
                </p>
                <div className="mt-1.5 grid grid-cols-[6.5rem_1fr] gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-white/55">
                    {row.source}
                  </span>
                  <span className="font-mono text-[12px] leading-snug text-white/80">
                    {row.detail}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {workbench.correlations.length ? (
        <div>
          <div className="mb-4 border-b border-white/15 pb-3">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.15em]">Correlation</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {workbench.correlations.map((corr, i) => (
              <ScannerAgreementCard
                key={`${corr.subject}-${i}`}
                corr={corr}
                allScanners={scanners}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (embedded) return body;

  return (
    <CollapsibleSection
      title="Evidence Sources"
      reveal={reveal}
      forceOpen
      aside={
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          {workbench.evidence_sources.length} sources
        </span>
      }
    >
      {body}
    </CollapsibleSection>
  );
}

export function DeveloperDetailsSection({
  workbench,
  reveal,
  embedded,
}: {
  workbench: WorkbenchData;
  reveal: number;
  embedded?: boolean;
}) {
  const trail = workbench.pipeline.length ? buildFallbackTrail(workbench) : [];
  const body = (
    <div className={cn("space-y-4", embedded && "px-6 py-6")}>
        {workbench.hypotheses.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {workbench.hypotheses.map((h, i) => (
              <WorkspaceCard key={i} className="p-5">
                <h4 className="text-[13px] font-black uppercase text-white">{h.title}</h4>
                <p className="mt-3 text-[13px] leading-relaxed text-white/65">{h.reason}</p>
              </WorkspaceCard>
            ))}
          </div>
        ) : null}

        {workbench.file_contributions.length ? (
          <CollapsibleSection title="File Contribution" defaultOpen={false}>
            {workbench.file_contributions.length > EVIDENCE_LIST_COMPACT_THRESHOLD ? (
              <div className="space-y-3">
                <p className="text-[13px] text-white/70">
                  {workbench.file_contributions.length.toLocaleString()} source files contributed
                  evidence. Top contributors by signal volume:
                </p>
                <div className="grid grid-cols-1 gap-4">
                  {workbench.file_contributions.slice(0, 8).map((f, i) => (
                    <FileContributionCard key={i} file={f} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {workbench.file_contributions.map((f, i) => (
                  <FileContributionCard key={i} file={f} />
                ))}
              </div>
            )}
          </CollapsibleSection>
        ) : null}

        {trail.length ? (
          <CollapsibleSection title="Parser Pipeline" defaultOpen>
            <ol className="list-none divide-y divide-vx-border border-y border-vx-border pl-0">
              {trail.map((event, i) => (
                <li key={`${event.event}-${i}`} className="flex gap-4 py-3">
                  <span className="w-16 shrink-0 font-mono text-[11px] font-bold text-white">
                    {event.time || "—"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-white">
                      {event.event}
                    </p>
                    {event.detail ? (
                      <p className="mt-1 text-[12px] text-white">{event.detail}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </CollapsibleSection>
        ) : null}
    </div>
  );

  if (embedded) return body;

  return (
    <CollapsibleSection title="Developer Details" reveal={reveal} defaultOpen={false}>
      {body}
    </CollapsibleSection>
  );
}

function FileContributionCard({ file }: { file: WorkbenchFileContribution }) {
  return (
    <WorkspaceCard className="min-w-0 overflow-hidden p-4">
      <h4 className="truncate text-[12px] font-black uppercase tracking-wide text-white">
        {file.file}
      </h4>
      <div className="mt-3 grid min-w-0 grid-cols-3 gap-2 border-t border-vx-border pt-3">
        {[
          { label: "Findings", value: file.findings },
          { label: "Retained", value: file.retained },
          { label: "Rejected", value: file.rejected },
        ].map((stat) => (
          <div key={stat.label} className="min-w-0 overflow-hidden border border-vx-border bg-vx-inset p-2.5">
            <p className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-white/50">
              {stat.label}
            </p>
            <p className="mt-1.5 truncate text-xl font-black leading-none text-white">{stat.value}</p>
          </div>
        ))}
      </div>
    </WorkspaceCard>
  );
}
