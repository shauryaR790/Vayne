"use client";

import { useCallback, useEffect, useRef } from "react";

import { InvestigationWorkspaceHome } from "@/components/workspace/home/investigation-workspace-home";
import { SessionAnalyzingBar } from "@/components/workspace/home/session-analyzing-bar";
import { ACCEPTED_EXTENSIONS } from "@/lib/upload";
import { OPEN_EVIDENCE_EVENT } from "@/lib/workspace-shortcuts";

export function VaneUploadStage({
  files,
  disabled,
  busy,
  onSelectFiles,
  onBeginSession,
  onOpenInvestigation,
}: {
  files: File[];
  disabled?: boolean;
  busy?: boolean;
  onSelectFiles: (files: File[]) => void;
  onBeginSession: (prompt: string) => void;
  onOpenInvestigation: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = useCallback(
    (multiple = true) => {
      const input = fileInputRef.current;
      if (!input || disabled) return;
      input.multiple = multiple;
      input.click();
    },
    [disabled],
  );

  useEffect(() => {
    const onOpenEvidence = () => openFilePicker(true);
    window.addEventListener(OPEN_EVIDENCE_EVENT, onOpenEvidence);
    return () => window.removeEventListener(OPEN_EVIDENCE_EVENT, onOpenEvidence);
  }, [openFilePicker]);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (disabled) return;
        const picked = Array.from(e.dataTransfer.files ?? []);
        if (picked.length) onSelectFiles(picked);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        disabled={disabled}
        multiple
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onSelectFiles(picked);
          e.target.value = "";
        }}
      />
      <InvestigationWorkspaceHome
        disabled={disabled}
        busy={busy || disabled}
        stagedFileCount={files.length}
        onSelectFiles={onSelectFiles}
        onBeginSession={onBeginSession}
        onUpload={() => openFilePicker(true)}
        onOpenInvestigation={onOpenInvestigation}
      />
      {busy || disabled ? <SessionAnalyzingBar label="Analyzing evidence…" /> : null}
    </div>
  );
}
