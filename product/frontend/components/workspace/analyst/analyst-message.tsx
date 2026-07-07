"use client";

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

export function AnalystMessage({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
  turn?: number;
}) {
  return (
    <div className="max-w-full">
      <p className="text-[14px] leading-[1.75] text-vx-body whitespace-pre-wrap">
        {content}
        {streaming ? (
          <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-white/60 align-middle" />
        ) : null}
      </p>
    </div>
  );
}

export function AnalystMessageDivider({ className }: { className?: string }) {
  return <div className={cn("h-4", className)} aria-hidden />;
}
