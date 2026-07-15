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
}: {
  label: string;
  value: string | number;
  sub?: string;
  large?: boolean;
}) {
  return (
    <div className={cn(workbenchSurfaceClasses, "p-4")}>
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-vx-muted">{label}</p>
      <p
        className={cn(
          "mt-2 font-black uppercase leading-none text-vx-text",
          large ? "text-4xl" : "text-2xl",
        )}
      >
        {typeof value === "string" ? value.toUpperCase() : value}
      </p>
      {sub ? <p className="mt-1.5 text-[12px] font-bold uppercase text-vx-secondary">{sub}</p> : null}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-vx-muted">{children}</p>
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
