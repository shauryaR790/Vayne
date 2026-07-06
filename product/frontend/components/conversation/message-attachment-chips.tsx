"use client";

import type { MessageAttachment } from "@/lib/multi-investigation-message";
import { EvidencePackage } from "@/components/conversation/evidence-artifact";
import { cn } from "@/lib/utils";

/** @deprecated Use EvidencePackage directly */
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

  return (
    <EvidencePackage
      attachments={attachments}
      variant={readOnly ? "message" : "composer"}
      onRemove={onRemove}
      disabled={disabled}
      readOnly={readOnly}
      className={cn(className)}
    />
  );
}
