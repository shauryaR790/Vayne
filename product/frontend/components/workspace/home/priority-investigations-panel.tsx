"use client";

import { useCallback, useEffect, useState } from "react";

import { PriorityInvestigationRow } from "@/components/workspace/executive-investigation-overview";
import { getWorkbench } from "@/lib/api";
import {
  type PrioritizedInvestigation,
  type PriorityTier,
} from "@/lib/executive-investigation-overview";
import {
  RECENT_INVESTIGATIONS_UPDATED,
  loadInvestigationHistory,
} from "@/lib/recent-investigations";
import type { WorkbenchData, WorkbenchPriorityItem } from "@/lib/types";

function mapWorkbenchItem(item: WorkbenchPriorityItem): PrioritizedInvestigation {
  const reasons = item.priority_reasons?.length ? item.priority_reasons : ["Retained for analyst review."];
  return {
    id: item.id,
    tier: item.tier as PriorityTier,
    title: item.title,
    reason: item.reason || reasons[0],
    riskScore: item.risk_score,
    estimatedReviewMinutes: item.estimated_review_minutes,
    priorityReasons: reasons,
    evidenceCount: item.evidence_count,
    confidence: item.confidence,
    claimStatus: item.claim_status,
    businessImpact: item.business_impact,
    confidenceExplanation: item.confidence_explanation || `Composite confidence ${item.confidence}%.`,
    immediateAction: item.immediate_action || reasons[0],
    evidenceSources: item.evidence_sources ?? [],
    affectedAssets: item.affected_assets ?? [],
    evidenceItems: item.evidence_items ?? [],
    missingEvidence: item.missing_evidence ?? [],
    detailSectionId: item.detail_section_id,
  };
}

function investigationsFromWorkbench(workbench: WorkbenchData): PrioritizedInvestigation[] {
  const queue = workbench.investigations?.length ? workbench.investigations : workbench.priority_queue;
  return (queue ?? []).map(mapWorkbenchItem);
}

export function PriorityInvestigationsPanel({
  onOpenInvestigation,
}: {
  onOpenInvestigation: (id: string) => void;
}) {
  const [items, setItems] = useState<PrioritizedInvestigation[]>([]);
  const [investigationId, setInvestigationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const history = loadInvestigationHistory(1);
    const latest = history[0];
    if (!latest?.id) {
      setItems([]);
      setInvestigationId(null);
      return;
    }

    setLoading(true);
    try {
      const workbench = await getWorkbench(latest.id);
      const investigations = investigationsFromWorkbench(workbench);
      setInvestigationId(latest.id);
      setItems(investigations.slice(0, 6));
    } catch {
      setItems([]);
      setInvestigationId(latest.id);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
    return () => window.removeEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
  }, [refresh]);

  if (loading && !items.length) return null;
  if (!items.length) return null;

  return (
    <section className="mt-10 border-t border-vx-border pt-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/50">
            What Deserves Analyst Attention Right Now
          </h2>
          <p className="mt-1 text-[13px] text-white/55">
            Ranked investigations from clustered evidence — not individual port observations.
          </p>
        </div>
        {investigationId ? (
          <button
            type="button"
            onClick={() => onOpenInvestigation(investigationId)}
            className="shrink-0 text-[12px] font-medium text-white/70 transition-colors hover:text-white"
          >
            Open full analysis →
          </button>
        ) : null}
      </div>
      <div className="rounded-lg border border-vx-border bg-vx-panel/40 px-4">
        {items.map((item) => (
          <PriorityInvestigationRow key={item.id} item={item} compact />
        ))}
      </div>
    </section>
  );
}
