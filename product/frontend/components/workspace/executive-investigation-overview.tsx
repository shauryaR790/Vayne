"use client";

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
  compact,
}: {
  item: PrioritizedInvestigation;
  onOpen?: (sectionId: string) => void;
  compact?: boolean;
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
          {item.rank ? `#${item.rank} · ${item.tier}` : item.tier}
        </span>
        <span className="font-mono text-[13px] font-bold text-white">Risk {item.riskScore}</span>
      </div>
      <h3 className="mt-3 text-[15px] font-semibold leading-snug text-white">{item.title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-white/75">{item.reason}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50">
        {item.evidenceSources.length ? (
          <span>Sources: {item.evidenceSources.join(", ")}</span>
        ) : (
          <span>Evidence signals: {item.evidenceCount}</span>
        )}
        <span>Confidence: {item.confidence}%</span>
        {!compact ? <span>Review: ~{item.estimatedReviewMinutes} min</span> : null}
      </div>
      {compact && item.immediateAction ? (
        <p className="mt-2 text-[12px] text-white/65">
          <span className="font-medium text-white/80">Next: </span>
          {item.immediateAction}
        </p>
      ) : null}
      {compact && item.priorityReasons.length ? (
        <ul className="mt-2 space-y-1">
          {item.priorityReasons.slice(0, 3).map((reason) => (
            <li key={reason} className="flex gap-2 text-[11px] leading-relaxed text-white/55">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-white/35" aria-hidden />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {item.affectedAssets.length ? (
        <p className="mt-2 text-[12px] text-white/60">
          <span className="font-medium text-white/75">Affected assets: </span>
          {item.affectedAssets.slice(0, compact ? 2 : 8).join(", ")}
          {compact && item.affectedAssets.length > 2 ? "…" : ""}
        </p>
      ) : null}
      {!compact && item.businessImpact ? (
        <p className="mt-3 text-[12px] leading-relaxed text-white/65">
          <span className="font-medium text-white/80">Business impact: </span>
          {item.businessImpact}
        </p>
      ) : null}
      {!compact ? (
        <p className="mt-3 text-[12px] leading-relaxed text-white/60">
          <span className="font-medium text-white/75">Confidence: </span>
          {item.confidenceExplanation}
        </p>
      ) : null}
      {!compact ? (
        <div className="mt-3">
          <p className="text-[12px] font-medium text-white">{item.tier} because:</p>
          <ul className="mt-2 space-y-1.5">
            {item.priorityReasons.map((reason) => (
              <li key={reason} className="flex gap-2 text-[12px] leading-relaxed text-white/75">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-white/45" aria-hidden />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!compact ? (
        <p className="mt-3 text-[12px] leading-relaxed text-white/85">
          <span className="font-medium text-white">Immediate action: </span>
          {item.immediateAction}
        </p>
      ) : null}
      {!compact && item.missingEvidence.length ? (
        <p className="mt-2 text-[11px] text-white/45">
          Missing evidence: {item.missingEvidence.join("; ")}
        </p>
      ) : null}
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(item.detailSectionId)}
          className="mt-4 text-[12px] font-bold uppercase tracking-wider text-white transition-colors hover:text-white/80"
        >
          Open investigation →
        </button>
      ) : null}
    </article>
  );
}

export { PriorityInvestigationRow };

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
            What Deserves Analyst Attention Right Now
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
