"use client";

import type { AttackPathSummary } from "@/lib/types";
import type { RejectedChain } from "@/lib/report-helpers";
import { DeploymentPathCard } from "./AttackPathCard";
import { SectionLabel } from "@/components/shared/workspace-card";
import { HoverCard } from "@/components/shared/hover-card";

function ChainBreadcrumb({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((step, i) => (
        <span key={`${step}-${i}`} className="flex items-center gap-2">
          <span className="border border-white/35 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white/80">
            {step}
          </span>
          {i < steps.length - 1 && <span className="text-white/25">→</span>}
        </span>
      ))}
    </div>
  );
}

function RejectedChainCard({
  chain,
  index,
  onAsk,
}: {
  chain: RejectedChain;
  index: number;
  onAsk?: (q: string) => void;
}) {
  return (
    <HoverCard as="article" className="flex h-full flex-col" lift>
      <div className="border-b border-white/15 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
          Rejected Chain #{index + 1}
        </p>
        <div className="mt-3">
          <ChainBreadcrumb steps={chain.steps} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <div>
          <SectionLabel>Why Rejected</SectionLabel>
          <p className="mt-2 text-[13px] leading-relaxed text-white/80">{chain.reason}</p>
        </div>
        <div>
          <SectionLabel>Missing Evidence</SectionLabel>
          <p className="mt-2 text-[13px] text-white/55">
            Exploit verification or privilege escalation evidence below validation threshold.
          </p>
        </div>
      </div>
      <div className="mt-auto border-t border-white/15 px-5 py-3">
        <button
          type="button"
          onClick={() =>
            onAsk?.(
              `Explain rejected attack chain #${index + 1}: ${chain.steps.join(" → ")}. Why was it rejected (${chain.reason})?`,
            )
          }
          className="border border-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:bg-white hover:text-black"
        >
          Ask VAYNE
        </button>
      </div>
    </HoverCard>
  );
}

export function AttackChainsSection({
  validatedPaths,
  rejectedChains,
  investigationId,
  onAsk,
}: {
  validatedPaths: AttackPathSummary[];
  rejectedChains: RejectedChain[];
  investigationId: string;
  onAsk?: (q: string) => void;
}) {
  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
      <div className="flex flex-col space-y-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
          Validated Attack Chains
        </h3>
        {validatedPaths.length > 0 ? (
          <div className="flex flex-1 flex-col space-y-3">
            {validatedPaths.map((path, i) => (
              <DeploymentPathCard
                key={path.id}
                path={path}
                index={i}
                investigationId={investigationId}
                onAsk={onAsk}
              />
            ))}
          </div>
        ) : (
          <HoverCard className="flex flex-1 flex-col px-5 py-6" lift={false}>
            <p className="relative text-[13px] font-bold uppercase text-white/55">
              No validated attack chains
            </p>
            <p className="relative mt-2 text-[12px] text-white/40">
              VAYNE explored candidate paths but none met the validation threshold.
            </p>
          </HoverCard>
        )}
      </div>

      <div className="flex flex-col space-y-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
          Rejected Attack Chains
        </h3>
        {rejectedChains.length > 0 ? (
          <div className="flex flex-1 flex-col space-y-3">
            {rejectedChains.map((chain, i) => (
              <RejectedChainCard key={i} chain={chain} index={i} onAsk={onAsk} />
            ))}
          </div>
        ) : (
          <HoverCard className="flex flex-1 flex-col px-5 py-6" lift={false}>
            <p className="relative text-[12px] text-white/40">No rejected chains recorded.</p>
          </HoverCard>
        )}
      </div>
    </section>
  );
}
