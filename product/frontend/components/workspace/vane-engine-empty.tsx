"use client";

import { VaneUploadStage } from "@/components/workspace/vane-upload-stage";

export function VaneEngineEmpty(props: {
  files: File[];
  onSelectFiles: (files: File[]) => void;
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
