import type { AnalystStreamSegment } from "@/lib/analyst-segments";

import { flattenSegmentText } from "@/lib/analyst-segments";

import type { StoredChatMessage } from "@/lib/conversation-session";

import {
  type AgentActivityFeed,
} from "@/lib/analyst-activity";



export const ANALYST_THINKING_STEPS = [

  "Reviewing investigation context...",

  "Tracing evidence chain...",

  "Validating exploitability...",

  "Drafting explanation...",

] as const;



export interface AnalystStreamMessage extends StoredChatMessage {

  streaming?: boolean;

  revealedSegments?: number;

  segmentTexts?: string[];

  activeThinking?: { label: string; detail?: string; activity?: AgentActivityFeed } | null;

  revealedFileInsights?: number;

}



/** Paint briefing segments immediately — no think holds or typed reveal. */
async function streamSegmentTimeline(

  message: StoredChatMessage,

  apply: (updater: (prev: AnalystStreamMessage[]) => AnalystStreamMessage[]) => void,

  signal?: AbortSignal,

): Promise<void> {

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const segments = message.streamSegments ?? [];

  const segmentTexts = segments.map((segment) => (segment.type === "text" ? segment.content : ""));

  apply((prev) => [

    ...prev,

    {

      ...message,

      content: message.content || flattenSegmentText(segments),

      streaming: false,

      revealedSegments: segments.length,

      segmentTexts,

      activeThinking: null,

    },

  ]);

}



async function streamLegacyBriefing(

  message: StoredChatMessage,

  apply: (updater: (prev: AnalystStreamMessage[]) => AnalystStreamMessage[]) => void,

  signal?: AbortSignal,

): Promise<void> {

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const insights = message.fileInsights ?? [];

  apply((prev) => [

    ...prev,

    {

      ...message,

      content: message.content,

      streaming: false,

      fileInsights: insights,

      revealedFileInsights: insights.length,

    },

  ]);

}



export async function runAnalystThinkingSteps(

  onStep: (step: string) => void,

  _signal?: AbortSignal,

): Promise<void> {

  for (const step of ANALYST_THINKING_STEPS) {

    onStep(step);

  }

}



export async function streamAnalystBriefing(

  fullMessages: StoredChatMessage[],

  apply: (updater: (prev: AnalystStreamMessage[]) => AnalystStreamMessage[]) => void,

  options?: {

    onThinkingStep?: (step: string | null) => void;

    signal?: AbortSignal;

    inlineOnly?: boolean;

  },

): Promise<void> {

  const signal = options?.signal;

  const useGlobalThinking = options?.onThinkingStep && !options.inlineOnly;



  if (useGlobalThinking) {

    for (const step of ANALYST_THINKING_STEPS) {

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      options.onThinkingStep!(step);

    }

    options.onThinkingStep!(null);

  }



  for (const message of fullMessages) {

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");



    if (message.role === "assistant") {

      if (message.streamSegments?.length) {

        await streamSegmentTimeline(message, apply, signal);

      } else {

        await streamLegacyBriefing(message, apply, signal);

      }

    } else {

      apply((prev) => [...prev, message]);

    }

  }

}



export function buildSegmentRenderPlan(

  segments: AnalystStreamSegment[],

  options: {

    revealedSegments: number;

    segmentTexts?: string[];

    activeThinking?: { label: string; detail?: string; activity?: AgentActivityFeed } | null;

    streaming?: boolean;

  },

) {

  const { revealedSegments, segmentTexts, activeThinking, streaming } = options;

  const items: Array<

    | { kind: "think"; label: string; detail?: string; active: boolean; activity?: AgentActivityFeed }

    | { kind: "file"; fileIndex: number }

    | { kind: "text"; content: string; streaming: boolean }

  > = [];



  for (let index = 0; index < segments.length; index++) {

    const segment = segments[index];

    const isDone = index < revealedSegments;

    const isActive = streaming && index === revealedSegments;



    if (!isDone && !isActive) break;



    if (segment.type === "think") {

      if (isDone) {

        items.push({ kind: "think", label: segment.label, detail: segment.detail, active: false });

      }

      continue;

    }



    if (segment.type === "file") {

      if (isDone || isActive) {

        items.push({ kind: "file", fileIndex: segment.fileIndex });

      }

      continue;

    }



    const content = segmentTexts?.[index] ?? (isDone ? segment.content : "");

    if (content || (isActive && segment.type === "text")) {

      items.push({ kind: "text", content, streaming: Boolean(isActive && streaming) });

    }

  }



  if (activeThinking) {
    items.push({
      kind: "think",
      label: activeThinking.label,
      detail: activeThinking.detail,
      active: true,
      activity: activeThinking.activity,
    });
  }



  return items;

}
