"use client";

import Link from "next/link";
import { Menu, Sparkles } from "lucide-react";

import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Fixed top bar for workspace routes below `lg`. */
export function MobileWorkspaceHeader({
  onOpenNav,
  showAnalyst = false,
  onOpenAnalyst,
  className,
}: {
  onOpenNav: () => void;
  showAnalyst?: boolean;
  onOpenAnalyst?: () => void;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between gap-3 border-b border-vx-border bg-vx-sidebar px-3 lg:hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenNav}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10"
        aria-label="Open navigation"
      >
        <Menu className="size-5" strokeWidth={1.75} aria-hidden />
      </button>

      <Link
        href="/"
        className="truncate text-[13px] font-bold uppercase tracking-[0.18em] text-white"
      >
        {PRODUCT_NAME}
      </Link>

      {showAnalyst && onOpenAnalyst ? (
        <button
          type="button"
          onClick={onOpenAnalyst}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/10"
          aria-label="Open Ask VAYNE"
        >
          <Sparkles className="size-3.5 shrink-0" aria-hidden />
          Ask
        </button>
      ) : (
        <span className="size-9 shrink-0" aria-hidden />
      )}
    </header>
  );
}
