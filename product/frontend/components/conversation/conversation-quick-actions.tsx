"use client";

import { cn } from "@/lib/utils";

const ACTIONS = [
  { id: "analyze", label: "Analyze Scan" },
  { id: "paths", label: "Find Attack Paths" },
  { id: "report", label: "Executive Report" },
] as const;

export type QuickActionId = (typeof ACTIONS)[number]["id"];

export function ConversationQuickActions({
  onAction,
  disabled,
  className,
}: {
  onAction: (id: QuickActionId) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2.5 sm:gap-3",
        className,
      )}
    >
      {ACTIONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => onAction(id)}
          className={cn(
            "rounded-full border border-white/[0.12] bg-white/[0.03] px-4 py-2",
            "text-[13px] font-medium text-white/72 transition-all",
            "hover:border-white/22 hover:bg-white/[0.07] hover:text-white/92",
            "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
