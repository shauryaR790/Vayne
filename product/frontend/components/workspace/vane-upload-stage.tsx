"use client";

import { useCallback, useEffect, useRef } from "react";
import { motion } from "motion/react";

import {
  WorkspaceHomeShortcuts,
} from "@/components/workspace/workspace-shortcuts-overlay";
import {
  AddEvidenceButton,
  EvidenceQueue,
} from "@/components/workspace/evidence-queue";
import type { InvestigationMode } from "@/lib/investigation-mode";
import { ACCEPTED_EXTENSIONS } from "@/lib/upload";
import { OPEN_EVIDENCE_EVENT } from "@/lib/workspace-shortcuts";
import { cn } from "@/lib/utils";

function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function VaneUploadStage({
  files,
  investigationMode,
  onSelectFiles,
  onRemoveFile,
  onModeChange,
  onAnalyze,
  disabled,
  error,
}: {
  files: File[];
  investigationMode: InvestigationMode;
  onSelectFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onModeChange: (mode: InvestigationMode) => void;
  onAnalyze: () => void;
  disabled?: boolean;
  error?: string;
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

  const hasFiles = files.length > 0;

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
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
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onSelectFiles(picked);
          e.target.value = "";
        }}
      />

      <div
        className={cn(
          "mx-auto flex w-full max-w-[520px] min-h-0 flex-1 flex-col px-8 text-center",
          hasFiles ? "justify-start py-8" : "items-center justify-center py-16",
        )}
      >
        <FadeIn delay={0}>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-white">
            What should we investigate?
          </h1>
        </FadeIn>

        <FadeIn delay={0.08} className="mt-3">
          <p className="text-[15px] leading-relaxed text-vx-secondary">
            Drop scan files anywhere or start a new investigation.
          </p>
        </FadeIn>

        {hasFiles ? (
          <div className="mt-8 w-full shrink-0">
            <EvidenceQueue
              files={files}
              investigationMode={investigationMode}
              disabled={disabled}
              onRemoveFile={onRemoveFile}
              onModeChange={onModeChange}
            />
          </div>
        ) : null}

        <FadeIn
          delay={hasFiles ? 0.15 : 0.12}
          className={cn("w-full shrink-0", hasFiles ? "mt-5" : "mt-10")}
        >
          <AddEvidenceButton
            disabled={disabled}
            onClick={() => openFilePicker(true)}
          />
        </FadeIn>

        {error ? (
          <p className="mt-6 text-[13px] text-vx-secondary">{error}</p>
        ) : null}

        <FadeIn delay={hasFiles ? 0.2 : 0.16} className="mt-auto w-full shrink-0 pt-8">
          <WorkspaceHomeShortcuts />
        </FadeIn>
      </div>
    </div>
  );
}
