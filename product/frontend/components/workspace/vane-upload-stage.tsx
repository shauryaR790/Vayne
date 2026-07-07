"use client";

import { useCallback, useEffect, useRef } from "react";
import { motion } from "motion/react";

import {
  WorkspaceHomeShortcuts,
  WorkspaceSupportedFormats,
} from "@/components/workspace/workspace-shortcuts-overlay";
import { shortFilename } from "@/lib/evidence-presentation";
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
      className="flex h-full w-full items-center justify-center overflow-y-auto px-8 py-16 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

      <div className="flex w-full max-w-[480px] flex-col items-center text-center">
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
          <FadeIn delay={0.14} className="mt-10 w-full">
            <p className="text-[13px] text-vx-muted">
              {files.length} file{files.length === 1 ? "" : "s"} selected ·{" "}
              <span className="font-mono text-vx-secondary">Enter</span> to analyze
            </p>
            <ul className="mt-4 space-y-2 text-left">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex items-center justify-between gap-4 text-[14px]"
                >
                  <span className="min-w-0 truncate text-vx-body">{shortFilename(file.name)}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemoveFile(index)}
                    className="shrink-0 text-[12px] text-vx-muted transition-colors hover:text-white disabled:opacity-40"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            {files.length > 1 ? (
              <div className="mt-4 flex items-center justify-center gap-3 text-[12px] text-vx-muted">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onModeChange("combined")}
                  className={cn(
                    "transition-colors",
                    investigationMode === "combined" ? "text-white" : "hover:text-vx-secondary",
                  )}
                >
                  Merge scans
                </button>
                <span>·</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onModeChange("separate")}
                  className={cn(
                    "transition-colors",
                    investigationMode === "separate" ? "text-white" : "hover:text-vx-secondary",
                  )}
                >
                  Compare separately
                </button>
              </div>
            ) : null}
          </FadeIn>
        ) : null}

        {error ? (
          <p className="mt-6 text-[13px] text-vx-secondary">{error}</p>
        ) : null}

        <FadeIn delay={hasFiles ? 0.2 : 0.16} className="mt-12 w-full">
          <WorkspaceHomeShortcuts />
        </FadeIn>

        <FadeIn delay={hasFiles ? 0.28 : 0.24} className="mt-10">
          <WorkspaceSupportedFormats />
        </FadeIn>
      </div>
    </div>
  );
}
