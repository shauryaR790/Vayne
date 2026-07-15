"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
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
  BADGE_MEANING,
  businessImpactRows,
  confidenceBand,
  confidenceMeaning,
  coreStatistics,
  displayedConfidenceMetrics,
  evidenceAgainst,
  evidenceChecklist,
  exploitVerification,
  investigationVerdict,
  missingEvidenceRows,
  normalizeFailureReason,
  recommendationTasks,
  riskOverviewMetrics,
  semanticConfidence,
  statusMeaning,
  summarizePathFailures,
  uncertaintyFactors,
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

/** A confidence dimension: label → number → band word → meaning (P1, P4). */
function MetricWithMeaning({
  label,
  score,
  meaning,
  large,
}: {
  label: string;
  score: number;
  meaning: string;
  large?: boolean;
}) {
  const band = confidenceBand(score);
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("font-black leading-none text-white", large ? "text-[28px]" : "text-[18px]")}>
          {score}%
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-white/70">
          {band.word}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-white/50">{band.sentence}</p>
      {meaning ? <p className="mt-0.5 text-[10px] leading-snug text-white/40">{meaning}</p> : null}
    </div>
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

export function InvestigationVerdictSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const verdict = investigationVerdict(workbench);
  const legend: WorkbenchConfirmedFinding["status"][] = [
    "Observed",
    "Correlated",
    "Validated",
    "Rejected",
  ];

  return (
    <WorkstationSection title="Investigation Verdict" reveal={reveal} large>
      <WorkspaceCard className="p-6">
        <SectionLabel>What VANE discovered</SectionLabel>
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

        <div className="mt-5 border-t border-vx-border pt-5">
          <SectionLabel>How to read a finding&rsquo;s state</SectionLabel>
          <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {legend.map((s) => {
              const m = statusMeaning(s);
              return (
                <div key={s} className="flex items-start gap-2.5">
                  <dt className="shrink-0">
                    <StatePill active label={m.label} />
                  </dt>
                  <dd className="text-[11px] leading-snug text-vx-secondary">{m.meaning}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </WorkspaceCard>
    </WorkstationSection>
  );
}

export function InvestigationFlowSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const hasHypotheses = workbench.confirmed_findings.some(
    (f) => (f.investigation?.hypotheses?.length || 0) > 0,
  );
  const steps: { label: string; done: boolean }[] = [
    { label: "Evidence collected", done: workbench.evidence_sources.length > 0 },
    { label: "Observations created", done: workbench.confirmed_findings.length > 0 },
    { label: "Alternatives tested", done: hasHypotheses || workbench.confirmed_findings.length > 0 },
    { label: "Confidence calculated", done: workbench.confirmed_findings.length > 0 },
    { label: "Attack paths evaluated", done: workbench.candidate_paths.length > 0 },
    { label: "Business impact estimated", done: businessImpactRows(workbench).length > 0 },
    { label: "Recommendations generated", done: workbench.next_actions.length > 0 },
  ];

  return (
    <WorkstationSection title="How This Investigation Was Built" reveal={reveal}>
      <p className="mb-4 max-w-[72ch] text-[13px] leading-relaxed text-vx-secondary">
        VANE did not jump to conclusions. It worked through these stages — the same order a human
        investigator would. Each stage below fed the next.
      </p>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className="flex items-center gap-3 border border-vx-border bg-vx-inset px-3 py-2.5"
          >
            <span className="font-mono text-[16px] font-black leading-none text-vx-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 text-[11px] font-bold uppercase leading-snug tracking-wide text-vx-text">
              {step.label}
            </span>
            <span
              className={cn("font-mono text-[13px]", step.done ? "text-vx-text" : "text-vx-muted")}
              title={step.done ? "Completed" : "Not reached in this investigation"}
            >
              {step.done ? "✓" : "—"}
            </span>
          </li>
        ))}
      </ol>
    </WorkstationSection>
  );
}

