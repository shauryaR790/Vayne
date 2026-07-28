"use client";

import { AsciiPageTitle } from "@/components/brand/vayne-ascii-title";
import { useReportChrome } from "@/components/workspace/report-chrome-context";
import {
  buildInvestigationConsoleModel,
  type EvidenceTimelineStep,
  type InvestigationSummaryCard,
  type ReasoningChainStep,
} from "@/lib/investigation-briefing";
import type { WorkbenchData } from "@/lib/types";
import { cn } from "@/lib/utils";

function ConsoleSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-vx-border px-4 py-8 sm:px-6", className)}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-white/[0.06] py-1.5">
      <span className="text-white/45">{label}</span>
      <span className="tabular-nums text-white/85">{value}</span>
    </div>
  );
}

function InvestigationSummary({
  summary,
}: {
  summary: InvestigationSummaryCard;
}) {
  const { onViewEngine } = useReportChrome();

  return (
    <section className="border-b border-vx-border px-4 py-4 sm:px-6">
      <div className="shrink-0">
        <AsciiPageTitle text={summary.title} stackWords />
      </div>

      <div className="mt-6 max-w-[520px] font-mono text-[11px] leading-[1.35] text-white/80 sm:text-[12px]">
        <SummaryField label="Host" value={summary.host} />
        <SummaryField label="Status" value={summary.status} />
        <SummaryField
          label="Confidence"
          value={summary.confidence != null ? `${summary.confidence}%` : "—"}
        />
        <SummaryField label="Business Risk" value={summary.businessRisk} />
        <SummaryField label="Estimated Review" value={summary.estimatedReview} />

        {onViewEngine ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={onViewEngine}
              className="border border-white/20 px-4 py-2.5 text-[12px] uppercase tracking-[0.14em] text-white/80 transition-colors hover:border-white/40 hover:text-white"
            >
              View Engine
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-8 max-w-[64ch] pb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">
          Recommended Action
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-white/90">{summary.recommendedAction}</p>
      </div>
    </section>
  );
}

function EvidenceTimeline({ steps }: { steps: EvidenceTimelineStep[] }) {
  return (
    <ol className="max-w-[64ch] space-y-0">
      {steps.map((step, index) => (
        <li key={`${step.actor}-${index}`} className="relative">
          <div className="flex gap-4">
            <div className="flex w-6 shrink-0 flex-col items-center">
              <span className="font-mono text-[12px] text-white/40">{index + 1}.</span>
              {index < steps.length - 1 ? (
                <span className="mt-2 flex-1 text-[12px] leading-none text-white/25" aria-hidden>
                  ↓
                </span>
              ) : null}
            </div>
            <div className={cn("min-w-0 flex-1", index < steps.length - 1 ? "pb-6" : "pb-0")}>
              <p className="text-[13px] font-semibold text-white">{step.actor}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-white/80">{step.detail}</p>
              {step.note ? (
                <p className="mt-1 text-[12px] text-white/45">{step.note}</p>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ReasoningPipeline({ reasoning }: { reasoning: ReasoningChainStep[] }) {
  if (!reasoning.length) return null;
  return (
    <div className="mt-1 space-y-0">
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

export function InvestigationBriefing({
  workbench,
  uploadedFileCount,
}: {
  workbench: WorkbenchData;
  uploadedFileCount?: number;
  onOpenSection?: (sectionId: string) => void;
  onViewEngine?: () => void;
}) {
  void uploadedFileCount;
  const model = buildInvestigationConsoleModel(workbench);

  if (!model.summary) {
    return (
      <div className="border-b border-vx-border bg-[#141414] px-4 py-10 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
          Investigation Summary
        </p>
        <p className="mt-4 max-w-[64ch] text-[16px] leading-relaxed text-white/85">
          {model.emptyHeadline}
        </p>
        {model.emptyDetail ? (
          <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-white/50">
            {model.emptyDetail}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-b border-vx-border bg-[#141414]">
      <InvestigationSummary summary={model.summary} />

      <ConsoleSection title="Why This Investigation Exists">
        <div className="max-w-[64ch] space-y-4">
          {model.whyExists.map((paragraph) => (
            <p key={paragraph} className="text-[14px] leading-relaxed text-white/80">
              {paragraph}
            </p>
          ))}
        </div>
      </ConsoleSection>

      <ConsoleSection title="Evidence Timeline">
        <EvidenceTimeline steps={model.evidenceTimeline} />
      </ConsoleSection>

      <ConsoleSection title="Reasoning">
        <ReasoningPipeline reasoning={model.reasoningGraph} />
      </ConsoleSection>

      <ConsoleSection title="What Would Change This Decision">
        <p className="max-w-[64ch] text-[14px] leading-relaxed text-white/70">
          This investigation would become higher priority if:
        </p>
        <ul className="mt-4 max-w-[64ch] space-y-2.5">
          {model.decisionChangers.map((line) => (
            <li key={line} className="flex gap-3 text-[14px] leading-relaxed text-white/80">
              <span className="shrink-0 text-white/40" aria-hidden>
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </ConsoleSection>

      <ConsoleSection title="Analyst Checklist" className="border-b-0">
        <ul className="max-w-[64ch] space-y-3">
          {model.checklist.map((item) => (
            <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-white/85">
              <span className="mt-0.5 shrink-0 font-mono text-white/40" aria-hidden>
                □
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </ConsoleSection>
    </div>
  );
}
