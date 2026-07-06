"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { MessageAttachment } from "@/lib/multi-investigation-message";
import {
  buildInvestigationRequestMeta,
  evidenceTypeLabel,
  shortFilename,
} from "@/lib/evidence-presentation";
import { cn } from "@/lib/utils";

const ARTIFACT_BORDER =
  "border border-vx-border bg-vx-panel";

export function EvidenceArtifactCard({
  attachment,
  onRemove,
  disabled,
  readOnly = false,
  className,
}: {
  attachment: MessageAttachment;
  onRemove?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const name = shortFilename(attachment.name);
  const type = evidenceTypeLabel(attachment.name);

  return (
    <div
      className={cn(
        ARTIFACT_BORDER,
        "relative flex min-h-[52px] w-[min(220px,100%)] shrink-0 flex-col justify-center px-3 py-2",
        !readOnly && onRemove && "pr-8",
        className,
      )}
    >
      <p className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/35">
        File
      </p>
      <p className="mt-0.5 truncate font-mono text-[12px] font-semibold text-white">{name}</p>
      <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-wide text-white/30">
        {type}
      </p>
      {!readOnly && onRemove ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className={cn(
            "absolute right-1.5 top-1.5 flex size-5 items-center justify-center",
            "text-white/35 transition-colors hover:text-white/70 disabled:opacity-30",
          )}
          aria-label={`Remove ${attachment.name}`}
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

export function EvidencePackage({
  attachments,
  variant = "composer",
  onRemove,
  disabled,
  readOnly = false,
  className,
}: {
  attachments: MessageAttachment[];
  variant?: "composer" | "message";
  onRemove?: (index: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  if (!attachments.length) return null;

  if (variant === "message" && attachments.length > 1) {
    return (
      <article className={cn(ARTIFACT_BORDER, "w-full max-w-[min(420px,100%)] p-3.5", className)}>
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">
          Evidence Package
        </p>
        <p className="mt-1 font-mono text-[10px] text-white/35">
          {attachments.length} file{attachments.length === 1 ? "" : "s"}
        </p>
        <ul className="mt-3 space-y-1 font-mono text-[11px] text-white/70">
          {attachments.map((attachment, index) => {
            const name = shortFilename(attachment.name);
            const branch = index === attachments.length - 1 ? "└──" : "├──";
            return (
              <li key={attachment.id} className="flex items-baseline gap-2">
                <span className="shrink-0 text-white/25">{branch}</span>
                <span className="truncate">{name}</span>
              </li>
            );
          })}
        </ul>
      </article>
    );
  }

  if (variant === "message" && attachments.length === 1) {
    return (
      <EvidenceArtifactCard
        attachment={attachments[0]}
        readOnly
        className={cn("w-full max-w-[min(280px,100%)]", className)}
      />
    );
  }

  const cards = attachments.map((attachment, index) => (
    <motion.div
      key={attachment.id}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.16 }}
      className="shrink-0"
    >
      <EvidenceArtifactCard
        attachment={attachment}
        onRemove={onRemove ? () => onRemove(index) : undefined}
        disabled={disabled}
        readOnly={readOnly}
      />
    </motion.div>
  ));

  if (readOnly) {
    return (
      <div className={cn("flex flex-wrap justify-end gap-2 md:flex-nowrap", className)}>
        {cards}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto pb-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <AnimatePresence mode="popLayout">{cards}</AnimatePresence>
    </div>
  );
}

export function InvestigationRequestCard({
  attachments,
  prompt,
  className,
}: {
  attachments: MessageAttachment[];
  prompt?: string;
  className?: string;
}) {
  const meta = buildInvestigationRequestMeta(attachments);
  const trimmedPrompt = prompt?.trim() ?? "";
  const custom =
    trimmedPrompt.length > 0 &&
    !/^Analyze\b/i.test(trimmedPrompt) &&
    !attachments.some((a) => trimmedPrompt.includes(a.name));

  return (
    <article
      className={cn(
        ARTIFACT_BORDER,
        "w-full max-w-[min(420px,100%)] p-3.5 text-left",
        className,
      )}
    >
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">
        Investigation Request
      </p>
      <p className="mt-2 font-mono text-[13px] font-semibold uppercase tracking-wide text-white">
        {custom ? trimmedPrompt : meta.headline}
      </p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-white/35">Scope</p>
      <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-white/65">{meta.scope}</p>
      {meta.fileCount > 1 ? (
        <p className="mt-2 font-mono text-[9px] text-white/30">
          {meta.fileCount} evidence sources submitted
        </p>
      ) : null}
    </article>
  );
}
