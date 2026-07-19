"use client";

import {
  formatHistoryLabel,
  formatInvestigationTimestamp,
  type RecentInvestigation,
} from "@/lib/recent-investigations";
import { cn } from "@/lib/utils";

export function InvestigationHistoryRow({
  item,
  allItems,
  active,
  onSelect,
  showTime = "always",
}: {
  item: RecentInvestigation;
  allItems: RecentInvestigation[];
  active?: boolean;
  onSelect: (id: string) => void;
  showTime?: "always" | "hover";
}) {
  const when = formatInvestigationTimestamp(item.updatedAt || item.createdAt);
  const title = formatHistoryLabel(item, allItems);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      title={title}
      className={cn(
        "group flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors",
        active ? "bg-vx-elevated text-white" : "text-white hover:bg-vx-panel hover:text-white",
      )}
    >
      <span className="min-w-0 truncate text-[15px]">{title}</span>
      {when ? (
        <span
          className={cn(
            "shrink-0 text-[12px] tabular-nums text-white",
            showTime === "hover" && "opacity-0 transition-opacity group-hover:opacity-100",
          )}
        >
          {when}
        </span>
      ) : null}
    </button>
  );
}

export function InvestigationHistoryList({
  items,
  activeId,
  onSelect,
  showTime = "always",
  emptyLabel = "No investigations yet",
}: {
  items: RecentInvestigation[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  showTime?: "always" | "hover";
  emptyLabel?: string;
}) {
  if (!items.length) {
    return <p className="px-3 py-2 text-[14px] text-white">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <InvestigationHistoryRow
          key={item.id}
          item={item}
          allItems={items}
          active={activeId === item.id}
          onSelect={onSelect}
          showTime={showTime}
        />
      ))}
    </div>
  );
}

/** @deprecated Use InvestigationHistoryList */
export const InvestigationHistoryGroups = InvestigationHistoryList;
