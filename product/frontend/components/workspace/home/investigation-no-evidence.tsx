"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, MessageSquare, Plus } from "lucide-react";
import { motion } from "motion/react";

import { VaneSidebarBrand } from "@/components/brand/vane-logo";
import {
  HOME_RECENTS_MAX,
  RECENT_INVESTIGATIONS_UPDATED,
  formatInvestigationTimestamp,
  loadRecentInvestigations,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";
import { cn } from "@/lib/utils";

function formatRecentMeta(item: RecentInvestigation): string {
  const file = item.sourceFile?.trim();
  if (!file) {
    return formatInvestigationTimestamp(item.updatedAt || item.createdAt);
  }

  const parts = file
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    const first = parts[0].split(/[/\\]/).pop() || parts[0];
    return `${first} +${parts.length - 1}`;
  }

  const single = parts[0] ?? file;
  return single.split(/[/\\]/).pop() || single;
}

function ActionCard({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FolderOpen;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex h-[88px] flex-col justify-between rounded-xl border border-white/[0.08]",
        "bg-white/[0.03] p-4 text-left transition-colors duration-150",
        "hover:border-white/[0.14] hover:bg-white/[0.05]",
      )}
    >
      <Icon
        className="size-[18px] text-white/45 transition-colors group-hover:text-white/70"
        strokeWidth={1.5}
        aria-hidden
      />
      <span className="text-[13px] text-white/65 transition-colors group-hover:text-white/90">
        {label}
      </span>
    </button>
  );
}

function RecentInvestigationsBlock({ onOpen }: { onOpen: (id: string) => void }) {
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
    <div className="mt-10 w-full min-w-0 overflow-hidden">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-4">
        <span className="shrink-0 text-[13px] text-white/45">Recent investigations</span>
        {items.length >= HOME_RECENTS_MAX ? (
          <span className="shrink-0 text-[13px] text-white/35">View all ({items.length})</span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            className="group flex w-full min-w-0 items-center gap-4 py-2 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-white/70 transition-colors group-hover:text-white">
              {item.title || item.name || "Security Investigation"}
            </span>
            <span
              className="min-w-0 max-w-[45%] shrink truncate text-right text-[13px] text-white/35"
              title={item.sourceFile || undefined}
            >
              {formatRecentMeta(item)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function InvestigationNoEvidence({
  onUpload,
  onFocusAnalyst,
  onNewInvestigation,
  onOpenInvestigation,
}: {
  onUpload: () => void;
  onFocusAnalyst: () => void;
  onNewInvestigation: () => void;
  onOpenInvestigation: (id: string) => void;
}) {
  return (
    <div className="flex min-h-full w-full flex-1 items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[560px] min-w-0 overflow-hidden"
      >
        <div className="flex flex-col items-center text-center">
          <VaneSidebarBrand className="mx-auto h-[112px] w-full max-w-[400px] object-contain object-center sm:h-[128px] sm:max-w-[460px]" />
        </div>

        <div className="mt-10 grid grid-cols-3 gap-3">
          <ActionCard icon={FolderOpen} label="Upload evidence" onClick={onUpload} />
          <ActionCard icon={MessageSquare} label="Ask analyst" onClick={onFocusAnalyst} />
          <ActionCard icon={Plus} label="New investigation" onClick={onNewInvestigation} />
        </div>

        <RecentInvestigationsBlock onOpen={onOpenInvestigation} />
      </motion.div>
    </div>
  );
}
