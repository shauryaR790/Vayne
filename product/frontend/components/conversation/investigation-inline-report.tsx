"use client";

import { useEffect, useState } from "react";

import { InvestigationWorkstationReport } from "@/components/workspace/investigation-workstation-report";
import { loadInvestigationBundle } from "@/lib/investigation-bundle";
import { cn } from "@/lib/utils";

export function InvestigationInlineReport({
  investigationId,
  sourceLabel,
  sequenceIndex = 1,
  className,
}: {
  investigationId: string;
  sourceLabel?: string;
  sequenceIndex?: number;
  className?: string;
}) {
  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof loadInvestigationBundle>> | null>(
    null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadInvestigationBundle(investigationId)
      .then((data) => {
        if (!cancelled) setBundle(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [investigationId, sourceLabel, sequenceIndex]);

  if (error) return <p className="px-6 py-4 text-[13px] text-vx-muted">{error}</p>;

  if (!bundle) {
    return (
      <div className="w-full border-b border-vx-border bg-vx-panel px-6 py-5 text-[14px] text-vx-muted">
        Loading investigation workspace…
      </div>
    );
  }

  return (
    <InvestigationWorkstationReport
      bundle={bundle}
      sourceLabel={sourceLabel}
      sequenceIndex={sequenceIndex}
      className={className}
    />
  );
}

export function MultiInvestigationInlineReport({
  investigations,
}: {
  investigations: Array<{ id: string; sourceLabel?: string }>;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col">
      {investigations.map((inv, index) => (
        <div key={inv.id} className={cn(index > 0 && "border-t border-vx-border")}>
          <InvestigationInlineReport
            investigationId={inv.id}
            sourceLabel={inv.sourceLabel}
            sequenceIndex={index + 1}
          />
        </div>
      ))}
    </div>
  );
}
