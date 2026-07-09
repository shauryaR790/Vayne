"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export function createReveal(step = 0.06, max = 1.2) {
  let i = 0;
  return () => {
    const delay = Math.min(i * step, max);
    i += 1;
    return delay;
  };
}

export function WorkstationSection({
  title,
  children,
  bodyClassName,
  aside,
  reveal = 0,
  large = false,
}: {
  title: string;
  children: React.ReactNode;
  bodyClassName?: string;
  aside?: React.ReactNode;
  reveal?: number;
  large?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reveal, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-white/20"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/20 bg-black px-6 py-4">
        <h2
          className={cn(
            "font-bold uppercase tracking-[0.15em] text-white",
            large ? "text-[12px]" : "text-[11px]",
          )}
        >
          {title}
        </h2>
        {aside}
      </div>
      <div className={cn("min-w-0 bg-vx-app px-6", large ? "py-8" : "py-6", bodyClassName)}>{children}</div>
    </motion.section>
  );
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  aside,
  reveal = 0,
  bodyClassName,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  aside?: React.ReactNode;
  reveal?: number;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: reveal, ease: "easeOut" }}
      className="border-b border-white/20"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-white/20 bg-black px-6 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">
          {title}
        </span>
        <span className="flex items-center gap-2">
          {aside}
          <ChevronDown
            className={cn(
              "size-4 text-vx-muted transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className={cn("bg-vx-app px-6 py-6", bodyClassName)}>{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

export function ExpandToggle({
  open,
  onClick,
  label,
  count,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex items-center gap-2 text-[12px] font-medium text-vx-secondary transition-colors hover:text-white"
    >
      <ChevronDown
        className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
      />
      {label}
      {count != null ? <span className="text-vx-muted">({count})</span> : null}
    </button>
  );
}

export function HeaderMetric({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  highlight?: boolean;
}) {
  const display = String(value);
  return (
    <div className="min-w-0 overflow-hidden border border-vx-border bg-vx-panel px-4 py-3.5">
      <p className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-vx-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-semibold",
          highlight ? "text-[18px] text-white" : "text-[15px] text-vx-body",
          mono && "font-mono text-[13px]",
        )}
        title={display}
      >
        {value}
      </p>
    </div>
  );
}

export function shortStep(raw: string): string {
  let t = (raw || "").trim();
  t = t.split("@")[0];
  if (t.includes("/")) {
    const parts = t.split("/").filter(Boolean);
    t = parts[parts.length - 1] || t;
  }
  if (t.length > 22) t = `${t.slice(0, 22)}…`;
  return t;
}
