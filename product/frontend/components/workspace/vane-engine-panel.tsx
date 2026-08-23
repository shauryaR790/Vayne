"use client";

import type { RefObject } from "react";

import { InvestigationNoEvidence } from "@/components/workspace/home/investigation-no-evidence";
import { ServerStartingUp } from "@/components/workspace/home/server-starting-up";
import { BackendUnavailable } from "@/components/workspace/home/backend-unavailable";
import { VaneEngineEmpty } from "@/components/workspace/vane-engine-empty";
import { VaneInvestigationWorkspace } from "@/components/workspace/vane-investigation-workspace";
import type { StoredChatMessage } from "@/lib/conversation-session";
import type { EngineTraceEvent } from "@/lib/engine-trace";
import type { InvestigationMode } from "@/lib/investigation-mode";
import { OPEN_EVIDENCE_EVENT, dispatchWorkspaceEvent } from "@/lib/workspace-shortcuts";
import { USER_MESSAGES } from "@/lib/user-messages";

export function VaneEnginePanel({
  scrollRef,
  sessionActive,
  hasInvestigationData,
  busy,
  backendOnline,
  backendStartupFailed,
  analystOnline,
  error,
  files,
  investigationMode,
  onInvestigationModeChange,
  enginePhase,
  engineTraceEvents,
  onViewEngineTrace,
  onCloseEngineTrace,
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
  backendStartupFailed?: boolean;
  analystOnline: boolean;
  error: string;
  files: File[];
  investigationMode?: InvestigationMode;
  onInvestigationModeChange?: (mode: InvestigationMode) => void;
  enginePhase: "idle" | "running" | "complete";
  engineTraceEvents?: EngineTraceEvent[];
  onViewEngineTrace?: () => void;
  onCloseEngineTrace?: () => void;
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
  const offlineError = !backendOnline ? USER_MESSAGES.serviceOfflineShort : undefined;
  void analystOnline;

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

  if (enginePhase === "running" || enginePhase === "complete") {
    return (
      <VaneInvestigationWorkspace
        scrollRef={scrollRef}
        enginePhase={enginePhase}
        engineTraceEvents={engineTraceEvents}
        messages={messages}
        investigationIds={investigationIds}
        investigationGroupId={investigationGroupId}
        investigationMode={investigationMode}
        sourceLabels={sourceLabels}
        evidenceFileCount={files.length || undefined}
        error={error || offlineError}
        onViewEngineTrace={onViewEngineTrace}
        onCloseEngineTrace={onCloseEngineTrace}
      />
    );
  }

  if (!hasInvestigationData) {
    if (!backendOnline) {
      return (
        <div
          ref={scrollRef}
          className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-vx-app [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {backendStartupFailed ? <BackendUnavailable /> : <ServerStartingUp />}
        </div>
      );
    }

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
          busy={busy}
          analyzingLabel={busy ? "Working…" : "Analyzing evidence…"}
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
      engineTraceEvents={engineTraceEvents}
      onViewEngineTrace={onViewEngineTrace}
      onCloseEngineTrace={onCloseEngineTrace}
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
