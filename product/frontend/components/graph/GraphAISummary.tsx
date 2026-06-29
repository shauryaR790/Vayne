"use client";

import { AskVayneButton } from "@/components/shared/ask-vayne-button";
import { Button } from "@/components/ui/button";

export function GraphAISummary({ summary }: { summary: string }) {
  return (
    <div className="border border-white/25 bg-black px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
        VAYNE Analysis
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-white/75">{summary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm">
          Explain Graph
        </Button>
        <Button variant="secondary" size="sm">
          Explain Attack Chain
        </Button>
        <Button variant="secondary" size="sm">
          Explain Rejections
        </Button>
        <AskVayneButton />
      </div>
    </div>
  );
}
