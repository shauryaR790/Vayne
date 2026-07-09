"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { LayoutGroup, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

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
  coreStatistics,
  displayedConfidenceMetrics,
  investigationSummary,
  missingEvidenceRows,
  normalizeFailureReason,
  riskOverviewMetrics,
  semanticConfidence,
  summarizePathFailures,
} from "@/lib/workbench-report-helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MetricTile, SectionLabel, WorkspaceCard } from "@/components/shared/workspace-card";
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

function SummaryChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center border border-white/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
      {label}
    </span>
  );
}

function StatePill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        active ? "border-white/50 bg-white text-black" : "border-white/20 text-white/35",
      )}
    >
      {label}
    </span>
  );
}

function findingStates(status: WorkbenchConfirmedFinding["status"]) {
  return {
    Observed:
      status === "Observed" ||
      status === "Correlated" ||
      status === "Hypothesized" ||
      status === "Validated",
    Correlated: status === "Correlated" || status === "Validated",
    Validated: status === "Validated",
    Rejected: status === "Rejected",
  };
}

export function InvestigationSummarySection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const summary = investigationSummary(workbench);
  if (!summary) return null;

  return (
    <WorkstationSection title="Investigation Summary" reveal={reveal} large>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <WorkspaceCard className="p-6 lg:col-span-2">
          <SectionLabel>Highest Business Risk</SectionLabel>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[24px] font-black uppercase leading-none tracking-tight text-white">
                {summary.title}
              </h3>
              <p className="mt-2 font-mono text-[14px] text-white/60">{summary.host}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                {summary.confidenceLabel}
              </p>
              <p className="mt-1 text-[40px] font-black leading-none text-white">
                {summary.confidence}%
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/15 pt-5">
            {summary.scannersAgree > 1 ? (
              <SummaryChip label={`${summary.scannersAgree} scanners agree`} />
            ) : (
              <SummaryChip label="Single source" />
            )}
            {summary.internetExposed ? <SummaryChip label="Internet exposed" /> : null}
            {summary.knownExploit ? <SummaryChip label="Known exploit exists" /> : null}
          </div>

          <div className="mt-5 border-t border-white/15 pt-5">
            <SectionLabel>Business Impact</SectionLabel>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-white/85">
              {summary.businessImpact}
            </p>
          </div>
        </WorkspaceCard>

        <WorkspaceCard className="flex flex-col p-6">
          <SectionLabel>Most Valuable Next Step</SectionLabel>
          <p className="mt-4 text-[16px] font-bold leading-snug text-white">{summary.nextStep}</p>
          <div className="mt-auto border-t border-white/15 pt-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
              Expected confidence gain
            </p>
            <p className="mt-1 text-[40px] font-black leading-none text-white">
              +{summary.expectedGain}%
            </p>
          </div>
        </WorkspaceCard>
      </div>
    </WorkstationSection>
  );
}

export function ExecutiveVerdictSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  return (
    <WorkstationSection title="Executive Verdict" reveal={reveal} large>
      <WorkspaceCard className="p-5">
        <SectionLabel>Assessment</SectionLabel>
        <p className="mt-3 max-w-[72ch] text-[15px] font-medium leading-[1.7] text-white">
          {workbench.executive_summary}
        </p>
      </WorkspaceCard>
    </WorkstationSection>
  );
}

export function RiskOverviewSection({
  workbench,
  risk,
  confidence,
  reveal,
}: {
  workbench: WorkbenchData;
  risk: string;
  confidence: number | null;
  reveal: number;
}) {
  const metrics = riskOverviewMetrics(workbench, risk, confidence);
  return (
    <WorkstationSection title="Risk Overview" reveal={reveal} large>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <MetricTile
            key={m.label}
            label={m.label}
            value={m.value}
            large={m.highlight}
            sub={m.highlight ? "Key metric" : undefined}
          />
        ))}
      </div>
    </WorkstationSection>
  );
}

