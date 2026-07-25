"use client";

import { EngineInputPanel } from "@/components/workspace/engine-input-panel";
import { RecentInvestigationList } from "@/components/workspace/home/recent-investigation-list";
import type { InvestigationMode } from "@/lib/investigation-mode";

export function InvestigationWorkspaceHome({
  disabled,
  busy,
  stagedFiles,
  investigationMode,
  onInvestigationModeChange,
  onSelectFiles,
  onRemoveFile,
  onClearFiles,
  onBeginSession,
  onUpload,
  onUploadFolder,
  onOpenInvestigation,
}: {
  disabled?: boolean;
  busy?: boolean;
  stagedFiles?: File[];
  investigationMode?: InvestigationMode;
  onInvestigationModeChange?: (mode: InvestigationMode) => void;
  onSelectFiles: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onClearFiles?: () => void;
  onBeginSession: (prompt: string) => void;
  onUpload: () => void;
  onUploadFolder?: () => void;
  onOpenInvestigation: (id: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-[#141414] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-4 py-10 sm:px-6 sm:py-14">
        <EngineInputPanel
          disabled={disabled}
          busy={busy}
          stagedFiles={stagedFiles}
          investigationMode={investigationMode}
          onInvestigationModeChange={onInvestigationModeChange}
          onSelectFiles={onSelectFiles}
          onRemoveFile={onRemoveFile}
          onClearFiles={onClearFiles}
          onBeginSession={onBeginSession}
          onUpload={onUpload}
          onUploadFolder={onUploadFolder}
        />

        <div className="mt-10">
          <RecentInvestigationList onOpen={onOpenInvestigation} />
        </div>
      </div>
    </div>
  );
}
