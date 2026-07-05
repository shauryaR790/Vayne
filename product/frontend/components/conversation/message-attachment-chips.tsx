"use client";

import { FileText, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { MessageAttachment } from "@/lib/multi-investigation-message";
import { fileTypeLabel } from "@/lib/upload";
import { cn } from "@/lib/utils";

function chipLabel(attachment: MessageAttachment): string {
  if (attachment.type && attachment.type !== "file") {
    const fromName = fileTypeLabel(attachment.name);
    if (fromName !== "File") return fromName;
    return attachment.type;
  }
  return fileTypeLabel(attachment.name);
}

export function MessageAttachmentChip({
  attachment,
  onRemove,
  disabled,
  readOnly = false,
}: {
  attachment: MessageAttachment;
  onRemove?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const typeLabel = chipLabel(attachment);

  return (
    <motion.div
      layout={!readOnly}
      initial={readOnly ? false : { opacity: 0, scale: 0.94 }}
      animate={readOnly ? undefined : { opacity: 1, scale: 1 }}
      exit={readOnly ? undefined : { opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative flex h-16 w-[min(300px,100%)] min-w-[250px] max-w-[320px] shrink-0 items-center gap-2.5 rounded-2xl",
        "border border-white/[0.12] bg-[#1c1c1c] px-3",
        !readOnly && "pr-9 transition-colors duration-150 hover:border-white/20 hover:bg-[#222222]",
        readOnly && "pr-3",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
        <FileText className="size-4 text-white/70" strokeWidth={1.5} aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-white">{attachment.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-white/45">{typeLabel}</p>
      </div>

      {!readOnly && onRemove ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className={cn(
            "absolute right-2 top-2 flex size-6 items-center justify-center rounded-md",
            "text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/80",
            "disabled:pointer-events-none disabled:opacity-30",
          )}
          aria-label={`Remove ${attachment.name}`}
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </motion.div>
  );
}

export function MessageAttachmentList({
  attachments,
  onRemove,
  disabled,
  readOnly = false,
  className,
}: {
  attachments: MessageAttachment[];
  onRemove?: (index: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  if (!attachments.length) return null;

  const content = attachments.map((attachment, index) => (
    <MessageAttachmentChip
      key={attachment.id}
      attachment={attachment}
      onRemove={onRemove ? () => onRemove(index) : undefined}
      disabled={disabled}
      readOnly={readOnly}
    />
  ));

  if (readOnly) {
    return <div className={cn("flex flex-wrap gap-2", className)}>{content}</div>;
  }

  return (
    <div className={cn("flex flex-wrap gap-2 px-0.5 pb-2 pt-0.5", className)}>
      <AnimatePresence mode="popLayout">{content}</AnimatePresence>
    </div>
  );
}
