"use client";

import { MetricTile } from "@/components/shared/workspace-card";
import type {
  ExecutiveInvestigationOverview,
  PrioritizedInvestigation,
  PriorityTier,
} from "@/lib/executive-investigation-overview";
import { cn } from "@/lib/utils";

function tierStyles(tier: PriorityTier): string {
  switch (tier) {
    case "Critical":
      return "border-white/50 text-white";
    case "High":
      return "border-white/35 text-white";
    case "Medium":
      return "border-white/20 text-white/90";
    default:
      return "border-white/10 text-white/70";
  }
}

function PriorityInvestigationRow({
  item,
  onOpen,
}: {
  item: PrioritizedInvestigation;
  onOpen: (sectionId: string) => void;
}) {
  return (
    <article className="border-b border-vx-border py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span
          className={cn(
            "border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]",
            tierStyles(item.tier),
          )}
        >
          {item.tier}
        </span>
        <span className="font-mono text-[13px] font-bold text-white">Risk {item.riskScore}</span>
      </div>
      <h3 className="mt-3 text-[15px] font-semibold leading-snug text-white">{item.title}</h3>
      <p className="mt-2 text-[12px] text-white/55">
        Estimated review time: {item.estimatedReviewMinutes} minute
        {item.estimatedReviewMinutes === 1 ? "" : "s"}
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-white/80">
        <span className="font-medium text-white">Reason: </span>
        {item.reason}
      </p>
      <button
        type="button"
        onClick={() => onOpen(item.detailSectionId)}
        className="mt-4 text-[12px] font-bold uppercase tracking-wider text-white transition-colors hover:text-white/80"
      >
        Open investigation →
      </button>
    </article>
  );
}

export function ExecutiveInvestigationOverview({
  overview,
  onOpenSection,
}: {
  overview: ExecutiveInvestigationOverview;
  onOpenSection: (sectionId: string) => void;
}) {
  return (
    <section className="border-b border-vx-border bg-vx-section-body">
      <div className="border-b border-vx-border px-6 py-4">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.15em] text-white">
          Executive Investigation Overview
        </h2>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-white/60">
          What deserves your attention first — detailed engine output is available below.
        </p>
      </div>

      <div className="space-y-0 px-6 py-8">
        <div className="border-b border-vx-border pb-8">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
            Executive Summary
          </h3>
          <div className="mt-4 max-w-[72ch] space-y-3">
            {overview.executiveSummary.map((sentence, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-white">
                {sentence}
              </p>
            ))}
          </div>
        </div>

        <div className="border-b border-vx-border py-8">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
            What Needs Attention
          </h3>
          {overview.prioritizedInvestigations.length ? (
            <div className="mt-2 divide-y divide-vx-border">
              {overview.prioritizedInvestigations.map((item) => (
                <PriorityInvestigationRow key={item.id} item={item} onOpen={onOpenSection} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-white/70">
              No investigations require immediate analyst review. Expand detailed sections below if
              you need supporting evidence.
            </p>
          )}
        </div>

        <div className="border-b border-vx-border py-8">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
            Investigation Statistics
          </h3>
          <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
            {overview.statistics.map((row) => (
              <MetricTile key={row.label} label={row.label} value={row.value} flat />
            ))}
          </div>
        </div>

        {overview.keyObservations.length ? (
          <div className="border-b border-vx-border py-8">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
              Key Observations
            </h3>
            <ul className="mt-4 space-y-2.5">
              {overview.keyObservations.map((item) => (
                <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-white/85">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {overview.recommendedActions.length ? (
          <div className="py-2">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
              Recommended Next Actions
            </h3>
            <ol className="mt-4 list-none space-y-3 pl-0">
              {overview.recommendedActions.map((action, i) => (
                <li key={`${action}-${i}`} className="flex gap-3 text-[14px] leading-relaxed text-white">
                  <span className="shrink-0 font-mono text-[13px] font-bold text-white/45">{i + 1}.</span>
                  <span>{action}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}
