"use client";

import { InvestigationComposer } from "@/components/workspace/home/investigation-composer";
import { PriorityInvestigationsPanel } from "@/components/workspace/home/priority-investigations-panel";
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
  onOpenInvestigation: (id: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-vx-app [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-6 py-16">
        <div className="mb-8 text-center">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] text-white/95 sm:text-[32px]">
            What would you like to investigate?
          </h1>
        </div>

        <InvestigationComposer
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
        />

        <PriorityInvestigationsPanel onOpenInvestigation={onOpenInvestigation} />

        <div className="mt-8">
          <RecentInvestigationList onOpen={onOpenInvestigation} />
        </div>
      </div>
    </div>
  );
}
