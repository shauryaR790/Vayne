"use client";

import { useState } from "react";

export function ProofTimeline({
  steps,
  rawProof,
}: {
  steps: Array<{
    id: string;
    title: string;
    detail: string;
    data: unknown;
  }>;
  rawProof: string;
}) {
  const [openId, setOpenId] = useState<string | null>(steps[0]?.id ?? null);

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="text-center border-b border-vercel-border pb-6">
        <h1 className="vx-section-title">Proof Timeline</h1>
        <p className="text-body text-vercel-muted mt-2">
          Deterministic audit trail from engine proof mode.
        </p>
      </div>

      <div className="relative border-l border-vercel-border ml-3 space-y-0">
        {steps.map((step, i) => {
          const open = openId === step.id;
          return (
            <div key={step.id} className="relative pl-8 pb-4">
              <span className="absolute left-0 top-3 -translate-x-1/2 w-2 h-2 bg-vercel-border border border-vercel-border-hover rounded-full" />
              <button
                type="button"
                onClick={() => setOpenId(open ? null : step.id)}
                className="w-full text-left vx-panel-hover border border-vercel-border px-4 py-3 transition-[background-color,border-color] duration-150 bg-vercel-panel"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-metadata text-vercel-muted font-bold uppercase tracking-wide">
                      Step {i + 1}
                    </p>
                    <p className="text-body font-bold text-white mt-1">{step.title}</p>
                    <p className="text-metadata text-vercel-muted mt-1">{step.detail}</p>
                  </div>
                  <span className="text-vercel-muted text-metadata font-bold">{open ? "−" : "+"}</span>
                </div>
              </button>
              {open && step.data != null && (
                <pre className="mt-2 border border-vercel-border bg-vercel-hover p-4 text-metadata font-mono text-zinc-300 whitespace-pre-wrap">
                  {JSON.stringify(step.data, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      <details className="vx-panel bg-vercel-panel">
        <summary className="px-4 py-3 cursor-pointer vx-card-title border-b border-vercel-border">
          Raw proof.txt
        </summary>
        <pre className="p-4 text-metadata font-mono text-zinc-300 whitespace-pre-wrap">
          {rawProof}
        </pre>
      </details>
    </div>
  );
}
