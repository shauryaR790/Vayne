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
import { cn } from "@/lib/utils";

function RecentRow({
  item,
  onOpen,
}: {
  item: RecentInvestigation;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className={cn(
        "group flex w-full items-baseline justify-between gap-4 py-2 text-left",
        "transition-colors duration-150",
      )}
    >
      <span className="truncate text-[15px] text-white/55 transition-colors group-hover:text-white/90">
        {item.title || "Security Investigation"}
      </span>
      <span className="shrink-0 text-[12px] text-white/25 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {formatInvestigationTimestamp(item.updatedAt || item.createdAt)}
      </span>
    </button>
  );
}

export function RecentInvestigationList({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<RecentInvestigation[]>([]);

  const refresh = useCallback(async () => {
    const synced = await syncRecentInvestigationsFromApi(HOME_RECENTS_MAX);
    setItems(synced.slice(0, HOME_RECENTS_MAX));
  }, []);

  useEffect(() => {
    setItems(loadRecentInvestigations(HOME_RECENTS_MAX));
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
    return () => window.removeEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
  }, [refresh]);

  if (!items.length) return null;

  return (
    <div>
      <p className="mb-3 text-[12px] text-white/30">Recent Investigations</p>
      <div className="flex flex-col">
        {items.map((item) => (
          <RecentRow key={item.id} item={item} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

/** @deprecated Use RecentInvestigationList */
export const RecentInvestigationCards = RecentInvestigationList;
