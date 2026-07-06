import type { StoredChatMessage } from "@/lib/conversation-session";
import { revealText, sleep } from "@/lib/text-reveal";

export const ANALYST_THINKING_STEPS = [
  "analyzing attack path...",
  "correlating evidence...",
  "validating exploitability...",
  "generating explanation...",
] as const;

export interface AnalystStreamMessage extends StoredChatMessage {
  streaming?: boolean;
}

export async function runAnalystThinkingSteps(
  onStep: (step: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (const step of ANALYST_THINKING_STEPS) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onStep(step);
    await sleep(520, signal);
  }
}

export async function streamAnalystBriefing(
  fullMessages: StoredChatMessage[],
  apply: (updater: (prev: AnalystStreamMessage[]) => AnalystStreamMessage[]) => void,
  options?: {
    onThinkingStep?: (step: string | null) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const signal = options?.signal;

  if (options?.onThinkingStep) {
    for (const step of ANALYST_THINKING_STEPS) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      options.onThinkingStep(step);
      await sleep(520, signal);
    }
    options.onThinkingStep(null);
  }

  for (const message of fullMessages) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (message.role === "assistant") {
      const id = message.id;
      apply((prev) => [...prev, { ...message, content: "", streaming: true }]);

      await revealText(
        message.content,
        (partial) => {
          apply((prev) =>
            prev.map((row) =>
              row.id === id ? { ...row, content: partial, streaming: true } : row,
            ),
          );
        },
        { charsPerTick: 3, tickMs: 16, paragraphPauseMs: 320, signal },
      );

      apply((prev) =>
        prev.map((row) => (row.id === id ? { ...row, streaming: false } : row)),
      );
      await sleep(240, signal);
    } else {
      apply((prev) => [...prev, message]);
    }
  }
}
