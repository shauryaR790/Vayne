"use client";

import { useCallback, useEffect, useState } from "react";

import { InvestigationHistoryList } from "@/components/workspace/investigation-history-rows";
import {
  HISTORY_MAX,
  RECENT_INVESTIGATIONS_UPDATED,
  loadInvestigationHistory,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";

export function RecentInvestigationList({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<RecentInvestigation[]>([]);

  const refresh = useCallback(async () => {
    const synced = await syncRecentInvestigationsFromApi(HISTORY_MAX);
    setItems(synced);
  }, []);

  useEffect(() => {
    setItems(loadInvestigationHistory(HISTORY_MAX));
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
    return () => window.removeEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
  }, [refresh]);

  if (!items.length) return null;

  return (
    <div className="vx-no-scrollbar max-h-[min(320px,40vh)] overflow-y-auto">
      <InvestigationHistoryList items={items} onSelect={onOpen} showTime="always" />
    </div>
  );
}

/** @deprecated Use RecentInvestigationList */
export const RecentInvestigationCards = RecentInvestigationList;
