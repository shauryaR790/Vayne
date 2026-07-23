"use client";

import { MetricTile } from "@/components/shared/workspace-card";
import { PriorityInvestigationRow } from "@/components/workspace/executive-investigation-overview";
import {
  buildInvestigationBriefingModel,
  panelMetricsFromSummary,
  type InvestigationBriefingModel,
} from "@/lib/investigation-briefing";
import type { WorkbenchData } from "@/lib/types";
import { cn } from "@/lib/utils";

function BriefingSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-vx-border px-6 py-8", className)}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{title}</h2>
      {children}
    </section>
  );
}

function EvidenceChain({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ol className="mt-4 space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-3 text-[13px] leading-relaxed text-white/80">
          <span className="shrink-0 font-mono text-[11px] font-bold text-white/35">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function ReasoningPipeline({ reasoning }: { reasoning: InvestigationBriefingModel["reasoning"] }) {
  return (
    <div className="mt-5 space-y-0">
      {reasoning.map((step, index) => (
        <div key={step.stage} className="relative flex gap-4 pb-6 last:pb-0">
          {index < reasoning.length - 1 ? (
            <span
              className="absolute left-[11px] top-7 h-[calc(100%-12px)] w-px bg-white/15"
              aria-hidden
            />
          ) : null}
          <span className="relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center border border-white/25 bg-vx-app text-[10px] font-bold text-white/70">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white">{step.stage}</p>
            <p className="mt-1 text-[13px] text-white/55">{step.detail}</p>
            <ul className="mt-2 space-y-1">
              {step.items.map((item) => (
                <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-white/80">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-white/40" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

function IgnoredRow({ label, value }: { label: string; value: number }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-vx-border py-3 last:border-b-0">
      <span className="text-[13px] text-white/75">{label}</span>
      <span className="font-mono text-[13px] text-white/90">{value.toLocaleString()}</span>
    </div>
  );
}

export function InvestigationBriefing({
  workbench,
  uploadedFileCount,
  onOpenSection,
}: {
  workbench: WorkbenchData;
  uploadedFileCount?: number;
  onOpenSection?: (sectionId: string) => void;
}) {
  const briefing = buildInvestigationBriefingModel(workbench, uploadedFileCount);
  const panel = workbench.summary_panel;
  const metrics = panel ? panelMetricsFromSummary(panel) : null;

  return (
    <div className="border-b border-vx-border bg-vx-section-body">
      <div className="border-b border-vx-border px-6 py-5">
        <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-white/50">
          Investigation Brief
        </p>
        <p className="mt-3 max-w-[72ch] text-[16px] leading-relaxed text-white">
          {briefing.metrics.workloadHeadline}
        </p>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-white/55">
          {briefing.metrics.reviewHeadline}
        </p>
      </div>

      {metrics ? (
        <div className="border-b border-vx-border px-6 py-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            {metrics.map((row) => (
              <MetricTile key={row.label} flat label={row.label} value={row.value} sub={row.sub} />
            ))}
          </div>
        </div>
      ) : null}

      <BriefingSection title="Start Here">
        {briefing.startHere ? (
          <div className="mt-2">
            {briefing.startHere.rankingExplanation || briefing.startHere.reason ? (
              <p className="mb-4 max-w-[72ch] text-[14px] leading-relaxed text-white/75">
                <span className="font-medium text-white">Why ranked first: </span>
                {briefing.startHere.rankingExplanation || briefing.startHere.reason}
              </p>
            ) : null}
            <PriorityInvestigationRow
              item={briefing.startHere}
              hideConfidence
              onOpen={onOpenSection}
            />
            {briefing.priorityFileGroups[0]?.files.length ? (
              <div className="mt-6 border-t border-vx-border pt-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">
                  Exact evidence files
                </p>
                <div className="mt-3 divide-y divide-vx-border border border-vx-border">
                  {briefing.priorityFileGroups[0].files.map((file) => (
                    <div
                      key={`start-${file.filename}-${file.scanner}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
                    >
                      <span className="font-mono text-[13px] text-white">{file.filename}</span>
                      <span className="text-[11px] uppercase tracking-wide text-white/45">
                        {file.scanner}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {briefing.startHere.evidenceItems.length ? (
              <div className="mt-6 border-t border-vx-border pt-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">
                  Evidence chain
                </p>
                <EvidenceChain items={briefing.startHere.evidenceItems} />
              </div>
            ) : null}
            {briefing.startHere.analystTasks.length ? (
              <div className="mt-6 border-t border-vx-border pt-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">
                  Immediate analyst tasks
                </p>
                <ul className="mt-3 space-y-2">
                  {briefing.startHere.analystTasks.slice(0, 4).map((task) => (
                    <li key={task.action} className="text-[13px] leading-relaxed text-white/80">
                      <span className="font-medium text-white">{task.action}</span>
                      {task.why ? (
                        <span className="text-white/55"> — {task.why}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-6 text-[12px] text-white/50">
              Expected review: ~{briefing.startHere.estimatedReviewMinutes} min
            </p>
          </div>
        ) : (
          <div className="mt-4 max-w-[72ch] space-y-2">
            <p className="text-[14px] leading-relaxed text-white/75">
              {workbench.investigation_queue_status?.headline ||
                "No investigation currently requires immediate review."}
            </p>
            {(workbench.investigation_queue_status?.reasons ?? []).map((reason) => (
              <p key={reason} className="text-[13px] leading-relaxed text-white/60">
                {reason}
              </p>
            ))}
          </div>
        )}
      </BriefingSection>

      <BriefingSection title="Why We Ignored the Rest">
        <div className="mt-4 border border-vx-border px-4">
          <IgnoredRow label="Duplicate evidence removed" value={briefing.ignored.duplicate_evidence_removed} />
          <IgnoredRow label="Informational findings" value={briefing.ignored.informational_findings} />
          <IgnoredRow label="Already mitigated findings" value={briefing.ignored.already_mitigated} />
          <IgnoredRow label="Contradicted findings" value={briefing.ignored.contradicted_findings} />
          <IgnoredRow label="Low business impact findings" value={briefing.ignored.low_business_impact} />
          {(briefing.ignored.false_positives_removed ?? 0) > 0 ? (
            <IgnoredRow
              label="False positives eliminated"
              value={briefing.ignored.false_positives_removed ?? 0}
            />
          ) : null}
          {(briefing.ignored.noise_suppressed ?? 0) > 0 ? (
            <IgnoredRow label="Noise suppressed" value={briefing.ignored.noise_suppressed ?? 0} />
          ) : null}
        </div>
        <p className="mt-4 text-[14px] font-medium text-white">{briefing.ignored.assurance}</p>
        {briefing.ignored.exceptions.length ? (
          <ul className="mt-3 space-y-2">
            {briefing.ignored.exceptions.map((item) => (
              <li key={item} className="text-[13px] leading-relaxed text-white/70">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </BriefingSection>

      <BriefingSection title="Reasoning">
        <ReasoningPipeline reasoning={briefing.reasoning} />
      </BriefingSection>

      <BriefingSection title="Change Detection" className="border-b-0">
        {briefing.changeDetection.changed ? (
          <div className="mt-4 space-y-3">
            <p className="text-[14px] font-semibold text-white">Investigation Changed</p>
            {briefing.changeDetection.previousPriority ? (
              <p className="text-[13px] text-white/70">
                Previous priority: {briefing.changeDetection.previousPriority}
              </p>
            ) : null}
            {briefing.changeDetection.currentPriority ? (
              <p className="text-[13px] text-white/70">
                Current priority: {briefing.changeDetection.currentPriority}
              </p>
            ) : null}
            {briefing.changeDetection.evidenceChanged ? (
              <p className="text-[13px] text-white/70">{briefing.changeDetection.evidenceChanged}</p>
            ) : null}
            {briefing.changeDetection.whyRevisit ? (
              <p className="text-[13px] text-white/80">{briefing.changeDetection.whyRevisit}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-[13px] leading-relaxed text-white/60">
            {briefing.changeDetection.headline ||
              "No prior investigation snapshot to compare on this upload."}
          </p>
        )}
      </BriefingSection>
    </div>
  );
}
