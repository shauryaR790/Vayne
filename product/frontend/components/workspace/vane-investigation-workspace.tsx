"use client";

import type { RefObject } from "react";

import { EngineTracePanel } from "@/components/workspace/engine-trace-panel";
import {
  InvestigationInlineReport,
  MultiInvestigationInlineReport,
} from "@/components/conversation/investigation-inline-report";
import type { StoredChatMessage } from "@/lib/conversation-session";
import type { EngineTraceEvent } from "@/lib/engine-trace";
import type { InvestigationMode } from "@/lib/investigation-mode";
import { ensureEngineMessages } from "@/lib/engine-messages";

export function VaneInvestigationWorkspace({
  scrollRef,
  enginePhase,
  engineTraceEvents = [],
  messages,
  investigationIds,
  investigationGroupId,
  investigationMode,
  sourceLabels,
  error,
  onViewEngineTrace,
  onCloseEngineTrace,
}: {
  scrollRef: RefObject<HTMLDivElement>;
  enginePhase: "idle" | "running" | "complete";
  engineTraceEvents?: EngineTraceEvent[];
  messages: StoredChatMessage[];
  investigationIds: string[];
  investigationGroupId?: string | null;
  investigationMode?: InvestigationMode;
  sourceLabels?: string[];
  evidenceFileCount?: number;
  error?: string;
  onViewEngineTrace?: () => void;
  onCloseEngineTrace?: () => void;
}) {
  const engineMessages = ensureEngineMessages(messages, investigationIds, {
    investigationGroupId,
    sourceLabels,
  });

  const showTrace = enginePhase === "running" || enginePhase === "complete";

  if (showTrace) {
    return (
      <div ref={scrollRef} className="flex h-full min-h-0 flex-col bg-[#141414]">
        <EngineTracePanel
          events={engineTraceEvents}
          running={enginePhase === "running"}
          className="min-h-0 flex-1"
          onViewFullReport={enginePhase !== "running" ? onCloseEngineTrace : undefined}
        />
        {error ? (
          <p className="shrink-0 border-t border-white/10 px-5 py-3 font-mono text-[12px] text-red-400/80">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const renderedReports = engineMessages.flatMap((msg) => {
    if (msg.kind === "investigation" && msg.investigationId) {
      return [
        <InvestigationInlineReport
          key={msg.id}
          investigationId={msg.investigationId}
          sourceLabel={msg.sourceLabel}
          sourceLabels={sourceLabels}
          investigationMode={investigationMode}
        />,
      ];
    }
    if (msg.kind === "multi-investigation" && msg.investigationSources?.length) {
      return [
        <MultiInvestigationInlineReport
          key={msg.id}
          investigations={msg.investigationSources}
        />,
      ];
    }
    return [];
  });

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto bg-vx-app [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-vx-border bg-vx-section-body px-6 py-3">
        <h1 className="text-[13px] font-medium text-vx-secondary">Investigation Workspace</h1>
        {onViewEngineTrace && (engineTraceEvents.length > 0 || investigationIds.length > 0) ? (
          <button
            type="button"
            onClick={onViewEngineTrace}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/55 transition-colors hover:text-white"
          >
            View Engine Trace
          </button>
        ) : null}
      </header>

      <div className="mx-auto w-full min-w-0 max-w-[1080px]">
        {renderedReports.length > 0 ? (
          renderedReports
        ) : investigationIds.length > 0 ? (
          investigationIds.map((id, index) => (
            <InvestigationInlineReport
              key={id}
              investigationId={id}
              sourceLabel={sourceLabels?.[index]}
              sourceLabels={sourceLabels}
              investigationMode={investigationMode}
              sequenceIndex={index + 1}
            />
          ))
        ) : null}

        {error ? (
          <p className="border-t border-vx-border px-6 py-4 text-[14px] text-vx-secondary">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
