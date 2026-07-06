"use client";

import { VaneUploadStage } from "@/components/workspace/vane-upload-stage";
import type { InvestigationMode } from "@/lib/investigation-mode";

export function VaneEngineEmpty(props: {
  files: File[];
  investigationMode: InvestigationMode;
  onSelectFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onModeChange: (mode: InvestigationMode) => void;
  onAnalyze: () => void;
  disabled?: boolean;
  error?: string;
}) {
  return <VaneUploadStage {...props} />;
}
