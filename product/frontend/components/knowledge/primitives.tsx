"use client";

import { HoverCard } from "@/components/shared/hover-card";
import { cn } from "@/lib/utils";

export function KnowledgeSection({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 border-t border-white/15 py-12 first:border-t-0 first:pt-0", className)}
    >
      <h2 className="text-[13px] font-black uppercase tracking-[0.18em] text-white">{title}</h2>
      <div className="mt-6 space-y-5 text-[14px] leading-relaxed text-white/70">{children}</div>
    </section>
  );
}

export function KnowledgeLead({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-white/85">{children}</p>;
}

export function TerminalBlock({ children }: { children: string }) {
  return (
    <HoverCard lift={false} className="overflow-x-auto px-5 py-4 font-mono text-[12px] leading-relaxed text-white/80">
      <pre className="relative whitespace-pre-wrap">{children}</pre>
    </HoverCard>
  );
}

export function FlowDiagram({ lines }: { lines: string[] }) {
  return (
    <HoverCard lift={false} className="px-5 py-4 font-mono text-[12px] leading-loose text-white/75">
      {lines.map((line, i) => (
        <div key={i} className={cn("relative", line.trim() === "↓" ? "text-white/30" : "")}>
          {line}
        </div>
      ))}
    </HoverCard>
  );
}

export function CompareBlock({
  left,
  right,
}: {
  left: { label: string; body: string };
  right: { label: string; body: string };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[left, right].map((side) => (
        <HoverCard key={side.label} lift className="px-4 py-4">
          <p className="relative text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
            {side.label}
          </p>
          <p className="relative mt-2 font-mono text-[13px] text-white/80">{side.body}</p>
        </HoverCard>
      ))}
    </div>
  );
}

export function BulletGrid({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item}>
          <HoverCard lift className="px-3 py-2 text-[12px] font-medium uppercase tracking-wide text-white/65">
            {item}
          </HoverCard>
        </li>
      ))}
    </ul>
  );
}

export function PromptList({ prompts }: { prompts: string[] }) {
  return (
    <div className="space-y-2">
      {prompts.map((p) => (
        <HoverCard key={p} lift={false} className="px-4 py-2.5 font-mono text-[12px] text-white/75">
          &gt; {p}
        </HoverCard>
      ))}
    </div>
  );
}

export function ImpactTier({
  tiers,
}: {
  tiers: Array<{ level: string; example: string }>;
}) {
  return (
    <div className="space-y-3">
      {tiers.map((t) => (
        <HoverCard key={t.level} lift={false} className="grid gap-3 p-0 sm:grid-cols-[140px_1fr]">
          <div className="border-b border-white/10 px-4 py-3 sm:border-b-0 sm:border-r sm:border-white/10">
            <p className="relative text-[11px] font-black uppercase tracking-wider text-white">{t.level}</p>
          </div>
          <p className="relative px-4 py-3 font-mono text-[12px] text-white/70">{t.example}</p>
        </HoverCard>
      ))}
    </div>
  );
}

export function ConfidenceScale({
  levels,
}: {
  levels: Array<{ pct: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      {levels.map((l) => (
        <HoverCard
          key={l.pct}
          lift={false}
          className="flex items-center gap-4 px-4 py-3"
        >
          <span className="relative w-12 shrink-0 font-mono text-[13px] font-black text-white">{l.pct}</span>
          <span className="relative text-[12px] font-bold uppercase tracking-wider text-white/55">
            {l.label}
          </span>
        </HoverCard>
      ))}
    </div>
  );
}

export function CaseStudy({
  name,
  stages,
}: {
  name: string;
  stages: Array<{ phase: string; detail: string }>;
}) {
  return (
    <HoverCard as="article" lift className="p-0">
      <div className="border-b border-white/15 px-4 py-3">
        <p className="relative text-[12px] font-black uppercase tracking-wider text-white">{name}</p>
      </div>
      <div className="divide-y divide-white/10">
        {stages.map((s) => (
          <div key={s.phase} className="grid gap-2 px-4 py-3 sm:grid-cols-[160px_1fr]">
            <p className="relative text-[10px] font-bold uppercase tracking-wider text-white/45">{s.phase}</p>
            <p className="relative text-[13px] text-white/70">{s.detail}</p>
          </div>
        ))}
      </div>
    </HoverCard>
  );
}

export function EngineStatus({
  engines,
}: {
  engines: Array<{ name: string; status: string }>;
}) {
  return (
    <div className="space-y-2">
      {engines.map((e) => (
        <HoverCard
          key={e.name}
          lift={false}
          className="flex items-center justify-between px-4 py-3"
        >
          <span className="relative text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">
            {e.name}
          </span>
          <span className="relative font-mono text-[11px] font-bold uppercase tracking-wider text-white">
            {e.status}
          </span>
        </HoverCard>
      ))}
    </div>
  );
}

export function MetricReadout({
  metrics,
}: {
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {metrics.map((m) => (
        <HoverCard key={m.label} lift className="px-3 py-3">
          <p className="relative text-[9px] font-bold uppercase tracking-wider text-white/40">{m.label}</p>
          <p className="relative mt-1 font-mono text-[14px] font-black tabular-nums text-white">{m.value}</p>
        </HoverCard>
      ))}
    </div>
  );
}

export function RoadmapColumn({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "shipped" | "building" | "next" | "future";
}) {
  const icon =
    variant === "shipped" ? "✓" : variant === "building" ? "□" : variant === "next" ? "○" : "·";

  return (
    <HoverCard lift className="p-0">
      <div className="border-b border-white/15 px-4 py-3">
        <p className="relative text-[10px] font-black uppercase tracking-[0.16em] text-white/55">{title}</p>
      </div>
      <ul className="divide-y divide-white/10">
        {items.map((item) => (
          <li
            key={item}
            className="relative flex items-start gap-3 px-4 py-2.5 font-mono text-[11px] text-white/70"
          >
            <span className="shrink-0 text-white/40">{icon}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </HoverCard>
  );
}

export function ManifestoBlock({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-l-2 border-white px-6 py-2 text-[15px] leading-relaxed text-white/80">
      {children}
    </blockquote>
  );
}
