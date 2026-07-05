"use client";

import { memo } from "react";

import { MessageContent } from "@/components/conversation/message-content";
import { MessageAttachmentList } from "@/components/conversation/message-attachment-chips";
import type { MessageAttachment } from "@/lib/multi-investigation-message";
import {
  VayneIdentity,
  personaFromMessageId,
  type VaynePersona,
} from "@/components/conversation/vayne-identity";
import { cn } from "@/lib/utils";

export const ChatBubble = memo(function ChatBubble({
  id = "assistant",
  role,
  content,
  streaming,
  persona,
  attachments,
}: {
  id?: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  persona?: VaynePersona;
  attachments?: MessageAttachment[];
}) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end py-4">
        <div className="flex max-w-[min(720px,85%)] flex-col items-end gap-2">
          {attachments?.length ? (
            <MessageAttachmentList attachments={attachments} readOnly />
          ) : null}
          <div className="rounded-[22px] bg-white/[0.06] px-5 py-3.5 text-right">
            <p className="text-[15px] leading-[1.65] text-white/88">{content}</p>
          </div>
        </div>
      </div>
    );
  }

  const resolvedPersona = persona ?? personaFromMessageId(id);

  return (
    <article className={cn("py-4", !streaming && "animate-in fade-in duration-300")}>
      <VayneIdentity persona={resolvedPersona} compact />
      <div className="min-w-0">
        <MessageContent text={content} />
        {streaming && content ? (
          <span className="mt-2 inline-block h-[1.1em] w-[2px] animate-pulse bg-white/70" />
        ) : null}
      </div>
    </article>
  );
});
