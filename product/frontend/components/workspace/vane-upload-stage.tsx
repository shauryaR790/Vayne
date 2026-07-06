"use client";

import { X } from "lucide-react";

import { VaneLogoMark } from "@/components/brand/vane-logo";
import { InvestigationModeToggle } from "@/components/conversation/investigation-mode-toggle";
import { shortFilename } from "@/lib/evidence-presentation";
import type { InvestigationMode } from "@/lib/investigation-mode";
import { ACCEPTED_EXTENSIONS } from "@/lib/upload";
import { cn } from "@/lib/utils";

function UploadFileCard({
  name,
  onRemove,
  disabled,
}: {
  name: string;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative flex w-full max-w-[320px] flex-col items-center rounded-md border border-vx-border bg-vx-panel px-4 py-3 text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-vx-muted">Evidence</p>
      <p className="mt-1 w-full truncate text-[15px] font-medium text-white">
        {shortFilename(name)}
      </p>
      {onRemove ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded text-vx-muted transition-colors hover:bg-vx-elevated hover:text-white disabled:opacity-40"
          aria-label={`Remove ${name}`}
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
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
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center px-6 py-12"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (disabled) return;
        const picked = Array.from(e.dataTransfer.files ?? []);
        if (picked.length) onSelectFiles(picked);
      }}
    >
      <div className="flex w-full max-w-[360px] flex-col items-center">
        <VaneLogoMark size={128} />

        <h1 className="mt-6 text-center text-[20px] font-medium text-white">
          What should we investigate?
        </h1>
        <p className="mt-2 text-center text-[15px] text-vx-secondary">Upload evidence</p>

        <label
          className={cn(
            "mt-8 cursor-pointer rounded-md border border-vx-border bg-vx-panel px-5 py-2.5 text-[15px] text-vx-secondary transition-colors hover:bg-vx-elevated hover:text-white",
            disabled && "pointer-events-none opacity-40",
          )}
        >
          Upload Evidence
          <input
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) onSelectFiles(picked);
              e.target.value = "";
            }}
          />
        </label>

        {files.length > 0 ? (
          <div className="mt-8 flex w-full flex-col items-center gap-4">
            {files.length > 1 ? (
              <div className="w-full max-w-[320px]">
                <InvestigationModeToggle
                  value={investigationMode}
                  disabled={disabled}
                  onChange={onModeChange}
                />
              </div>
            ) : null}

            <div className="flex w-full flex-col items-center gap-3">
              {files.map((file, index) => (
                <UploadFileCard
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  name={file.name}
                  disabled={disabled}
                  onRemove={() => onRemoveFile(index)}
                />
              ))}
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={onAnalyze}
              className="mt-2 w-full max-w-[320px] rounded-md border border-vx-border bg-vx-elevated px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-vx-panel disabled:opacity-40"
            >
              Analyze
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="mt-6 text-center text-[14px] text-vx-secondary">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
