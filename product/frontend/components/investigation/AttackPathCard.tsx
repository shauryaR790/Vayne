"use client";

import type { AttackPathSummary } from "@/lib/types";
import { formatCategory } from "@/lib/format";
import { PathChain } from "./PathChain";
import type { PathDetail } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/shared/workspace-card";
import { HoverCard } from "@/components/shared/hover-card";

export function DeploymentPathCard({
  path,
  index,
  fullPath,
  onAsk,
}: {
  path: AttackPathSummary;
  index: number;
  investigationId: string;
  fullPath?: PathDetail | null;
  onAsk?: (q: string) => void;
}) {
  return (
    <HoverCard as="article" className="flex h-full flex-col" lift>
      <div className="relative flex items-center justify-between gap-4 border-b border-white/15 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[13px] font-black uppercase tracking-wide text-white">
            Attack Path #{index + 1}
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-white/50">{path.stable_id}</p>
        </div>
        <Badge variant="success">Verified</Badge>
      </div>

      <div className="relative grid grid-cols-2 gap-4 border-b border-white/15 px-5 py-4 text-[12px]">
        <div>
          <SectionLabel>Category</SectionLabel>
          <p className="mt-1 font-medium uppercase text-white">{formatCategory(path.category)}</p>
        </div>
        <div>
          <SectionLabel>Confidence</SectionLabel>
          <p className="mt-1 font-black tabular-nums text-white">{path.confidence}%</p>
        </div>
        <div>
          <SectionLabel>Risk</SectionLabel>
          <p className="mt-1 font-black tabular-nums text-white">{path.risk.toFixed(1)}</p>
        </div>
        <div>
          <SectionLabel>Blast Radius</SectionLabel>
          <p className="mt-1 font-black tabular-nums text-white">{path.blast_radius}</p>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col gap-4 px-5 py-4">
        {fullPath ? (
          <div className="shrink-0">
            <PathChain path={fullPath} />
          </div>
        ) : null}
        <p className="line-clamp-3 text-[13px] leading-relaxed text-white/70">{path.title}</p>

        {path.mitre_tactics?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {path.mitre_tactics.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  onAsk?.(
                    `Explain MITRE tactic ${t.split(" ")[0]} in attack path #${index + 1} (${path.title}).`,
                  )
                }
                className="border border-white/30 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white/60 transition-colors hover:bg-white hover:text-black"
              >
                {t.split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative mt-auto border-t border-white/15 px-5 py-3">
        <button
          type="button"
          onClick={() =>
            onAsk?.(
              `Explain validated attack path #${index + 1}: ${path.title}. Walk me through the exploit chain, confidence, and blast radius.`,
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

/** @deprecated use DeploymentPathCard */
export function AttackPathCard(props: {
  path: AttackPathSummary;
  index: number;
  investigationId: string;
  onAsk?: (q: string) => void;
}) {
  return <DeploymentPathCard {...props} />;
}
