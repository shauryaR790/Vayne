"use client";

import { cn } from "@/lib/utils";

/** Shared surface styles for investigation workbench cards and tiles. */
export const workbenchSurfaceClasses =
  "border border-vx-border bg-vx-inset transition-colors hover:border-vx-border-strong";

export function WorkspaceCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  /** @deprecated Workbench cards no longer lift */
  lift?: boolean;
}) {
  return <div className={cn(workbenchSurfaceClasses, className)}>{children}</div>;
}

export function MetricTile({
  label,
  value,
  sub,
  large,
  flat,
}: {
  label: string;
  value: string | number;
  sub?: string;
  large?: boolean;
  flat?: boolean;
}) {
  const display =
    typeof value === "string" ? value.toUpperCase() : value.toLocaleString();

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col",
        !flat && workbenchSurfaceClasses,
        flat ? "py-1" : "p-4",
      )}
    >
      <p
        className={cn(
          "min-h-[2.75rem] font-bold uppercase leading-snug tracking-[0.12em] text-white/55",
          large ? "text-[12px]" : "text-[11px]",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-black tabular-nums uppercase leading-none tracking-tight text-white",
          large ? "text-[2.125rem]" : "text-2xl",
        )}
      >
        {display}
      </p>
      {sub ? (
        <p
          className={cn(
            "mt-2.5 min-h-[1.25rem] normal-case leading-snug text-white/50",
            large ? "text-[13px]" : "text-[12px]",
          )}
        >
          {sub}
        </p>
      ) : (
        <div className="mt-2.5 min-h-[1.25rem]" aria-hidden />
      )}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">{children}</p>
  );
}

export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8 border-b border-vx-border pb-6">
      <h1 className="vx-page-title">{title}</h1>
      {subtitle ? (
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-vx-muted">{subtitle}</p>
      ) : null}
    </div>
  );
}
