"use client";

import { useCallback, useEffect, useRef } from "react";

import { InvestigationWorkspaceHome } from "@/components/workspace/home/investigation-workspace-home";
import { SessionAnalyzingBar } from "@/components/workspace/home/session-analyzing-bar";
import type { InvestigationMode } from "@/lib/investigation-mode";
import { OPEN_EVIDENCE_EVENT } from "@/lib/workspace-shortcuts";

export function VaneUploadStage({
  files,
  disabled,
  busy,
  investigationMode,
  onInvestigationModeChange,
  onSelectFiles,
  onRemoveFile,
  onClearFiles,
  onBeginSession,
  onOpenInvestigation,
}: {
  files: File[];
  disabled?: boolean;
  busy?: boolean;
  investigationMode?: InvestigationMode;
  onInvestigationModeChange?: (mode: InvestigationMode) => void;
  onSelectFiles: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onClearFiles?: () => void;
  onBeginSession: (prompt: string) => void;
  onOpenInvestigation: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = useCallback(
    (multiple = true) => {
      const input = fileInputRef.current;
      if (!input || disabled) return;
      input.multiple = multiple;
      input.click();
    },
    [disabled],
  );

  const openFolderPicker = useCallback(() => {
    const input = folderInputRef.current;
    if (!input || disabled) return;
    input.click();
  }, [disabled]);

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
      {/* No accept= filter — Windows hides extensionless burp_042 / nuclei_195 exports otherwise. */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        disabled={disabled}
        multiple
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onSelectFiles(picked);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        disabled={disabled}
        multiple
        // @ts-expect-error — non-standard but supported in Chromium / Edge for folder pick
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onSelectFiles(picked);
          e.target.value = "";
        }}
      />
      <InvestigationWorkspaceHome
        disabled={disabled}
        busy={busy || disabled}
        stagedFiles={files}
        investigationMode={investigationMode}
        onInvestigationModeChange={onInvestigationModeChange}
        onSelectFiles={onSelectFiles}
        onRemoveFile={onRemoveFile}
        onClearFiles={onClearFiles}
        onBeginSession={onBeginSession}
        onUpload={() => openFilePicker(true)}
        onUploadFolder={() => openFolderPicker()}
        onOpenInvestigation={onOpenInvestigation}
      />
      {busy || disabled ? <SessionAnalyzingBar label="Analyzing evidence…" /> : null}
    </div>
  );
}
