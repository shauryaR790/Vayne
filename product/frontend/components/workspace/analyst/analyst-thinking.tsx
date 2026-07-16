"use client";

import { CursorAgentActivity } from "@/components/shared/cursor-agent-activity";
import { CursorLoadingStatus } from "@/components/shared/cursor-loading-status";
import type { AgentActivityFeed } from "@/lib/analyst-activity";
import { cn } from "@/lib/utils";

export function AnalystThinking({
  feed,
  step,
  className,
}: {
  feed?: AgentActivityFeed | null;
  /** @deprecated use feed */
  step?: string | null;
  className?: string;
}) {
  if (feed?.lines.length) {
    return <CursorAgentActivity feed={feed} className={cn(className)} />;
  }

  if (!step) return null;

  return (
    <CursorLoadingStatus
      className={cn(className)}
      lines={[
        { label: step },
        { label: "Waiting for analyst model", dim: true },
      ]}
    />
  );
}
