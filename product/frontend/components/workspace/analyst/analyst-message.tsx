"use client";

import { useMemo } from "react";

import { CursorAgentActivity } from "@/components/shared/cursor-agent-activity";
import { EngineFileDetailBox } from "@/components/workspace/engine-file-detail-box";
import { AnalystMarkdown } from "@/components/workspace/analyst/analyst-markdown";
import type { AgentActivityFeed } from "@/lib/analyst-activity";
import { buildThinkMicroScript, createActivityLine, initActivityFeed } from "@/lib/analyst-activity";
import type { AnalystStreamSegment } from "@/lib/analyst-segments";
import { buildSegmentRenderPlan } from "@/lib/analyst-stream";
import type { EngineFileInsight } from "@/lib/engine-file-insights";
import { cn } from "@/lib/utils";

export function UserMessage({ content }: { content: string; turn?: number }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] rounded-2xl bg-white/[0.06] px-3.5 py-2.5">
        <p className="text-[14px] leading-relaxed text-white whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

function AnalystThinkLine({
  label,
  detail,
  active,
  activity,
}: {
  label: string;
  detail?: string;
  active: boolean;
  activity?: AgentActivityFeed;
}) {
  if (active) {
    const feed =
      activity ??
      initActivityFeed(buildThinkMicroScript(label, detail), {
        waitingLabel: "Working through evidence",
      });
    return <CursorAgentActivity feed={feed} showHeader={false} className="py-0.5" />;
  }

  return (
    <p className="text-[12px] leading-snug text-white/32">
      <span className="text-white/42">{label}</span>
      {detail ? <span className="text-white/24">{` · ${detail}`}</span> : null}
    </p>
  );
}

function SegmentTimeline({
  segments,
  fileInsights,
  revealedSegments,
  segmentTexts,
  activeThinking,
  streaming,
}: {
  segments: AnalystStreamSegment[];
  fileInsights?: EngineFileInsight[];
  revealedSegments: number;
  segmentTexts?: string[];
  activeThinking?: { label: string; detail?: string; activity?: AgentActivityFeed } | null;
  streaming?: boolean;
}) {
  const normalizedSegments = useMemo(() => {
    if (!fileInsights?.length) return segments;
    const seenFileIds = new Set<string>();
    return segments.filter((segment) => {
      if (segment.type !== "file") return true;
      const insight = fileInsights[segment.fileIndex];
      if (!insight) return false;
      if (seenFileIds.has(insight.id)) return false;
      seenFileIds.add(insight.id);
      return true;
    });
  }, [segments, fileInsights]);

  const items = buildSegmentRenderPlan(normalizedSegments, {
    revealedSegments,
    segmentTexts,
    activeThinking,
    streaming,
  });

  if (!items.length && streaming) {
    return (
      <CursorAgentActivity
        feed={{
          title: "Reviewing investigation",
          lines: [createActivityLine("Pulling", "evidence into context", "active")],
          waitingLabel: "Working through evidence",
        }}
        showHeader={false}
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        if (item.kind === "think") {
          return (
            <AnalystThinkLine
              key={`think-${index}-${item.label}`}
              label={item.label}
              detail={item.detail}
              active={item.active}
              activity={item.activity}
            />
          );
        }

        if (item.kind === "file") {
          const insight = fileInsights?.[item.fileIndex];
          if (!insight) return null;
          return <EngineFileDetailBox key={`file-${insight.id}`} insight={insight} />;
        }

        if (!item.content.trim() && !item.streaming) return null;
        return (
          <AnalystMarkdown
            key={`text-${index}`}
            content={item.content}
            streaming={item.streaming}
            compact
          />
        );
      })}
    </div>
  );
}

/** One assistant turn — mixed think / file / text segments like a Cursor agent. */
export function AnalystMessage({
  content,
  streaming,
  fileInsights,
  revealedFileInsights,
  streamSegments,
  revealedSegments,
  segmentTexts,
  activeThinking,
}: {
  content: string;
  streaming?: boolean;
  turn?: number;
  fileInsights?: EngineFileInsight[];
  revealedFileInsights?: number;
  streamSegments?: AnalystStreamSegment[];
  revealedSegments?: number;
  segmentTexts?: string[];
  activeThinking?: { label: string; detail?: string; activity?: AgentActivityFeed } | null;
}) {
  if (streamSegments?.length) {
    return (
      <SegmentTimeline
        segments={streamSegments}
        fileInsights={fileInsights}
        revealedSegments={revealedSegments ?? (streaming ? 0 : streamSegments.length)}
        segmentTexts={segmentTexts}
        activeThinking={activeThinking}
        streaming={streaming}
      />
    );
  }

  const markerIdx = content.indexOf("\n\n**");
  const trimmed = content.trimStart();

  let leadText = "";
  let bodyText = "";
  if (markerIdx > 0) {
    leadText = content.slice(0, markerIdx);
    bodyText = content.slice(markerIdx + 2);
  } else if (trimmed && !trimmed.startsWith("**")) {
    leadText = content;
  } else {
    bodyText = content;
  }

  const totalBoxes = fileInsights?.length ?? 0;
  const revealedCount = revealedFileInsights ?? (streaming ? 0 : totalBoxes);
  const visibleBoxes = fileInsights?.slice(0, revealedCount) ?? [];

  const showLead = Boolean(leadText.trim());
  const showBoxes = visibleBoxes.length > 0;
  const showBody =
    Boolean(bodyText.trim()) ||
    (streaming && (showBoxes ? revealedCount >= totalBoxes : true) && !showLead);

  if (!showLead && !showBody && !showBoxes && !streaming) {
    return null;
  }

  return (
    <div className="max-w-full space-y-2">
      {showLead ? (
        <AnalystMarkdown
          content={leadText}
          streaming={streaming && !markerIdx && revealedCount === 0}
          compact
        />
      ) : null}
      {showBoxes ? (
        <div className="space-y-2">
          {visibleBoxes.map((insight) => (
            <EngineFileDetailBox key={insight.id} insight={insight} />
          ))}
        </div>
      ) : null}
      {showBody ? (
        <AnalystMarkdown
          content={bodyText}
          streaming={streaming && (!showBoxes || revealedCount >= totalBoxes || totalBoxes === 0)}
          compact
        />
      ) : null}
    </div>
  );
}

export function AnalystMessageDivider({ className }: { className?: string }) {
  return <div className={cn("h-3", className)} aria-hidden />;
}
