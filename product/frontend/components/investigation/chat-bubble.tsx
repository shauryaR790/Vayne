"use client";

import { memo } from "react";

import { MessageContent } from "@/components/conversation/message-content";
import {
  EvidencePackage,
  InvestigationRequestCard,
} from "@/components/conversation/evidence-artifact";
import {
  InvestigationInlineReport,
  MultiInvestigationInlineReport,
} from "@/components/conversation/investigation-inline-report";
import type { MessageAttachment } from "@/lib/multi-investigation-message";
import { isInvestigationSubmission } from "@/lib/evidence-presentation";
import type { InvestigationSourceRef, MessageKind } from "@/lib/conversation-session";
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
  kind = "text",
  investigationId,
  sourceLabel,
  investigationSources,
}: {
  id?: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  persona?: VaynePersona;
  attachments?: MessageAttachment[];
  kind?: MessageKind;
  investigationId?: string;
  sourceLabel?: string;
  investigationSources?: InvestigationSourceRef[];
}) {
  const isUser = role === "user";

  if (isUser) {
    const hasAttachments = Boolean(attachments?.length);
    const isSubmission = hasAttachments && isInvestigationSubmission(content, attachments);

    return (
      <div className="flex justify-end py-4">
        <div className="flex w-full max-w-[min(440px,92%)] flex-col items-end gap-2">
          {hasAttachments ? (
            <EvidencePackage attachments={attachments!} variant="message" readOnly />
          ) : null}
          {isSubmission ? (
            <InvestigationRequestCard attachments={attachments!} prompt={content} />
          ) : (
            <div className="border border-white/[0.12] bg-black px-4 py-3 text-right transition-[border-color] hover:border-white/[0.22]">
              <p className="text-[14px] leading-[1.65] text-white/85">{content}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const resolvedPersona = persona ?? personaFromMessageId(id);

  if (kind === "investigation" && investigationId) {
    return (
      <article className={cn("w-full min-w-0 py-4", !streaming && "animate-in fade-in duration-300")}>
        {content ? (
          <div className="mb-4 flex items-start gap-3">
            <VayneIdentity persona={resolvedPersona} compact />
            <p className="min-w-0 pt-1 text-[15px] leading-relaxed text-white/75">{content}</p>
          </div>
        ) : null}
        <InvestigationInlineReport
          investigationId={investigationId}
          sourceLabel={sourceLabel}
        />
      </article>
    );
  }

  if (kind === "multi-investigation" && investigationSources?.length) {
    return (
      <article className={cn("w-full min-w-0 py-4", !streaming && "animate-in fade-in duration-300")}>
        <MultiInvestigationInlineReport
          investigations={investigationSources}
        />
      </article>
    );
  }

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
