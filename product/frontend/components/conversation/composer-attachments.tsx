"use client";

import { attachmentsFromFiles } from "@/lib/multi-investigation-message";
import { MessageAttachmentList } from "@/components/conversation/message-attachment-chips";

export function ComposerAttachments({
  files,
  onRemove,
  disabled,
}: {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  if (!files.length) return null;

  return (
    <MessageAttachmentList
      attachments={attachmentsFromFiles(files)}
      onRemove={onRemove}
      disabled={disabled}
    />
  );
}
