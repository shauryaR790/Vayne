"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, FolderOpen, MessageSquare, Plus } from "lucide-react";
import { motion } from "motion/react";

import {
  HISTORY_MAX,
  RECENT_INVESTIGATIONS_UPDATED,
  formatInvestigationTimestamp,
  loadInvestigationHistory,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";
import { SessionAnalyzingBar } from "@/components/workspace/home/session-analyzing-bar";
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
  href,
}: {
  icon: typeof FolderOpen;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className = cn(
    "group flex h-[88px] flex-col justify-between rounded-xl border border-white/[0.08]",
    "bg-white/[0.03] p-4 text-left transition-colors duration-150",
    "hover:border-white/[0.14] hover:bg-white/[0.05]",
  );
  const body = (
    <>
      <Icon
        className="size-[18px] text-white/45 transition-colors group-hover:text-white/70"
        strokeWidth={1.5}
        aria-hidden
      />
      <span className="text-[13px] text-white/65 transition-colors group-hover:text-white/90">
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function RecentInvestigationsBlock({ onOpen }: { onOpen: (id: string) => void }) {
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
    <div className="mt-10 w-full min-w-0 overflow-hidden">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-4">
        <span className="shrink-0 text-[13px] text-white/45">
          Recent investigations
          <span className="ml-2 text-white/25">({items.length})</span>
        </span>
      </div>
      <div className="vx-no-scrollbar max-h-[min(280px,36vh)] overflow-y-auto">
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
    </div>
  );
}

export function InvestigationNoEvidence({
  onUpload,
  onFocusAnalyst,
  onNewInvestigation,
  onOpenInvestigation,
  busy,
  analyzingLabel,
}: {
  onUpload: () => void;
  onFocusAnalyst: () => void;
  onNewInvestigation: () => void;
  onOpenInvestigation: (id: string) => void;
  busy?: boolean;
  analyzingLabel?: string;
}) {
  return (
    <>
      <div className="flex min-h-full w-full flex-1 items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          className="w-full max-w-[440px] min-w-0 overflow-hidden"
        >
          <div className="mx-auto grid max-w-[360px] grid-cols-2 gap-3">
            <ActionCard icon={FolderOpen} label="Upload evidence" onClick={onUpload} />
            <ActionCard icon={MessageSquare} label="Ask analyst" onClick={onFocusAnalyst} />
            <ActionCard icon={Plus} label="New investigation" onClick={onNewInvestigation} />
            <ActionCard icon={BookOpen} label="Tutorial" href="/tutorial" />
          </div>

          <RecentInvestigationsBlock onOpen={onOpenInvestigation} />
        </motion.div>
      </div>
      {busy ? <SessionAnalyzingBar label={analyzingLabel} /> : null}
    </>
  );
}
