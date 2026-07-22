"use client";

import { useCallback, useEffect, useState } from "react";

import { InvestigationSummaryPanel } from "@/components/workspace/home/investigation-summary-panel";
import { PriorityInvestigationRow } from "@/components/workspace/executive-investigation-overview";
import { getWorkbench } from "@/lib/api";
import {
  buildPrioritizedInvestigations,
  type PrioritizedInvestigation,
} from "@/lib/executive-investigation-overview";
import {
  RECENT_INVESTIGATIONS_UPDATED,
  loadInvestigationHistory,
} from "@/lib/recent-investigations";
import type { WorkbenchSummaryPanel } from "@/lib/types";

const INTERNAL_INVESTIGATION_TITLE =
  /false fingerprint|not applicable|not exploitable|missing preconditions|validate hypothesis in controlled/i;

function isHomepageInvestigation(item: PrioritizedInvestigation): boolean {
  if (INTERNAL_INVESTIGATION_TITLE.test(item.title)) return false;
  if (item.tier === "Critical" || item.tier === "High") return true;
  if (item.tier === "Medium" && item.evidenceCount > 0 && item.confidence >= 50) return true;
  return false;
}

function homeInvestigations(workbench: Parameters<typeof buildPrioritizedInvestigations>[0]): PrioritizedInvestigation[] {
  const all = buildPrioritizedInvestigations(workbench);
  return all.filter(isHomepageInvestigation).slice(0, 4);
}

export function PriorityInvestigationsPanel({
  onOpenInvestigation,
}: {
  onOpenInvestigation: (id: string) => void;
}) {
  const [items, setItems] = useState<PrioritizedInvestigation[]>([]);
  const [summary, setSummary] = useState<WorkbenchSummaryPanel | null>(null);
  const [investigationId, setInvestigationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const history = loadInvestigationHistory(1);
    if (!history.length) {
      setItems([]);
      setSummary(null);
      setInvestigationId(null);
      return;
    }

    const latest = history[0];
    if (!latest?.id) {
      setItems([]);
      setSummary(null);
      setInvestigationId(null);
      return;
    }

    setLoading(true);
    try {
      const workbench = await getWorkbench(latest.id);
      setInvestigationId(latest.id);
      setSummary(workbench.summary_panel ?? null);
      setItems(homeInvestigations(workbench));
    } catch {
      setItems([]);
      setSummary(null);
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
      {summary && summary.investigations_generated > 0 ? (
        <div className="mb-6">
          <InvestigationSummaryPanel summary={summary} />
        </div>
      ) : null}
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/50">
            What Deserves Analyst Attention Right Now
          </h2>
          <p className="mt-1 text-[13px] text-white/55">
            Top Critical and High investigations from your latest run.
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
