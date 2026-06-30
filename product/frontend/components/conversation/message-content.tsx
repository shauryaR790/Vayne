"use client";

import Link from "next/link";

import { parseMessageBlocks } from "@/lib/message-format";
import { cn } from "@/lib/utils";

function InlineLink({ label, href }: { label: string; href: string }) {
  const isExternal = href.startsWith("http");
  const className =
    "text-white/80 underline decoration-white/25 underline-offset-[5px] transition-colors hover:text-white hover:decoration-white/50";

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) {
      return <span key={`${keyPrefix}-${i}`}>{part}</span>;
    }
    return (
      <InlineLink key={`${keyPrefix}-${i}`} label={match[1]} href={match[2]} />
    );
  });
}

export function MessageContent({ text }: { text: string }) {
  const blocks = parseMessageBlocks(text);

  if (!blocks.length) {
    return (
      <p className="text-[16px] leading-[1.7] text-white/80">
        {renderInline(text, "plain")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "title":
            return (
              <h2
                key={i}
                className="text-[clamp(1.75rem,3vw,2.35rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-white"
              >
                {renderInline(block.text, `t-${i}`)}
              </h2>
            );

          case "lead":
            return (
              <p
                key={i}
                className="text-[18px] leading-[1.8] text-white/88"
              >
                {renderInline(block.text, `l-${i}`)}
              </p>
            );

          case "divider":
            return (
              <div
                key={i}
                className="h-px w-full max-w-[240px] bg-gradient-to-r from-white/25 via-white/10 to-transparent"
                aria-hidden
              />
            );

          case "section":
            return (
              <h3
                key={i}
                className="pt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45"
              >
                {block.label}
              </h3>
            );

          case "paragraph":
            return (
              <p
                key={i}
                className="text-[16px] leading-[1.7] text-white/78"
              >
                {renderInline(block.text, `p-${i}`)}
              </p>
            );

          case "bullets":
            return (
              <ul key={i} className="space-y-3 pl-0">
                {block.items.map((item, j) => (
                  <li
                    key={j}
                    className="flex gap-3 text-[16px] leading-[1.7] text-white/76"
                  >
                    <span className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-white/45" />
                    <span>{renderInline(item, `b-${i}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );

          case "numbered":
            return (
              <ol key={i} className="space-y-3 pl-0">
                {block.items.map((item, j) => (
                  <li
                    key={j}
                    className="flex gap-4 text-[16px] leading-[1.7] text-white/76"
                  >
                    <span className="w-5 shrink-0 text-[13px] font-medium tabular-nums text-white/35">
                      {j + 1}.
                    </span>
                    <span>{renderInline(item, `n-${i}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            );

          case "path":
            return (
              <div
                key={i}
                className="space-y-1 py-1 font-mono text-[15px] leading-[1.9] tracking-[0.01em] text-white/72"
              >
                {block.lines.map((line, j) => (
                  <p
                    key={j}
                    className={cn(
                      line.includes("↓") || line.includes("→")
                        ? "text-white/35"
                        : "text-white/82",
                    )}
                  >
                    {line}
                  </p>
                ))}
              </div>
            );

          case "emphasis":
            return (
              <div key={i} className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/38">
                  {block.label}
                </p>
                <p
                  className={cn(
                    block.tier === "large"
                      ? "text-[clamp(1.35rem,2vw,1.65rem)] font-medium tracking-[-0.01em] text-white"
                      : "text-[15px] text-white/65",
                  )}
                >
                  {block.value}
                </p>
              </div>
            );

          case "links":
            return (
              <div
                key={i}
                className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.08] pt-8"
              >
                {block.lines.map((line, j) => {
                  const match = line.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                  if (!match) return null;
                  return (
                    <InlineLink key={j} label={match[1]} href={match[2]} />
                  );
                })}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
