"use client";

import type { RefObject } from "react";

import { InvestigationNoEvidence } from "@/components/workspace/home/investigation-no-evidence";
import { VaneEngineEmpty } from "@/components/workspace/vane-engine-empty";
import { VaneInvestigationWorkspace } from "@/components/workspace/vane-investigation-workspace";
import type { StoredChatMessage } from "@/lib/conversation-session";
import { OPEN_EVIDENCE_EVENT, dispatchWorkspaceEvent } from "@/lib/workspace-shortcuts";

export function VaneEnginePanel({
  scrollRef,
  sessionActive,
  hasInvestigationData,
  busy,
  backendOnline,
  analystOnline,
  error,
  files,
  enginePhase,
  messages,
  investigationIds,
  investigationGroupId,
  sourceLabels,
  onSelectFiles,
  onBeginSession,
  onOpenInvestigation,
  onFocusAnalyst,
  onNewInvestigation,
}: {
  scrollRef: RefObject<HTMLDivElement>;
  sessionActive: boolean;
  hasInvestigationData: boolean;
  busy: boolean;
  backendOnline: boolean;
  analystOnline: boolean;
  error: string;
  files: File[];
  enginePhase: "idle" | "running" | "complete";
  messages: StoredChatMessage[];
  investigationIds: string[];
  investigationGroupId?: string | null;
  sourceLabels?: string[];
  onSelectFiles: (files: File[]) => void;
  onBeginSession: (prompt: string) => void;
  onOpenInvestigation: (id: string) => void;
  onFocusAnalyst: () => void;
  onNewInvestigation: () => void;
}) {
  const offlineError = !backendOnline ? "Backend offline — start API on port 8000" : undefined;

  if (!sessionActive) {
    return (
      <VaneEngineEmpty
        files={files}
        disabled={busy}
        onSelectFiles={onSelectFiles}
        onBeginSession={onBeginSession}
        onOpenInvestigation={onOpenInvestigation}
      />
    );
  }

  if (!hasInvestigationData) {
    return (
      <div
        ref={scrollRef}
        className="flex h-full min-h-0 flex-col overflow-y-auto bg-vx-app [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <InvestigationNoEvidence
          onUpload={() => dispatchWorkspaceEvent(OPEN_EVIDENCE_EVENT)}
          onFocusAnalyst={onFocusAnalyst}
          onNewInvestigation={onNewInvestigation}
          onOpenInvestigation={onOpenInvestigation}
        />
        {error || offlineError ? (
          <p className="px-8 pb-8 text-center text-[13px] text-red-400/80">{error || offlineError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <VaneInvestigationWorkspace
      scrollRef={scrollRef}
      enginePhase={enginePhase}
      messages={messages}
      investigationIds={investigationIds}
      investigationGroupId={investigationGroupId}
      sourceLabels={sourceLabels}
      error={error || offlineError}
    />
  );
}
