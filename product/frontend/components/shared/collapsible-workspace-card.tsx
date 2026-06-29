"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { WorkspaceCard } from "@/components/shared/workspace-card";

export function CollapsibleWorkspaceCard({
  title,
  subtitle,
  trailing,
  expandLabel = "View details",
  children,
  className,
  defaultOpen = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  expandLabel?: string;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <WorkspaceCard className={cn("p-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">{title}</div>
          {subtitle && <div className="mt-2">{subtitle}</div>}
        </div>
        {trailing}
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Collapse" : expandLabel}
        className="group/bar flex w-full flex-col border-t border-white/15"
      >
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="h-px flex-1 bg-white/15" />
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
            {open ? "Collapse" : expandLabel}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-300",
                open && "rotate-180",
              )}
            />
          </span>
          <div className="h-px flex-1 bg-white/15" />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/15">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </WorkspaceCard>
  );
}
