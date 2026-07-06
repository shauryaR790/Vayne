"use client";

import type { RefObject } from "react";

import { VaneEngineEmpty } from "@/components/workspace/vane-engine-empty";
import { VaneInvestigationWorkspace } from "@/components/workspace/vane-investigation-workspace";
import type { InvestigationMode } from "@/lib/investigation-mode";
import type { StoredChatMessage } from "@/lib/conversation-session";

export function VaneEnginePanel({
  scrollRef,
  showResults,
  busy,
  backendOnline,
  error,
  files,
  investigationMode,
  enginePhase,
  messages,
  investigationIds,
  investigationGroupId,
  sourceLabels,
  onSelectFiles,
  onRemoveFile,
  onModeChange,
  onAnalyze,
}: {
  scrollRef: RefObject<HTMLDivElement>;
  showResults: boolean;
  busy: boolean;
  backendOnline: boolean;
  error: string;
  files: File[];
  investigationMode: InvestigationMode;
  enginePhase: "idle" | "running" | "complete";
  messages: StoredChatMessage[];
  investigationIds: string[];
  investigationGroupId?: string | null;
  sourceLabels?: string[];
  onSelectFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onModeChange: (mode: InvestigationMode) => void;
  onAnalyze: () => void;
}) {
  const offlineError = !backendOnline ? "Backend offline — start API on port 8000" : undefined;

  return (
    <main className="flex h-screen w-[55%] min-w-0 flex-col border-r border-vx-border bg-vx-app">
      {!showResults ? (
        <VaneEngineEmpty
          files={files}
          investigationMode={investigationMode}
          disabled={busy}
          error={error || offlineError}
          onSelectFiles={onSelectFiles}
          onRemoveFile={onRemoveFile}
          onModeChange={onModeChange}
          onAnalyze={onAnalyze}
        />
      ) : (
        <VaneInvestigationWorkspace
          scrollRef={scrollRef}
          enginePhase={enginePhase}
          messages={messages}
          investigationIds={investigationIds}
          investigationGroupId={investigationGroupId}
          sourceLabels={sourceLabels}
          error={error || offlineError}
        />
      )}
    </main>
  );
}
