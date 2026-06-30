"use client";

import { useCallback, useEffect, useState } from "react";

import {
  HOME_RECENTS_MAX,
  RECENT_INVESTIGATIONS_UPDATED,
  formatInvestigationTimestamp,
  loadRecentInvestigations,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";
import type { RiskLevel } from "@/lib/investigation-metadata";
import { cn } from "@/lib/utils";

const HOME_MAX = HOME_RECENTS_MAX;

function riskStyles(risk: RiskLevel) {
  switch (risk) {
    case "CRITICAL":
      return "text-rose-300/90";
    case "HIGH":
      return "text-orange-300/85";
    case "MEDIUM":
      return "text-amber-300/80";
    case "LOW":
      return "text-emerald-300/70";
    default:
      return "text-white/45";
  }
}

function InvestigationCard({
  item,
  onSelect,
}: {
  item: RecentInvestigation;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={cn(
        "group w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3.5 text-left",
        "transition-all hover:border-white/16 hover:bg-white/[0.05]",
      )}
    >
      <p className="line-clamp-1 text-[14px] font-medium text-white/88 group-hover:text-white">
        {item.title || "Security Investigation"}
      </p>
      <p className="mt-1 line-clamp-1 text-[13px] text-white/40 group-hover:text-white/52">
        {item.summary || "Attack surface under review"}
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-[0.12em]",
            riskStyles(item.risk || "LOW"),
          )}
        >
          {(item.risk || "LOW")} risk
        </span>
        <span className="text-[11px] text-white/28">
          {formatInvestigationTimestamp(item.createdAt)}
        </span>
      </div>
    </button>
  );
}

export function PreviousInvestigations({
  onSelect,
  className,
}: {
  onSelect: (id: string) => void;
  className?: string;
}) {
  const [items, setItems] = useState<RecentInvestigation[]>([]);

  const refresh = useCallback(async () => {
    const synced = await syncRecentInvestigationsFromApi();
    setItems(synced.slice(0, HOME_MAX));
  }, []);

  useEffect(() => {
    setItems(loadRecentInvestigations().slice(0, HOME_MAX));
    void refresh();

    const onUpdate = () => {
      void refresh();
    };
    window.addEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
    window.addEventListener("focus", onUpdate);

    return () => {
      window.removeEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
      window.removeEventListener("focus", onUpdate);
    };
  }, [refresh]);

  if (!items.length) return null;

  return (
    <div className={cn("w-full", className)}>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-white/32">
        Recent investigations
      </p>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <InvestigationCard key={item.id} item={item} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
