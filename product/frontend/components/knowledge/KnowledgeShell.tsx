"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

import { cn } from "@/lib/utils";

export function KnowledgeShell({
  title,
  subtitle,
  classification = "UNCLASSIFIED // OPERATIONAL",
  sections,
  children,
}: {
  title: string;
  subtitle: string;
  classification?: string;
  sections: Array<{ id: string; label: string }>;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current.querySelectorAll(".vx-knowledge-section"),
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: "power2.out" },
    );
  }, [title]);

  return (
    <div ref={ref} className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-8">
      <header className="mb-10 border-b border-white pb-8">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
          {classification}
        </p>
        <h1 className="vx-page-title mt-4 text-white">{title}</h1>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-white">{subtitle}</p>
      </header>

      <div className="flex gap-10 lg:gap-14">
        <aside className="hidden w-44 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-1">
            <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white">
              Contents
            </p>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block border-l border-transparent py-1.5 pl-3 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:border-white/50"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        <article className={cn("min-w-0 flex-1 max-w-3xl", "[&_.vx-knowledge-section]:opacity-0")}>
          {children}
        </article>
      </div>
    </div>
  );
}

export function KnowledgeSectionWrap({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="vx-knowledge-section scroll-mt-24">
      {children}
    </div>
  );
}
