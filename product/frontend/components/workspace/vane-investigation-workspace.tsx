"use client";

import type { RefObject } from "react";

import { InvestigationEngineHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { EngineWorkstation } from "@/components/workspace/engine-workstation";
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
        <EngineWorkstation
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

  const showViewEngine = Boolean(onViewEngineTrace);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#141414]">
      <InvestigationEngineHeader />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[#141414] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {showViewEngine ? (
          <div className="border-b border-vx-border px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={onViewEngineTrace}
              className="border border-white/20 px-4 py-2.5 text-[12px] uppercase tracking-[0.14em] text-white/80 transition-colors hover:border-white/40 hover:text-white"
            >
              View Engine
            </button>
          </div>
        ) : null}

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
    </div>
  );
}
