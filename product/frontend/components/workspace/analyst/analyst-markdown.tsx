"use client";

import Link from "next/link";

import {
  BlockNode,
  InlineNode,
  classifyInlineCode,
  classifyShellToken,
  parseAnalystMarkdown,
  tokenizeShellLine,
} from "@/lib/analyst-markdown";
import { cn } from "@/lib/utils";

function InlineCode({ value }: { value: string }) {
  const kind = classifyInlineCode(value);
  return (
    <code
      className={cn(
        "vx-md-inline-code",
        kind === "path" && "vx-md-code-path",
        kind === "api" && "vx-md-code-api",
        kind === "fn" && "vx-md-code-fn",
        kind === "log" && "vx-md-code-log",
        kind === "default" && "vx-md-code-default",
      )}
    >
      {value}
    </code>
  );
}

function InlineLink({ label, href }: { label: string; href: string }) {
  const className = "vx-md-link";
  if (href.startsWith("http")) {
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

function InlineContent({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return <span key={i}>{node.value}</span>;
          case "bold":
            return (
              <strong key={i} className="font-semibold text-white">
                {node.value}
              </strong>
            );
          case "code":
            return <InlineCode key={i} value={node.value} />;
          case "link":
            return <InlineLink key={i} label={node.label} href={node.href} />;
          default:
            return null;
        }
      })}
    </>
  );
}

function ShellLine({ line }: { line: string }) {
  const tokens = tokenizeShellLine(line);
  if (!tokens.length) return <span>{"\n"}</span>;

  return (
    <>
      {tokens.map((token, i) => {
        const kind = classifyShellToken(token, i);
        return (
          <span
            key={i}
            className={cn(
              kind === "cmd" && "vx-md-shell-cmd",
              kind === "flag" && "vx-md-shell-flag",
              kind === "path" && "vx-md-shell-path",
              kind === "default" && "vx-md-shell-default",
            )}
          >
            {i > 0 ? " " : ""}
            {token}
          </span>
        );
      })}
    </>
  );
}

function CodeBlock({ language, content }: { language?: string; content: string }) {
  const lines = content.split("\n");
  const isShell =
    !language ||
    /^(bash|sh|shell|powershell|ps1|zsh|cmd)$/i.test(language) ||
    /^(python|uvicorn|npm|node)\b/.test(content.trim());

  return (
    <pre className="vx-md-code-block">
      <code className="vx-md-code-block-inner">
        {lines.map((line, i) => (
          <span key={i} className="block">
            {isShell ? <ShellLine line={line} /> : line || "\u00a0"}
            {i < lines.length - 1 ? "\n" : null}
          </span>
        ))}
      </code>
    </pre>
  );
}

function Block({ block, index }: { block: BlockNode; index: number }) {
  switch (block.type) {
    case "section":
      return (
        <div className={cn("vx-md-section", index > 0 && "vx-md-section-divider")}>
          <h3 className="text-[15px] font-semibold leading-snug text-white">{block.title}</h3>
        </div>
      );

    case "paragraph":
      return (
        <p className="text-[14px] leading-[1.75] text-white/85">
          <InlineContent nodes={block.inline} />
        </p>
      );

    case "bullets":
      return (
        <ul className="vx-md-list space-y-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-[1.7] text-white/85">
              <span className="vx-md-bullet mt-[0.55rem] shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <InlineContent nodes={item} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "numbered":
      return (
        <ol className="vx-md-list space-y-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-[1.7] text-white/85">
              <span className="vx-md-number mt-px shrink-0 tabular-nums">{i + 1}.</span>
              <span className="min-w-0 flex-1">
                <InlineContent nodes={item} />
              </span>
            </li>
          ))}
        </ol>
      );

    case "code":
      return <CodeBlock language={block.language} content={block.content} />;

    default:
      return null;
  }
}

export function AnalystMarkdown({
  content,
  streaming,
  compact,
}: {
  content: string;
  streaming?: boolean;
  compact?: boolean;
}) {
  const blocks = parseAnalystMarkdown(content, streaming);

  if (!blocks.length) {
    return (
      <p
        className={cn(
          "leading-[1.7] text-white/85 whitespace-pre-wrap",
          compact ? "text-[13px]" : "text-[14px]",
        )}
      >
        {content}
        {streaming ? (
          <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-white/60 align-middle" />
        ) : null}
      </p>
    );
  }

  return (
    <div className={cn("vx-analyst-md", compact ? "space-y-2" : "space-y-3")}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} index={i} />
      ))}
      {streaming ? (
        <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-white/60 align-middle" />
      ) : null}
    </div>
  );
}
