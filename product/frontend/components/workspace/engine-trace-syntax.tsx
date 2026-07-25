"use client";

import { cn } from "@/lib/utils";

const FN_NAMES = new Set([
  "round",
  "finding_confidence",
  "priority_score",
  "composite_priority_score",
  "min",
  "max",
  "abs",
]);

/**
 * Syntax-color a single Engine Trace expression using the trace keyword scheme:
 * keywords (tan), numbers (green), strings/notes (rose), fns (cyan),
 * on surfaces #1F1F1F / #1A3324 / #3B0A1E.
 */
export function TraceSyntaxText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = tokenize(text);
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, i) => (
        <span key={i} className={tokenClass(part.kind)}>
          {part.value}
        </span>
      ))}
    </span>
  );
}

type TokenKind = "keyword" | "number" | "string" | "fn" | "op" | "comment" | "plain";

function tokenClass(kind: TokenKind): string {
  switch (kind) {
    case "keyword":
      return "text-vx-trace-keyword";
    case "number":
      return "text-vx-trace-number";
    case "string":
      return "text-vx-trace-string";
    case "fn":
      return "text-vx-trace-fn";
    case "op":
      return "text-vx-trace-op";
    case "comment":
      return "text-vx-trace-comment";
    default:
      return "text-white/70";
  }
}

function tokenize(input: string): Array<{ kind: TokenKind; value: string }> {
  const out: Array<{ kind: TokenKind; value: string }> = [];
  const re =
    /(\([^)]*\))|(\b\d+\.\d+\b|\b\d+\b)|(\b[a-z_][a-z0-9_]*\b(?=\s*\())|(\b[a-z_][a-z0-9_]*\b)|([=×*+\-/])|(\s+)|(.)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m[1]) {
      out.push({ kind: "comment", value: m[1] });
    } else if (m[2]) {
      out.push({ kind: "number", value: m[2] });
    } else if (m[3]) {
      out.push({ kind: "fn", value: m[3] });
    } else if (m[4]) {
      const name = m[4];
      const lower = name.toLowerCase();
      if (FN_NAMES.has(lower)) out.push({ kind: "fn", value: name });
      else out.push({ kind: "keyword", value: name });
    } else if (m[5]) {
      out.push({ kind: "op", value: m[5] });
    } else if (m[6]) {
      out.push({ kind: "plain", value: m[6] });
    } else if (m[7]) {
      out.push({ kind: "plain", value: m[7] });
    }
  }
  return out.length ? out : [{ kind: "plain", value: input }];
}

/** Snake-ish identifier for formula contribution labels. */
export function toTraceKeyword(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
