"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";

import { workbenchSurfaceClasses } from "@/components/shared/workspace-card";
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
  embedded = false,
}: {
  title: string;
  children: React.ReactNode;
  bodyClassName?: string;
  aside?: React.ReactNode;
  reveal?: number;
  large?: boolean;
  embedded?: boolean;
}) {
  if (embedded) {
    return (
      <div
        className={cn(
          "min-w-0 bg-vx-section-body text-white",
          large ? "px-6 py-8" : "px-6 py-6",
          bodyClassName,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reveal, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-vx-border"
    >
      <div className="flex items-center justify-between gap-3 border-b border-vx-border bg-vx-section-body px-6 py-4">
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
      <div
        className={cn(
          "min-w-0 bg-vx-section-body px-6 text-white",
          large ? "py-8" : "py-6",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </motion.section>
  );
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  forceOpen,
  open: controlledOpen,
  onOpenChange,
  sectionId,
  aside,
  reveal = 0,
  bodyClassName,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  sectionId?: string;
  aside?: React.ReactNode;
  reveal?: number;
  bodyClassName?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = forceOpen === true ? true : isControlled ? Boolean(controlledOpen) : uncontrolledOpen;

  useEffect(() => {
    if (forceOpen !== undefined) setUncontrolledOpen(forceOpen);
  }, [forceOpen]);

  const setOpenState = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      id={sectionId ? `investigation-detail-${sectionId}` : undefined}
      className="border-b border-vx-border"
      style={reveal > 0 ? { animationDelay: `${reveal}s` } : undefined}
    >
      {forceOpen ? (
        <div className="flex w-full items-center justify-between gap-3 border-b border-vx-border bg-vx-section-body px-6 py-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white">
            {title}
          </span>
          {aside ? <span className="flex shrink-0 items-center gap-2">{aside}</span> : null}
        </div>
      ) : (
        <div className="flex w-full items-center gap-3 border-b border-vx-border bg-vx-section-body px-6 py-4">
          <button
            type="button"
            onClick={() => setOpenState(!isOpen)}
            aria-expanded={isOpen}
            className="flex min-w-0 flex-1 items-center text-left transition-colors hover:text-white"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white">
              {title}
            </span>
          </button>
          {aside ? (
            <span
              className="flex shrink-0 items-center gap-2"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {aside}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setOpenState(!isOpen)}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
            className="flex shrink-0 items-center justify-center text-white transition-colors hover:text-white/80"
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </button>
        </div>
      )}
      {isOpen ? (
        <div className={cn("bg-vx-section-body text-white", bodyClassName ?? "px-0 py-0")}>
          {children}
        </div>
      ) : null}
    </section>
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
      className="mt-3 flex items-center gap-2 text-[12px] font-medium text-white transition-colors hover:text-white"
    >
      <ChevronDown
        className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
      />
      {label}
      {count != null ? <span className="text-white">({count})</span> : null}
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
    <div className={cn(workbenchSurfaceClasses, "min-w-0 overflow-hidden px-4 py-3.5")}>
      <p className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-white">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-semibold text-white",
          highlight ? "text-[18px]" : "text-[15px]",
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
