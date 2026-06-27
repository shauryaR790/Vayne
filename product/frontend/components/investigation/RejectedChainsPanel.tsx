import { Panel } from "@/components/ui/Workstation";
import type { RejectedChain } from "@/lib/report-helpers";
import { formatGraphNodeLabel } from "@/lib/format";

function ChainSteps({ steps }: { steps: string[] }) {
  return (
    <div className="font-mono text-label space-y-1 py-2 min-w-0">
      {steps.map((step, i) => {
        const { primary } = formatGraphNodeLabel(step);
        return (
          <div key={`${step}-${i}`} className="flex flex-col items-start min-w-0 w-full">
            <span className="text-white font-semibold break-all">{primary}</span>
            {i < steps.length - 1 && <span className="text-vercel-muted py-0.5 pl-2">↓</span>}
          </div>
        );
      })}
    </div>
  );
}

export function RejectedChainsPanel({ chains }: { chains: RejectedChain[] }) {
  return (
    <Panel title="Rejected chains">
      <div className="space-y-4">
        {chains.map((chain, i) => (
          <div key={i} className="vx-panel-hover border border-vercel-border p-4 min-w-0 overflow-hidden">
            <ChainSteps steps={chain.steps.slice(0, 6)} />
            <div className="mt-3 pt-3 border-t border-vercel-border min-w-0">
              <p className="vx-label">Reason</p>
              <p className="text-body text-vercel-muted mt-1 break-words">{chain.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
