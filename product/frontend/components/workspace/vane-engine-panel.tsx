"use client";

import type { RefObject } from "react";

import { InvestigationNoEvidence } from "@/components/workspace/home/investigation-no-evidence";
import { VaneEngineEmpty } from "@/components/workspace/vane-engine-empty";
import { VaneInvestigationWorkspace } from "@/components/workspace/vane-investigation-workspace";
import type { StoredChatMessage } from "@/lib/conversation-session";
import type { InvestigationMode } from "@/lib/investigation-mode";
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
  investigationMode,
  onInvestigationModeChange,
  enginePhase,
  messages,
  investigationIds,
  investigationGroupId,
  sourceLabels,
  onSelectFiles,
  onRemoveFile,
  onClearFiles,
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
  investigationMode?: InvestigationMode;
  onInvestigationModeChange?: (mode: InvestigationMode) => void;
  enginePhase: "idle" | "running" | "complete";
  messages: StoredChatMessage[];
  investigationIds: string[];
  investigationGroupId?: string | null;
  sourceLabels?: string[];
  onSelectFiles: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onClearFiles?: () => void;
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
        investigationMode={investigationMode}
        onInvestigationModeChange={onInvestigationModeChange}
        disabled={busy}
        busy={busy}
        onSelectFiles={onSelectFiles}
        onRemoveFile={onRemoveFile}
        onClearFiles={onClearFiles}
        onBeginSession={onBeginSession}
        onOpenInvestigation={onOpenInvestigation}
      />
    );
  }

  if (!hasInvestigationData) {
    const analyzingLabel =
      enginePhase === "running"
        ? "Analyzing evidence…"
        : busy
          ? "Working…"
          : "Analyzing evidence…";

    return (
      <div
        ref={scrollRef}
        className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-vx-app [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <InvestigationNoEvidence
          onUpload={() => dispatchWorkspaceEvent(OPEN_EVIDENCE_EVENT)}
          onFocusAnalyst={onFocusAnalyst}
          onNewInvestigation={onNewInvestigation}
          onOpenInvestigation={onOpenInvestigation}
          busy={busy || enginePhase === "running"}
          analyzingLabel={analyzingLabel}
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
      investigationMode={investigationMode}
      sourceLabels={sourceLabels}
      evidenceFileCount={files.length || undefined}
      error={error || offlineError}
    />
  );
}
