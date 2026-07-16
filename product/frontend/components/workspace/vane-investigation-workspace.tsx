"use client";

import type { RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EngineProgress } from "@/components/conversation/engine-progress";
import {
  InvestigationInlineReport,
  MultiInvestigationInlineReport,
} from "@/components/conversation/investigation-inline-report";
import type { StoredChatMessage } from "@/lib/conversation-session";
import { ensureEngineMessages } from "@/lib/engine-messages";

export function VaneInvestigationWorkspace({
  scrollRef,
  enginePhase,
  messages,
  investigationIds,
  investigationGroupId,
  sourceLabels,
  evidenceFileCount,
  error,
}: {
  scrollRef: RefObject<HTMLDivElement>;
  enginePhase: "idle" | "running" | "complete";
  messages: StoredChatMessage[];
  investigationIds: string[];
  investigationGroupId?: string | null;
  sourceLabels?: string[];
  evidenceFileCount?: number;
  error?: string;
}) {
  const engineMessages = ensureEngineMessages(messages, investigationIds, {
    investigationGroupId,
    sourceLabels,
  });

  const renderedReports = engineMessages.flatMap((msg) => {
    if (msg.kind === "investigation" && msg.investigationId) {
      return [
        <InvestigationInlineReport
          key={msg.id}
          investigationId={msg.investigationId}
          sourceLabel={msg.sourceLabel}
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
      <header className="sticky top-0 z-10 border-b border-vx-border bg-vx-section-body px-6 py-3">
        <h1 className="text-[13px] font-medium text-vx-secondary">Investigation Workspace</h1>
      </header>

      <div className="mx-auto w-full min-w-0 max-w-[1080px]">
        <AnimatePresence initial={false}>
          {enginePhase !== "idle" ? (
            <motion.div
              key="engine-progress"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden border-b border-vx-border"
            >
              <div className="px-6 py-5">
                <EngineProgress
                  active={enginePhase === "running"}
                  complete={enginePhase === "complete"}
                  fileCount={evidenceFileCount}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {renderedReports.length > 0 ? (
          renderedReports
        ) : investigationIds.length > 0 ? (
          investigationIds.map((id, index) => (
            <InvestigationInlineReport
              key={id}
              investigationId={id}
              sourceLabel={sourceLabels?.[index]}
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
