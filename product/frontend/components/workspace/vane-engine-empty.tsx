"use client";

import { VaneUploadStage } from "@/components/workspace/vane-upload-stage";
import type { InvestigationMode } from "@/lib/investigation-mode";

export function VaneEngineEmpty(props: {
  files: File[];
  investigationMode?: InvestigationMode;
  onInvestigationModeChange?: (mode: InvestigationMode) => void;
  onSelectFiles: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onClearFiles?: () => void;
  onBeginSession: (prompt: string) => void;
  onOpenInvestigation: (id: string) => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <VaneUploadStage {...props} />
    </div>
  );
}
