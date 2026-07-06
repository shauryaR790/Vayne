import type { StoredChatMessage } from "@/lib/conversation-session";

function hasEngineReport(messages: StoredChatMessage[]): boolean {
  return messages.some(
    (message) =>
      message.kind === "investigation" ||
      message.kind === "multi-investigation",
  );
}

/** Guarantee center-panel messages include investigation report entries. */
export function ensureEngineMessages(
  messages: StoredChatMessage[],
  investigationIds: string[],
  options?: {
    investigationGroupId?: string | null;
    sourceLabels?: string[];
  },
): StoredChatMessage[] {
  if (!investigationIds.length) return messages;
  if (hasEngineReport(messages)) return messages;

  const sourceLabels = options?.sourceLabels ?? [];
  const preserved = messages.filter(
    (message) => message.role === "user" || message.attachments?.length,
  );

  if (investigationIds.length > 1) {
    const groupId = options?.investigationGroupId ?? investigationIds[0];
    return [
      ...preserved,
      {
        id: `inv-group-${groupId}`,
        role: "assistant",
        content: "",
        kind: "multi-investigation",
        investigationSources: investigationIds.map((id, index) => ({
          id,
          sourceLabel: sourceLabels[index],
        })),
      },
    ];
  }

  const investigationId = investigationIds[0];
  return [
    ...preserved,
    {
      id: `inv-${investigationId}`,
      role: "assistant",
      content: "",
      kind: "investigation",
      investigationId,
      sourceLabel: sourceLabels[0],
    },
  ];
}

export function investigationIdsFromMessages(
  messages: StoredChatMessage[],
): string[] {
  const ids = new Set<string>();

  for (const message of messages) {
    if (message.kind === "investigation" && message.investigationId) {
      ids.add(message.investigationId);
    }
    message.investigationSources?.forEach((source) => {
      if (source.id) ids.add(source.id);
    });
  }

  return [...ids];
}