function AnalystFindingCard({
  finding,
  allScanners,
  open,
  onToggle,
}: {
  finding: WorkbenchConfirmedFinding;
  allScanners: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const states = findingStates(finding.status);
  const proof = finding.proof?.length
    ? finding.proof
    : finding.sources.map((s) => ({
        source: s,
        detail: finding.evidence[0] || "Scanner observation",
      }));
  const sem = semanticConfidence(finding);
  const metrics = displayedConfidenceMetrics(finding);
  const summary =
    finding.evidence_summary ||
    sem?.evidence_summary || {
      scanners: finding.sources.length,
      capable_scanners: finding.scanner_agreement?.total || finding.sources.length,
      independent_observations: proof.length || finding.evidence.length || 1,
      conflicts: 0,
      canonical_entity: finding.title,
      version_confidence: 0,
    };
  const agreed = new Set(
    finding.scanner_agreement?.agreed || sem?.scanner_agreement?.agreed || finding.sources,
  );
  const capable =
    finding.scanner_agreement?.capable ||
    sem?.scanner_agreement?.capable ||
    (allScanners.length > 0 ? allScanners : finding.sources);
  const agreementRatio =
    finding.scanner_agreement?.ratio ||
    sem?.scanner_agreement?.ratio ||
    `${agreed.size} / ${Math.max(capable.length, 1)}`;
  const showCapableAgreement = capable.length > 1;
  const impact = finding.business_impact_detail;
  const corrMetric = sem?.correlation;
  const showBusinessImpact =
    sem?.kind !== "informational" &&
    Boolean(impact?.summary || finding.business_impact || finding.why_it_matters);
  const uniqueReason = finding.unique_reason || finding.reasoning[0] || "";

  return (
    <WorkspaceCard
      className={cn(
        "flex w-full flex-col overflow-hidden p-0",
        open ? "h-full min-h-0" : "h-[var(--finding-closed)]",
      )}
    >
      <div
        className={cn(
          "min-h-0 flex-1",
          open ? "overflow-y-auto [scrollbar-width:thin]" : "overflow-hidden",
        )}
      >
        <div className="border-b border-white/15 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-[13px] font-black uppercase leading-snug tracking-wide text-white">
                {finding.title}
              </h4>
              <p className="mt-1 truncate font-mono text-[11px] text-white/50">
                {finding.host || "—"}
              </p>
            </div>
            <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
          </div>

          {metrics.length ? (
            <div
              className={cn(
                "mt-3 grid gap-3",
                metrics.length === 1
                  ? "grid-cols-1"
                  : metrics.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-3",
              )}
            >
              {metrics.map(({ key, label, metric }) => (
                <div key={key}>
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
                    {label}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 font-black leading-none text-white",
                      key === sem?.primary.metric ? "text-[24px]" : "text-[18px]",
                    )}
                  >
                    {metric.score}%
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {uniqueReason ? (
            <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-white/55">
              {uniqueReason}
            </p>
          ) : null}

          <div className="mt-3 border-t border-white/10 pt-3">
            <SectionLabel>Evidence Summary</SectionLabel>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Scanners", value: String(summary.scanners) },
                {
                  label: "Observations",
                  value: String(summary.independent_observations),
                },
                { label: "Conflicts", value: String(summary.conflicts) },
                {
                  label: "Version conf.",
                  value: summary.version_confidence ? `${summary.version_confidence}%` : "—",
                },
              ].map((row) => (
                <div key={row.label} className="border border-white/20 bg-black px-2 py-1.5">
                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/45">
                    {row.label}
                  </p>
                  <p className="mt-0.5 font-mono text-[14px] font-black text-white">{row.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/45">
                  Canonical entity
                </p>
                <p className="mt-0.5 truncate text-[12px] font-bold text-white/85">
                  {summary.canonical_entity || finding.title}
                </p>
              </div>
              {showCapableAgreement ? (
                <div className="shrink-0 text-right">
                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/45">
                    Agreement
                  </p>
                  <p className="mt-0.5 font-mono text-[14px] font-black text-white">
                    {agreementRatio}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {showBusinessImpact ? (
            <div>
              <SectionLabel>Business Impact</SectionLabel>
              <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-white/75">
                {impact?.summary || finding.business_impact || finding.why_it_matters || "—"}
              </p>
            </div>
          ) : (
            <div>
              <SectionLabel>Finding type</SectionLabel>
              <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-white/65">
                {summary.category === "network" || sem?.kind === "informational"
                  ? "Informational / probe evidence — existence only; exploitation not assessed."
                  : "Service observation derived from scanner evidence."}
              </p>
            </div>
          )}

          <div>
            <SectionLabel>Current State</SectionLabel>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatePill active={states.Observed} label="Observed" />
              <StatePill active={states.Correlated} label="Correlated" />
              <StatePill active={states.Validated} label="Validated" />
              <StatePill active={states.Rejected} label="Rejected" />
            </div>
          </div>
        </div>

        {open ? (
          <div className="space-y-5 border-t border-white/15 p-4">
            <div>
              <SectionLabel>Evidence</SectionLabel>
              <ul className="mt-3 space-y-2">
                {proof.map((row, i) => (
                  <li
                    key={`${row.source}-${i}`}
                    className="grid grid-cols-[7rem_1fr] gap-3 border border-white/20 bg-black px-3 py-2"
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wide text-white/70">
                      {row.source}
                    </span>
                    <span className="font-mono text-[12px] text-white/80">{row.detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {showCapableAgreement ? (
              <div>
                <SectionLabel>Scanner Agreement</SectionLabel>
                <p className="mt-1 text-[11px] text-white/45">
                  Against scanners capable of detecting this entity
                </p>
                <div className="mt-3 space-y-2">
                  {capable.map((s) => (
                    <div
                      key={s}
                      className="flex items-center justify-between border border-white/15 px-3 py-2"
                    >
                      <span className="text-[12px] font-bold uppercase tracking-wide text-white/80">
                        {s}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[14px]",
                          agreed.has(s) ? "text-white" : "text-white/30",
                        )}
                      >
                        {agreed.has(s) ? "✓" : "✖"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 border-t border-white/15 pt-3">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-white/60">
                    Agreement {agreementRatio}
                  </p>
                  {corrMetric ? (
                    <p className="font-mono text-[13px] font-bold text-white">
                      Correlation {corrMetric.score}%
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {metrics.map(({ key, label, metric }) => (
              <div key={`breakdown-${key}`}>
                <SectionLabel>{label} Confidence</SectionLabel>
                <p className="mt-1 text-[11px] text-white/45">{metric.question}</p>
                <p className="mt-2 text-[28px] font-black leading-none text-white">{metric.score}%</p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
                  Built from
                </p>
                <ul className="mt-2 space-y-1.5">
                  {metric.factors.map((f, i) => (
                    <li
                      key={`${f.label}-${i}`}
                      className="flex items-center justify-between gap-3 text-[13px]"
                    >
                      <span className="text-white/70">{f.label}</span>
                      <span
                        className={cn(
                          "font-mono font-bold",
                          f.delta >= 0 ? "text-white" : "text-white/50",
                        )}
                      >
                        {f.delta >= 0 ? `+${f.delta}` : f.delta}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 border-t border-white/20 pt-2 text-[13px] font-bold">
                    <span className="uppercase tracking-wide text-white">Total</span>
                    <span className="font-mono text-white">{metric.score}%</span>
                  </li>
                </ul>
              </div>
            ))}

            {impact && showBusinessImpact ? (
              <div>
                <SectionLabel>Business Impact Detail</SectionLabel>
                <dl className="mt-3 space-y-3">
                  {[
                    { label: "Attacker gains", value: impact.attacker_gains },
                    { label: "Systems exposed", value: impact.systems_exposed },
                    { label: "Process affected", value: impact.process_affected },
                    { label: "Why it matters", value: impact.importance },
                  ].map((row) => (
                    <div key={row.label}>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
                        {row.label}
                      </dt>
                      <dd className="mt-1 text-[13px] leading-relaxed text-white/75">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {finding.validated_checks.length || finding.not_validated_checks.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <SectionLabel>Validated</SectionLabel>
                  <ul className="mt-2 space-y-1">
                    {finding.validated_checks.map((item) => (
                      <li key={item} className="text-[12px] text-white/70">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <SectionLabel>Missing</SectionLabel>
                  <ul className="mt-2 space-y-1">
                    {finding.not_validated_checks.map((item) => (
                      <li key={item} className="text-[12px] text-white/45">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="mt-auto flex w-full shrink-0 items-center justify-between border-t border-white/15 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50 transition-colors hover:text-white"
      >
        {open ? "Hide proof" : "Show proof"}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
    </WorkspaceCard>
  );
}

export function ConfirmedFindingsSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const findings = workbench.confirmed_findings;
  const visible = showAll ? findings : findings.slice(0, 6);
  const allScanners = workbench.evidence_sources.map((s) => s.label);

  // Pack into 2 columns by height units: closed = 1, open = 2 (open ≈ two closed).
  // Always assign the next card to the shorter column so no mid-grid holes appear.
  const columns = useMemo(() => {
    const left: WorkbenchConfirmedFinding[] = [];
    const right: WorkbenchConfirmedFinding[] = [];
    let leftH = 0;
    let rightH = 0;
    for (const finding of visible) {
      const h = openId === finding.id ? 2 : 1;
      if (leftH <= rightH) {
        left.push(finding);
        leftH += h;
      } else {
        right.push(finding);
        rightH += h;
      }
    }
    return { left, right };
  }, [visible, openId]);

  if (!findings.length) return null;

  const renderColumn = (items: WorkbenchConfirmedFinding[]) =>
    items.map((finding) => {
      const isOpen = openId === finding.id;
      return (
        <motion.div
          key={finding.id}
          layout
          layoutDependency={openId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          className={cn(
            "min-h-0 w-full",
            isOpen ? "h-[calc(var(--finding-closed)*2+var(--finding-gap))]" : "h-[var(--finding-closed)]",
          )}
          transition={{
            layout: { type: "spring", stiffness: 400, damping: 36 },
            opacity: { duration: 0.16 },
          }}
        >
          <AnalystFindingCard
            finding={finding}
            allScanners={allScanners}
            open={isOpen}
            onToggle={() => setOpenId((cur) => (cur === finding.id ? null : finding.id))}
          />
        </motion.div>
      );
    });

  return (
    <WorkstationSection
      title="Confirmed Findings"
      reveal={reveal}
      large
      aside={
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          {findings.length} retained
        </span>
      }
    >
      <LayoutGroup id="confirmed-findings">
        <div
          className="flex flex-col gap-4 md:flex-row md:items-start"
          style={
            {
              "--finding-closed": "20rem",
              "--finding-gap": "1rem",
            } as CSSProperties
          }
        >
          <div className="flex min-w-0 flex-1 flex-col gap-4">{renderColumn(columns.left)}</div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">{renderColumn(columns.right)}</div>
        </div>
      </LayoutGroup>
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

function ValidatedPathCard({ path }: { path: WorkbenchCandidatePath }) {
  const steps = path.steps.map(shortStep);
  return (
    <WorkspaceCard className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, i) => (
          <span key={`${step}-${i}`} className="inline-flex items-center gap-2">
            {i > 0 ? <span className="text-white/30">↓</span> : null}
            <span className="text-[12px] font-bold uppercase tracking-wide text-white/85">
              {step}
            </span>
          </span>
        ))}
      </div>
      <p className="mt-4 text-[12px] font-bold uppercase tracking-wider text-white/60">
        Validated · {path.confidence}%
      </p>
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
    <div className="border-t border-white/15 bg-black px-6 py-6">
      <div className="mb-4 border-b border-white pb-3">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.15em] text-white">
          Candidate Attack Paths
        </h3>
        <p className="mt-1 text-[12px] uppercase tracking-wider text-white/50">
          {validated.length} validated · {rejected.length} rejected
        </p>
      </div>

      {validated.length ? (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {validated.map((path, i) => (
            <ValidatedPathCard key={`v-${i}`} path={path} />
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
          <div className="mt-5 space-y-2 border-t border-white/15 pt-4">
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
            <div className="mt-5 space-y-3 border-t border-white/15 pt-4">
              {rejected.map((path, i) => (
                <div key={`r-${i}`} className="border border-white/15 px-4 py-3">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-white/80">
                    {path.steps.map(shortStep).join(" → ")}
                  </p>
                  <p className="mt-2 text-[12px] text-white/55">
                    {normalizeFailureReason(path.reason)}
                    {path.missing[0] ? ` · need ${path.missing[0]}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </WorkspaceCard>
      ) : null}
    </div>
  );
}

export function MissingEvidenceSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const rows = useMemo(() => missingEvidenceRows(workbench), [workbench]);
  if (!rows.length) return null;

  return (
    <WorkstationSection title="Missing Evidence" reveal={reveal} large>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((row, i) => (
          <WorkspaceCard key={`${row.topic}-${i}`} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-[14px] font-black uppercase tracking-wide text-white">
                {row.topic}
              </h4>
              <span className="font-mono text-[20px] font-black text-white">
                +{row.expected_gain || 0}%
              </span>
            </div>
            <div className="mt-4 space-y-3 border-t border-white/15 pt-4">
              <div>
                <SectionLabel>Reason</SectionLabel>
                <p className="mt-2 text-[13px] font-medium uppercase text-white/70">{row.reason}</p>
              </div>
              <div>
                <SectionLabel>Evidence needed</SectionLabel>
                <p className="mt-2 text-[13px] leading-relaxed text-white/65">
                  {row.evidence_needed}
                </p>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
                Expected confidence increase
              </p>
            </div>
          </WorkspaceCard>
        ))}
      </div>
    </WorkstationSection>
  );
}

/** @deprecated Use MissingEvidenceSection */
export function UnknownsSection(props: { workbench: WorkbenchData; reveal: number }) {
  return <MissingEvidenceSection {...props} />;
}

export function RecommendationsSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  if (!workbench.next_actions.length) return null;
  return (
    <WorkstationSection title="Recommendations" reveal={reveal} large>
      <div className="grid grid-cols-1 gap-4">
        {workbench.next_actions.map((action, i) => (
          <WorkspaceCard key={i} className="p-5">
            <div className="flex items-start gap-4">
              <span className="shrink-0 border border-white/40 px-2 py-1 text-[10px] font-bold uppercase text-white">
                P{i + 1}
              </span>
              <p className="text-[14px] font-medium leading-relaxed text-white/85">{action}</p>
            </div>
          </WorkspaceCard>
        ))}
      </div>
    </WorkstationSection>
  );
}

export function InvestigationTimelineSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
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
    <WorkstationSection title="Investigation Timeline" reveal={reveal} large>
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
        <span className="font-mono text-[13px] font-bold text-white/70">
          {corr.base_confidence != null && corr.final_confidence != null
            ? `${corr.base_confidence}% → ${corr.final_confidence}%`
            : `${corr.confidence}%`}
        </span>
      </div>
      <div className="mt-4 space-y-3 border-t border-white/15 pt-4">
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
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 sm:grid-cols-4">
        {[
          { label: "Hosts", value: hosts },
          { label: "Findings", value: source.findings },
          { label: "Critical", value: source.critical },
          { label: "Warnings", value: source.high },
        ].map((stat) => (
          <div key={stat.label} className="border border-white/20 bg-black p-3">
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
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const hostByTool = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of workbench.file_contributions) {
      map.set(row.tool, (map.get(row.tool) ?? 0) + row.hosts);
    }
    return map;
  }, [workbench.file_contributions]);

  const scanners = workbench.evidence_sources.map((s) => s.label);

  return (
    <CollapsibleSection
      title="Evidence Sources"
      reveal={reveal}
      defaultOpen
      aside={
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          {workbench.evidence_sources.length} sources
        </span>
      }
    >
      <div className="space-y-6">
        {workbench.evidence_sources.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {workbench.evidence_sources.map((s) => (
              <EvidenceSourceCard
                key={s.tool}
                source={s}
                hosts={hostByTool.get(s.label) ?? hostByTool.get(s.tool) ?? 0}
              />
            ))}
          </div>
        ) : null}

        {workbench.correlations.length ? (
          <div>
            <div className="mb-4 border-b border-white pb-3">
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
    </CollapsibleSection>
  );
}

export function DeveloperDetailsSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const stats = coreStatistics(workbench.statistics);
  const trail = workbench.pipeline.length ? buildFallbackTrail(workbench) : [];
  return (
    <CollapsibleSection title="Developer Details" reveal={reveal} defaultOpen={false}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <MetricTile key={s.label} label={s.label} value={s.value} large />
          ))}
        </div>

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
          <div>
            <div className="mb-4 border-b border-white pb-3">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.15em]">
                File contribution
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {workbench.file_contributions.map((f, i) => (
                <FileContributionCard key={i} file={f} />
              ))}
            </div>
          </div>
        ) : null}

        {trail.length ? (
          <div>
            <div className="mb-4 border-b border-white pb-3">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.15em]">
                Parser pipeline
              </h3>
            </div>
            <WorkspaceCard className="p-0">
              <ol className="divide-y divide-white/15">
                {trail.map((event, i) => (
                  <li key={`${event.event}-${i}`} className="flex gap-4 px-5 py-3">
                    <span className="w-16 shrink-0 font-mono text-[11px] font-bold text-white/45">
                      {event.time || "—"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold uppercase tracking-wide text-white/80">
                        {event.event}
                      </p>
                      {event.detail ? (
                        <p className="mt-1 text-[12px] text-white/45">{event.detail}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </WorkspaceCard>
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

function FileContributionCard({ file }: { file: WorkbenchFileContribution }) {
  return (
    <WorkspaceCard className="p-5">
      <h4 className="truncate text-[13px] font-black uppercase text-white">{file.file}</h4>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
        {[
          { label: "Findings", value: file.findings },
          { label: "Retained", value: file.retained },
          { label: "Rejected", value: file.rejected },
        ].map((stat) => (
          <div key={stat.label} className="border border-white/20 bg-black p-3">
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
