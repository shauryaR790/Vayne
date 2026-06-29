"use client";

import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { avgConfidence, parseRejectedChains } from "@/lib/report-helpers";
import { GraphExplorer } from "@/components/graph/GraphExplorer";
import type { ReasoningCheck } from "@/components/graph/GraphEmptyState";
import { HoverCard } from "@/components/shared/hover-card";

const EMPTY_GRAPH_CHECKS: Array<{ label: string; variant: "success" | "failure" }> = [
  { label: "Discovery completed", variant: "success" },
  { label: "Fingerprinting completed", variant: "success" },
  { label: "Vulnerability mapping completed", variant: "success" },
  { label: "Exploit verification failed", variant: "failure" },
  { label: "Privilege escalation unavailable", variant: "failure" },
  { label: "No downstream target discovered", variant: "failure" },
];

function buildEmptyChecks(hasPaths: boolean): ReasoningCheck[] {
  return EMPTY_GRAPH_CHECKS.filter((c) => c.variant === "success" || !hasPaths).map(
    (c) => ({
      label: c.label,
      ok: c.variant === "success",
      variant: c.variant,
    }),
  );
}

export function InvestigationWorkspace({ bundle }: { bundle: InvestigationBundle }) {
  const { detail, report, graph } = bundle;
  const hasPaths = detail.attack_paths.length > 0;
  const chains = parseRejectedChains(report);
  const confidence = hasPaths ? avgConfidence(detail) : null;

  return (
    <section className="space-y-6">
      <div>
        <div className="mb-3 border-b border-white/20 pb-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em]">Attack Graph</h3>
        </div>
        <HoverCard className="overflow-hidden p-0" lift={false}>
          <GraphExplorer
            embedded
            graph={graph}
            context={{
              hasPaths,
              attackPaths: detail.summary.path_count,
              rejectedPaths: chains.length,
              confidence,
              summary: "",
              emptyChecks: buildEmptyChecks(hasPaths),
            }}
          />
        </HoverCard>
      </div>
    </section>
  );
}
