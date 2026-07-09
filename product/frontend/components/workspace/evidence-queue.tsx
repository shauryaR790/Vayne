"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";

import { shortFilename } from "@/lib/evidence-presentation";
import type { InvestigationMode } from "@/lib/investigation-mode";
import { fileTypeLabel } from "@/lib/upload";
import { cn } from "@/lib/utils";

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function evidenceFormatLabel(filename: string): string {
  const lower = filename.toLowerCase();
  const ext = fileExtension(filename);

  if (ext === ".nessus" || lower.includes("nessus")) return "Nessus";
  if (lower.includes("nuclei")) return "Nuclei";
  if (lower.includes("nmap")) return "Nmap";
  if (lower.includes("openvas")) return "OpenVAS";
  if (lower.includes("burp")) return "Burp";
  if (ext === ".xml") return "XML";
  if (ext === ".json") return "JSON";
  if (ext === ".csv") return "CSV";

  return fileTypeLabel(filename).replace(/ File$/, "").replace(/ Scan$/, "File");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileRowKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function AddEvidenceButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-2 rounded-[10px] border border-white/[0.1] bg-[#1B1B1B] px-4 py-2.5",
          "text-[13px] text-vx-secondary transition-colors",
          "hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-white disabled:opacity-40",
        )}
      >
        <Plus className="size-3.5" strokeWidth={2} />
        Add evidence
      </button>
    </div>
  );
}

function EvidenceTypeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-vx-secondary">
      {label}
    </span>
  );
}

function EvidenceRow({
  file,
  index,
  disabled,
  compact,
  onRemove,
}: {
  file: File;
  index: number;
  disabled?: boolean;
  compact?: boolean;
  onRemove: () => void;
}) {
  const format = evidenceFormatLabel(file.name);
  const meta = `${format} · ${formatFileSize(file.size)}`;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{
        duration: 0.26,
        delay: index * 0.05,
        ease: [0.25, 0.1, 0.25, 1],
        layout: { duration: 0.22 },
      }}
      className="group border-b border-white/[0.06] last:border-b-0"
    >
      <div
        className={cn(
          "flex items-center gap-4 px-5 transition-colors hover:bg-white/[0.02]",
          compact ? "py-3" : "py-[18px]",
        )}
      >
        <EvidenceTypeBadge label={format} />
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[14px] font-medium text-white">
            {shortFilename(file.name)}
          </p>
          <p className="mt-1 text-[12px] text-vx-muted">{meta}</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-vx-muted",
            "opacity-0 transition-all duration-200 group-hover:opacity-100",
            "hover:bg-white/[0.06] hover:text-white disabled:opacity-40",
          )}
          aria-label={`Remove ${file.name}`}
        >
          <X className="size-3.5" strokeWidth={2} />
          <span>Remove</span>
        </button>
      </div>
    </motion.li>
  );
}

export function EvidenceQueue({
  files,
  investigationMode,
  disabled,
  onRemoveFile,
  onModeChange,
}: {
  files: File[];
  investigationMode: InvestigationMode;
  disabled?: boolean;
  onRemoveFile: (index: number) => void;
  onModeChange: (mode: InvestigationMode) => void;
}) {
  const rows = useMemo(
    () => files.map((file, index) => ({ file, index, key: fileRowKey(file) })),
    [files],
  );

  if (!files.length) return null;

  const compact = files.length > 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full shrink-0 text-left"
    >
      <p className="mb-3 text-center text-[12px] font-medium uppercase tracking-[0.08em] text-vx-muted">
        Selected Evidence
        <span className="ml-2 font-mono text-white/70">{files.length}</span>
      </p>

      <div
        className={cn(
          "overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#1B1B1B]",
          "transition-colors duration-200 hover:border-white/[0.14]",
        )}
      >
        <ul className="m-0 max-h-[min(28rem,calc(100vh-18rem))] list-none overflow-y-auto p-0 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map(({ file, index, key }) => (
              <EvidenceRow
                key={key}
                file={file}
                index={index}
                compact={compact}
                disabled={disabled}
                onRemove={() => onRemoveFile(index)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>

      {files.length > 1 ? (
        <div className="mt-4 flex shrink-0 items-center justify-center gap-3 text-[12px] text-vx-muted">
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
          <span className="text-vx-muted/60">·</span>
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
    </motion.div>
  );
}
