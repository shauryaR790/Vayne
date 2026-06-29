"use client";

import { HoverCard } from "@/components/shared/hover-card";
import { cn } from "@/lib/utils";

export function WorkspaceCard({
  children,
  className,
  lift = true,
}: {
  children: React.ReactNode;
  className?: string;
  lift?: boolean;
}) {
  return (
    <HoverCard className={cn("bg-surface", className)} lift={lift}>
      {children}
    </HoverCard>
  );
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
    <HoverCard className="bg-black p-4" lift>
      <p className="relative text-[12px] font-bold uppercase tracking-[0.14em] text-white/45 transition-colors duration-300 group-hover:text-white/60">
        {label}
      </p>
      <p
        className={cn(
          "relative mt-2 font-black uppercase leading-none transition-colors duration-300 group-hover:text-white",
          large ? "text-4xl" : "text-2xl",
        )}
      >
        {typeof value === "string" ? value.toUpperCase() : value}
      </p>
      {sub && (
        <p className="relative mt-1.5 text-[12px] font-bold uppercase text-white/55 transition-colors duration-300 group-hover:text-white/70">
          {sub}
        </p>
      )}
    </HoverCard>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/45">
      {children}
    </p>
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
    <div className="mb-8 border-b border-white pb-6">
      <h1 className="vx-page-title">{title}</h1>
      {subtitle && (
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
          {subtitle}
        </p>
      )}
    </div>
  );
}
