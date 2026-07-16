import type { AnalystStreamSegment } from "@/lib/analyst-segments";

import { flattenSegmentText } from "@/lib/analyst-segments";

import type { StoredChatMessage } from "@/lib/conversation-session";

import { revealText, sleep } from "@/lib/text-reveal";

import {
  advanceActivityFeed,
  buildThinkMicroScript,
  initActivityFeed,
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



const TEXT_REVEAL = {

  charsPerTick: 2,

  tickMs: 26,

  paragraphPauseMs: 480,

} as const;



function thinkPauseMs(label: string): number {

  if (label.toLowerCase().includes("reading") || label.toLowerCase().includes("parsing")) {

    return 920;

  }

  if (label.toLowerCase().includes("correlating") || label.toLowerCase().includes("weighing")) {

    return 1100;

  }

  return 780;

}



async function streamSegmentTimeline(

  message: StoredChatMessage,

  apply: (updater: (prev: AnalystStreamMessage[]) => AnalystStreamMessage[]) => void,

  signal?: AbortSignal,

): Promise<void> {

  const id = message.id;

  const segments = message.streamSegments ?? [];

  const segmentTexts = segments.map((segment) => (segment.type === "text" ? segment.content : ""));



  apply((prev) => [

    ...prev,

    {

      ...message,

      content: "",

      streaming: true,

      revealedSegments: 0,

      segmentTexts: segments.map(() => ""),

      activeThinking: null,

    },

  ]);



  await sleep(420, signal);



  for (let index = 0; index < segments.length; index++) {

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const segment = segments[index];



    if (segment.type === "think") {
      const microScript = buildThinkMicroScript(segment.label, segment.detail);
      let microFeed = initActivityFeed(microScript, { waitingLabel: "Working through evidence" });

      apply((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                activeThinking: {
                  label: segment.label,
                  detail: segment.detail,
                  activity: microFeed,
                },
                streaming: true,
              }
            : row,
        ),
      );

      const pauseMs = thinkPauseMs(segment.label);
      const microIntervalMs = 360;
      let elapsed = 0;
      let microStep = 0;

      while (elapsed < pauseMs) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        await sleep(Math.min(microIntervalMs, pauseMs - elapsed), signal);
        elapsed += microIntervalMs;
        microStep += 1;
        if (microStep < microScript.length) {
          microFeed = advanceActivityFeed(microFeed, microScript, microStep);
          apply((prev) =>
            prev.map((row) =>
              row.id === id
                ? {
                    ...row,
                    activeThinking: {
                      label: segment.label,
                      detail: segment.detail,
                      activity: microFeed,
                    },
                    streaming: true,
                  }
                : row,
            ),
          );
        }
      }

      apply((prev) =>

        prev.map((row) =>

          row.id === id

            ? {

                ...row,

                revealedSegments: index + 1,

                activeThinking: null,

                streaming: true,

              }

            : row,

        ),

      );

      await sleep(180, signal);

      continue;

    }



    if (segment.type === "file") {

      apply((prev) =>

        prev.map((row) =>

          row.id === id ? { ...row, revealedSegments: index + 1, activeThinking: null, streaming: true } : row,

        ),

      );

      await sleep(520, signal);

      continue;

    }



    apply((prev) =>

      prev.map((row) =>

        row.id === id ? { ...row, activeThinking: null, streaming: true, revealedSegments: index } : row,

      ),

    );



    await revealText(

      segment.content,

      (partial) => {

        apply((prev) =>

          prev.map((row) => {

            if (row.id !== id) return row;

            const nextTexts = [...(row.segmentTexts ?? segmentTexts)];

            nextTexts[index] = partial;

            return {

              ...row,

              segmentTexts: nextTexts,

              content: flattenSegmentText(

                segments.map((item, i) =>

                  item.type === "text" ? { type: "text" as const, content: nextTexts[i] ?? "" } : item,

                ),

              ),

              streaming: true,

              revealedSegments: index,

            };

          }),

        );

      },

      { ...TEXT_REVEAL, signal },

    );



    apply((prev) =>

      prev.map((row) => {

        if (row.id !== id) return row;

        const nextTexts = [...(row.segmentTexts ?? segmentTexts)];

        nextTexts[index] = segment.content;

        return {

          ...row,

          segmentTexts: nextTexts,

          content: flattenSegmentText(

            segments.map((item, i) =>

              item.type === "text" ? { type: "text" as const, content: nextTexts[i] ?? "" } : item,

            ),

          ),

          revealedSegments: index + 1,

          streaming: true,

        };

      }),

    );

    await sleep(320, signal);

  }



  apply((prev) =>

    prev.map((row) =>

      row.id === id

        ? {

            ...row,

            streaming: false,

            revealedSegments: segments.length,

            activeThinking: null,

            content: message.content || flattenSegmentText(segments),

          }

        : row,

    ),

  );

}



async function streamLegacyBriefing(

  message: StoredChatMessage,

  apply: (updater: (prev: AnalystStreamMessage[]) => AnalystStreamMessage[]) => void,

  signal?: AbortSignal,

): Promise<void> {

  const id = message.id;

  const insights = message.fileInsights ?? [];

  const marker = message.content.indexOf("\n\n**");

  const lead = marker > 0 ? message.content.slice(0, marker) : "";

  const body = marker > 0 ? message.content.slice(marker + 2) : message.content;



  apply((prev) => [

    ...prev,

    { ...message, content: "", streaming: true, fileInsights: insights, revealedFileInsights: 0 },

  ]);



  if (lead) {

    await revealText(lead, (partial) => {

      apply((prev) =>

        prev.map((row) => (row.id === id ? { ...row, content: partial, streaming: true } : row)),

      );

    }, TEXT_REVEAL);

  }



  for (let i = 0; i < insights.length; i++) {

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    apply((prev) =>

      prev.map((row) =>

        row.id === id ? { ...row, content: lead, revealedFileInsights: i + 1, streaming: true } : row,

      ),

    );

    await sleep(520, signal);

  }



  const bodyPrefix = lead ? `${lead}\n\n` : "";

  await revealText(

    body,

    (partial) => {

      apply((prev) =>

        prev.map((row) =>

          row.id === id

            ? { ...row, content: `${bodyPrefix}${partial}`, streaming: true, revealedFileInsights: insights.length }

            : row,

        ),

      );

    },

    TEXT_REVEAL,

  );



  apply((prev) =>

    prev.map((row) => (row.id === id ? { ...row, streaming: false, revealedFileInsights: insights.length } : row)),

  );

}



export async function runAnalystThinkingSteps(

  onStep: (step: string) => void,

  signal?: AbortSignal,

): Promise<void> {

  for (const step of ANALYST_THINKING_STEPS) {

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    onStep(step);

    await sleep(640, signal);

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

      await sleep(640, signal);

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

      await sleep(240, signal);

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


