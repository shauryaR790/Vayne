"use client";

import { useEffect, useState } from "react";

import { InvestigationWorkstationReport } from "@/components/workspace/investigation-workstation-report";
import {
  CursorLoadingStatus,
  type CursorLoadingLine,
} from "@/components/shared/cursor-loading-status";
import { loadInvestigationBundle, subscribeInvestigationBundle } from "@/lib/investigation-bundle";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { removeRecentInvestigation } from "@/lib/recent-investigations";
import type { InvestigationMode } from "@/lib/investigation-mode";
import { InvestigationSourceTabs } from "@/components/workspace/investigation-source-tabs";

function workspaceLoadingLines(
  bundle: InvestigationBundle | null,
  sourceLabel?: string,
): CursorLoadingLine[] {
  if (!bundle) {
    return [
      { label: "Loading investigation", detail: sourceLabel },
      { label: "Reading engine exports", dim: true },
    ];
  }

  const fileHint =
    bundle.workbench?.totals.files && bundle.workbench.totals.files > 0
      ? `${bundle.workbench.totals.files} file${bundle.workbench.totals.files === 1 ? "" : "s"}`
      : sourceLabel;

  if (!bundle.workbench && bundle.graph.nodes.length === 0) {
    return [
      { label: "Parsing evidence", detail: fileHint },
      { label: "Building workbench", dim: true },
    ];
  }

  if (bundle.graph.nodes.length === 0) {
    return [
      { label: "Building attack graph", detail: fileHint },
      { label: "Correlating findings", dim: true },
    ];
  }

  return [
    { label: "Hydrating workspace", detail: sourceLabel },
    { label: "Waiting for report renderer", dim: true },
  ];
}

export function InvestigationInlineReport({
  investigationId,
  sourceLabel,
  sourceLabels,
  investigationMode,
  sequenceIndex = 1,
  className,
}: {
  investigationId: string;
  sourceLabel?: string;
  sourceLabels?: string[];
  investigationMode?: InvestigationMode;
  sequenceIndex?: number;
  className?: string;
}) {
  const [bundle, setBundle] = useState<InvestigationBundle | null>(null);
  const [error, setError] = useState("");
  const [fetchDone, setFetchDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setError("");
    setFetchDone(false);

    const onUpdate = (data: InvestigationBundle) => {
      if (!cancelled) setBundle(data);
    };

    const unsubscribe = subscribeInvestigationBundle(investigationId, onUpdate);
    void loadInvestigationBundle(investigationId)
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        if (message.includes("no longer exists")) {
          removeRecentInvestigation(investigationId);
        }
      })
      .finally(() => {
        if (!cancelled) setFetchDone(true);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [investigationId, sourceLabel, sequenceIndex]);

  if (error) {
    return (
      <div className="border-b border-vx-border px-6 py-5">
        <p className="text-[13px] font-medium text-vx-secondary">Could not load investigation</p>
        <p className="mt-1 text-[13px] text-vx-muted">{error}</p>
      </div>
    );
  }

  if (!fetchDone || !bundle) {
    return (
      <div className="w-full border-b border-vx-border bg-vx-panel px-6 py-5">
        <CursorLoadingStatus lines={workspaceLoadingLines(bundle, sourceLabel)} />
      </div>
    );
  }

  return (
    <InvestigationWorkstationReport
      bundle={bundle}
      sourceLabel={sourceLabel}
      sourceLabels={sourceLabels}
      investigationMode={investigationMode}
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
  return <InvestigationSourceTabs investigations={investigations} />;
}
