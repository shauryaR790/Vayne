"use client";

import { useMemo } from "react";

import { EngineFileDetailList } from "@/components/workspace/engine-file-detail-box";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { buildEngineFileInsights } from "@/lib/engine-file-insights";
import type { WorkbenchData } from "@/lib/types";

export function AnalystEngineFileBoxes({
  workbench,
  bundle,
  sourceLabel,
  sourceLabels,
  className,
}: {
  workbench: WorkbenchData;
  bundle?: InvestigationBundle;
  sourceLabel?: string;
  sourceLabels?: string[];
  className?: string;
}) {
  const insights = useMemo(
    () => buildEngineFileInsights(workbench, { bundle, sourceLabel, sourceLabels }),
    [workbench, bundle, sourceLabel, sourceLabels],
  );

  if (!insights.length) return null;

  return (
    <div className={className}>
      <EngineFileDetailList insights={insights} />
    </div>
  );
}
