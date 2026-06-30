"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";

import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { INVESTIGATION_SHELL } from "@/lib/conversation-layout";
import { resetConversationToHome } from "@/lib/conversation-session";
import { parseRejectedChains, proofTimelineSteps } from "@/lib/report-helpers";
import { InvestigationWorkspace } from "@/components/investigation/InvestigationWorkspace";
import { InvestigationFindings } from "@/components/investigation/InvestigationFindings";
import { AttackChainsSection } from "@/components/investigation/AttackChainsSection";
import { ProofTimeline } from "@/components/investigation/ProofTimeline";

/** Technical evidence workspace — supporting view, not the primary product surface. */
export function InvestigationCanvas({ bundle }: { bundle: InvestigationBundle }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { detail, report, findings, proof } = bundle;
  const rejectedChains = parseRejectedChains(report);
  const investigationId = detail.summary.id;

  const goHome = () => {
    resetConversationToHome();
    router.replace("/");
  };

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
      className={`vx-report vx-no-scrollbar ${INVESTIGATION_SHELL} [&_.vx-canvas-section]:opacity-0`}
    >
      <header className="vx-canvas-section mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/15 pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
            Technical Workspace
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">Investigation evidence</h1>
          <p className="mt-1 text-[13px] text-white/45">
            Graph, findings, chains, and proof for analyst review
          </p>
        </div>
        <button
          type="button"
          onClick={goHome}
          className="border border-white/30 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white/65 transition-colors hover:border-white hover:text-white"
        >
          ← Back to home
        </button>
      </header>

      <div
        id="technical-workspace"
        className="vx-canvas-section scroll-mt-8 space-y-6"
        aria-label="Technical investigation workspace"
      >
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