const RISK_TILE_MEANING: Record<string, string> = {
  Risk: "Overall severity, weighted by exposure",
  Observation: "How sure the top finding exists",
  Correlation: "How much scanners agree",
  Exploit: "How likely it can be exploited",
  Confidence: "Engine certainty in the top finding",
  Findings: "Retained after evidence review",
  Assets: "Distinct hosts investigated",
  Files: "Scan files parsed",
  Paths: "Attack paths validated / rejected",
  Correlations: "Cross-scanner evidence matches",
};

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
  // Decision-relevant only. Everything else lives in Investigation Metadata (P1).
  const decision = metrics.filter((m) => m.highlight || m.label === "Paths");
  return (
    <WorkstationSection title="At a Glance" reveal={reveal} large>
      <p className="mb-5 max-w-[72ch] text-[13px] leading-relaxed text-white/55">
        The four numbers that drive the decision. Each tile says what it measures — nothing here
        needs prior knowledge of VANE. Scan counts and parser stats live under Investigation
        Metadata at the bottom.
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {decision.map((m) => (
          <MetricTile
            key={m.label}
            label={m.label}
            value={m.value}
            large
            sub={RISK_TILE_MEANING[m.label] ?? "Key metric"}
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
  const expert = useExpertMode();
  if (!stats.length) return null;
  return (
    <CollapsibleSection
      title="Investigation Metadata"
      reveal={reveal}
      defaultOpen={false}
      forceOpen={expert ? true : undefined}
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
  open,
  onToggle,
}: {
  finding: WorkbenchConfirmedFinding;
  allScanners: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const expert = useExpertMode();
  const state = statusMeaning(finding.status);
  const proof = finding.proof?.length
    ? finding.proof
    : finding.sources.map((s) => ({
        source: s,
        detail: finding.evidence[0] || "Scanner observation",
      }));
  const sem = semanticConfidence(finding);
  const metrics = displayedConfidenceMetrics(finding);
  const primary =
    metrics.find((m) => m.key === sem?.primary.metric) || metrics[0] || null;
  const checklist = evidenceChecklist(finding);
  const supporting = checklist.filter((c) => c.ok);
  const missing = checklist.filter((c) => !c.ok);
  const against = evidenceAgainst(finding);
  const uncertainty = uncertaintyFactors(finding);
  const exploit = exploitVerification(finding);
  const hypotheses = (finding.investigation?.hypotheses || []).slice(0, 3);
  const evidenceMeta = finding.evidence_summary;

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
  const whyRetained = finding.unique_reason || finding.reasoning[0] || "";
  const nextStep =
    exploit?.probes[0]?.name ||
    finding.not_validated_checks[0] ||
    "Reproduce the exposure to raise exploit confidence.";

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
        {/* Header — what & where */}
        <div className="border-b border-vx-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-[13px] font-black uppercase leading-snug tracking-wide text-white">
                {finding.title}
              </h4>
              <p className="mt-1 truncate font-mono text-[11px] text-white/50">
                {finding.host || "—"}
              </p>
              {expert ? (
                <p
                  className="mt-0.5 truncate font-mono text-[10px] text-white/35"
                  title="CVE · version · CPE"
                >
                  {[finding.cve, evidenceMeta?.version, evidenceMeta?.cpe]
                    .filter(Boolean)
                    .join(" · ") || "no CVE / version metadata"}
                </p>
              ) : null}
            </div>
            <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
          </div>

          {/* State + meaning (P1, P6) */}
          <div className="mt-3 flex items-center gap-2">
            <StatePill active label={state.label} />
            <p className="text-[11px] leading-snug text-white/55">{state.meaning}</p>
          </div>

          {/* Primary confidence — labelled number + meaning (P1) */}
          {primary ? (
            <div className="mt-3 border-t border-vx-border pt-3">
              <MetricWithMeaning
                label={`${primary.label} confidence`}
                score={primary.metric.score}
                meaning={confidenceMeaning(primary.key, primary.metric.score)}
                large
              />
            </div>
          ) : null}
        </div>

        {/* WHY (supporting) vs WHAT'S MISSING — scannable lists, not prose (P2, P3) */}
        <div className="grid grid-cols-2 gap-4 p-4">
          <div>
            <SectionLabel>Why</SectionLabel>
            {supporting.length ? (
              <EvidenceChecklist items={supporting.slice(0, 4)} />
            ) : (
              <p className="mt-2 text-[11px] text-white/40">Awaiting supporting evidence</p>
            )}
          </div>
          <div>
            <SectionLabel>Missing</SectionLabel>
            {missing.length ? (
              <EvidenceChecklist items={missing.slice(0, 4)} />
            ) : (
              <p className="mt-2 text-[11px] text-white/40">Nothing outstanding</p>
            )}
          </div>
        </div>

        {/* NEXT ACTION — always visible so the card is decision-ready (P2, P8) */}
        <div className="border-t border-vx-border px-4 py-3">
          <SectionLabel>Next action</SectionLabel>
          <p className="mt-1 line-clamp-2 text-[12px] font-medium leading-snug text-white/85">
            {nextStep}
          </p>
        </div>

        {open ? (
          <div className="space-y-5 border-t border-vx-border p-4">
            {/* Can an attacker actually exploit this — verified vs inferred (P4) */}
            {exploit ? <ExploitBadge verification={exploit} /> : null}

            {/* Evidence against — surface disagreement openly (P3) */}
            {against.length ? (
              <div>
                <SectionLabel>Evidence against</SectionLabel>
                <ul className="mt-2 space-y-1">
                  {against.map((a) => (
                    <li key={a} className="flex items-center gap-2 text-[11px] leading-snug">
                      <span className="font-mono text-white/70">⚠</span>
                      <span className="text-white/60">{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Why retained — the analyst's one-line judgement */}
            {whyRetained ? (
              <div>
                <SectionLabel>Why it was retained</SectionLabel>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{whyRetained}</p>
              </div>
            ) : null}

            {/* Reasoning — analyst notebook */}
            {finding.reasoning.length ? (
              <div>
                <SectionLabel>Reasoning</SectionLabel>
                <ul className="mt-2 space-y-1.5">
                  {finding.reasoning.map((r, i) => (
                    <li key={`${r}-${i}`} className="flex gap-2 text-[13px] leading-relaxed text-white/70">
                      <span className="text-white/30">—</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Proof — raw evidence per source */}
            <div>
              <SectionLabel>Proof</SectionLabel>
              <ul className="mt-3 space-y-2">
                {proof.map((row, i) => (
                  <li
                    key={`${row.source}-${i}`}
                    className="grid grid-cols-[7rem_1fr] gap-3 border border-vx-border bg-vx-inset px-3 py-2"
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
                  Which scanners that could detect this actually did
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
                        {agreed.has(s) ? "✓" : "✗"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 border-t border-vx-border pt-3">
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

            {/* Confidence breakdown — every number explained (P1) */}
            {metrics.map(({ key, label, metric }) => (
              <div key={`breakdown-${key}`}>
                <SectionLabel>{label} Confidence</SectionLabel>
                <p className="mt-1 text-[11px] text-white/45">{metric.question}</p>
                <p className="mt-1 text-[11px] leading-snug text-white/55">
                  {confidenceMeaning(key, metric.score)}
                </p>
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

            {/* Alternatives the engine considered and ranked lower (P12) */}
            {hypotheses.length ? (
              <div>
                <SectionLabel>Alternative explanations considered</SectionLabel>
                <div className="mt-3 space-y-2">
                  {hypotheses.map((h, i) => (
                    <div key={`${h.label}-${i}`} className="border border-white/15 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[12px] font-bold text-white/80">{h.label}</span>
                        <span className="font-mono text-[12px] text-white/60">{h.probability}%</span>
                      </div>
                      {h.rationale ? (
                        <p className="mt-1 text-[11px] leading-snug text-white/50">{h.rationale}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* What would confirm it — probes from the validation loop */}
            {exploit && exploit.probes.length ? (
              <div>
                <SectionLabel>What would confirm exploitability</SectionLabel>
                <ul className="mt-2 space-y-1.5">
                  {exploit.probes.map((p, i) => (
                    <li
                      key={`${p.name}-${i}`}
                      className="flex items-center justify-between gap-3 text-[13px]"
                    >
                      <span className="text-white/70">{p.name}</span>
                      <span className="font-mono font-bold text-white">+{p.gain}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {impact && showBusinessImpact ? (
              <div>
                <SectionLabel>Potential attacker outcome</SectionLabel>
                <dl className="mt-3 space-y-3">
                  {[
                    { label: "Attacker gains", value: impact.attacker_gains },
                    { label: "Attacker could access", value: impact.systems_exposed },
                    { label: "If exploited", value: impact.process_affected },
                    { label: "Why it matters", value: impact.importance },
                  ]
                    .filter((row) => row.value)
                    .map((row) => (
                      <div key={row.label}>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
                          {row.label}
                        </dt>
                        <dd className="mt-1 text-[13px] leading-relaxed text-white/75">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ) : null}

            {/* What could change this — never hide uncertainty (P10) */}
            {uncertainty.length ? (
              <div>
                <SectionLabel>What could change this conclusion</SectionLabel>
                <ul className="mt-2 space-y-1">
                  {uncertainty.map((u) => (
                    <li key={u} className="flex gap-2 text-[12px] leading-snug text-white/55">
                      <span className="text-white/30">—</span>
                      <span>{u}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Expert-only technical details — same page serves researchers (P11) */}
            {expert ? (
              <div className="border-t border-vx-border pt-4">
                <SectionLabel>Technical details</SectionLabel>
                <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { label: "CVE", value: finding.cve || "—" },
                    { label: "CPE", value: evidenceMeta?.cpe || "—" },
                    { label: "Canonical entity", value: evidenceMeta?.canonical_entity || finding.title },
                    { label: "Version", value: evidenceMeta?.version || "—" },
                    { label: "Category", value: evidenceMeta?.category || "—" },
                    { label: "Scanners", value: finding.sources.join(", ") || "—" },
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
                  <div className="mt-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
                      Raw evidence
                    </p>
                    <ul className="mt-2 space-y-1">
                      {finding.evidence.map((e, i) => (
                        <li
                          key={`${e}-${i}`}
                          className="border border-white/10 bg-vx-app px-3 py-1.5 font-mono text-[11px] leading-snug text-white/60"
                        >
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="mt-auto flex w-full shrink-0 items-center justify-between border-t border-vx-border px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50 transition-colors hover:text-white"
      >
        {open ? "Hide reasoning & proof" : "Show reasoning & proof"}
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
      <p className="mb-5 max-w-[72ch] text-[13px] leading-relaxed text-white/55">
        Each card answers, on its own: what it is, where, how certain the engine is, what evidence
        exists and what is missing, and what to do next. Highest priority first. Open a card for the
        full reasoning and proof.
      </p>
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
        <span className="font-mono text-[12px] font-bold text-white/70">{path.confidence}%</span>
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
      <p className="mb-5 max-w-[72ch] text-[13px] leading-relaxed text-white/55">
        What the engine could not confirm — and how much confidence each piece would add if you go
        and get it. This is why some findings stayed at &ldquo;Observed&rdquo; rather than
        &ldquo;Validated.&rdquo;
      </p>
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
            <div className="mt-4 space-y-3 border-t border-vx-border pt-4">
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

export function BusinessImpactSection({
  workbench,
  reveal,
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const rows = useMemo(() => businessImpactRows(workbench), [workbench]);
  if (!rows.length) return null;

  return (
    <WorkstationSection title="Business Impact" reveal={reveal} large>
      <p className="mb-5 max-w-[72ch] text-[13px] leading-relaxed text-white/55">
        What the technical findings above mean for the business if an attacker acts on them.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <WorkspaceCard key={row.id} className="p-5">
            <h4 className="text-[14px] font-black uppercase tracking-wide text-white">
              {row.title}
            </h4>
            <p className="mt-1 font-mono text-[11px] text-white/50">{row.host}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-white/80">{row.summary}</p>
            {row.attacker_gains || row.systems_exposed || row.process_affected ? (
              <dl className="mt-4 space-y-3 border-t border-vx-border pt-4">
                {[
                  { label: "Attacker gains", value: row.attacker_gains },
                  { label: "Systems exposed", value: row.systems_exposed },
                  { label: "Process affected", value: row.process_affected },
                ]
                  .filter((r) => r.value)
                  .map((r) => (
                    <div key={r.label}>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
                        {r.label}
                      </dt>
                      <dd className="mt-1 text-[12px] leading-relaxed text-white/65">{r.value}</dd>
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
}: {
  workbench: WorkbenchData;
  reveal: number;
}) {
  const tasks = recommendationTasks(workbench);
  if (!tasks.length) return null;
  return (
    <WorkstationSection title="Recommendations" reveal={reveal} large>
      <p className="mb-5 max-w-[72ch] text-[13px] leading-relaxed text-white/55">
        Concrete next tasks, ordered by how much they move the investigation forward. Each lists
        what running it should tell you. P1 is the single most valuable action.
      </p>
      <div className="grid grid-cols-1 gap-4">
        {tasks.map((task, i) => (
          <WorkspaceCard key={`${task.action}-${i}`} className="p-5">
            <div className="flex items-start gap-4">
              <span className="shrink-0 border border-white/40 px-2 py-1 text-[10px] font-bold uppercase text-white">
                P{i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium leading-relaxed text-white/90">
                  {task.action}
                </p>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-vx-border pt-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
                      Expected result
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-white/70">
                      {task.expectedResult}
                    </p>
                  </div>
                  {task.expectedGain ? (
                    <div className="shrink-0 text-right">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
                        Confidence gain
                      </p>
                      <p className="mt-0.5 font-mono text-[18px] font-black leading-none text-white">
                        +{task.expectedGain}%
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
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
  const expert = useExpertMode();

  return (
    <CollapsibleSection
      title="Evidence Sources"
      reveal={reveal}
      defaultOpen={false}
      forceOpen={expert ? true : undefined}
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
  const expert = useExpertMode();
  return (
    <CollapsibleSection
      title="Developer Details"
      reveal={reveal}
      defaultOpen={false}
      forceOpen={expert ? true : undefined}
    >
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
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-vx-border pt-4">
        {[
          { label: "Findings", value: file.findings },
          { label: "Retained", value: file.retained },
          { label: "Rejected", value: file.rejected },
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
