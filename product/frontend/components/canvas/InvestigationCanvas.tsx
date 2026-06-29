"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";

import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { parseRejectedChains, proofTimelineSteps } from "@/lib/report-helpers";
import { TechnicalZoneGate } from "@/components/investigation/TechnicalZoneGate";
import { InvestigationWorkspace } from "@/components/investigation/InvestigationWorkspace";
import { InvestigationFindings } from "@/components/investigation/InvestigationFindings";
import { AttackChainsSection } from "@/components/investigation/AttackChainsSection";
import { ProofTimeline } from "@/components/investigation/ProofTimeline";

/** Technical evidence workspace — supporting view, not the primary product surface. */
export function InvestigationCanvas({ bundle }: { bundle: InvestigationBundle }) {
  const ref = useRef<HTMLDivElement>(null);
  const { detail, report, findings, proof } = bundle;
  const rejectedChains = parseRejectedChains(report);
  const investigationId = detail.summary.id;

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current.querySelectorAll(".vx-canvas-section"),
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power2.out" },
    );
  }, [investigationId]);

  return (
    <div
      ref={ref}
      className="vx-report vx-no-scrollbar mx-auto w-full max-w-[1200px] px-5 py-8 [--page-bleed-x:1.25rem] lg:px-8 lg:[--page-bleed-x:2rem] [&_.vx-canvas-section]:opacity-0"
    >
      <header className="vx-canvas-section mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-white/15 pb-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
            Technical Workspace
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">Investigation evidence</h1>
          <p className="mt-1 text-[13px] text-white/45">
            Graph, findings, chains, and proof for analyst review
          </p>
        </div>
        <Link
          href="/"
          className="border border-white/30 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white/65 transition-colors hover:border-white hover:text-white"
        >
          ← Back to conversation
        </Link>
      </header>

      <TechnicalZoneGate />

      <div
        id="technical-workspace"
        className="vx-canvas-section relative scroll-mt-10 space-y-10 border-l-2 border-white/20 pl-5 lg:pl-6"
        aria-label="Technical investigation workspace"
      >
        <div className="pointer-events-none absolute -left-px top-0 h-24 w-px bg-white/60" aria-hidden />

        <section className="vx-canvas-section">
          <InvestigationWorkspace bundle={bundle} />
        </section>

        <section className="vx-canvas-section">
          <InvestigationFindings findings={findings.validated} />
        </section>

        <section className="vx-canvas-section">
          <AttackChainsSection
            validatedPaths={detail.attack_paths}
            rejectedChains={rejectedChains}
            investigationId={investigationId}
          />
        </section>

        <section className="vx-canvas-section">
          <ProofTimeline steps={proofTimelineSteps(report)} rawProof={proof} />
        </section>
      </div>
    </div>
  );
}
