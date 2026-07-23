/** Parse Cursor-style markdown for analyst chat messages. */

import { stripLeadingEnumeration } from "@/lib/workbench-report-helpers";

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; label: string; href: string };

export type BlockNode =
  | { type: "section"; title: string }
  | { type: "paragraph"; inline: InlineNode[] }
  | { type: "bullets"; items: InlineNode[][] }
  | { type: "numbered"; items: InlineNode[][] }
  | { type: "code"; language?: string; content: string };

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const SECTION_BOLD_RE = /^\*\*([^*]+)\*\*\s*$/;
const SECTION_BOLD_INLINE_RE = /^(\*\*[^*]+\*\*)\s*[—–-]\s*(.+)$/;
const SECTION_HASH_RE = /^#{1,3}\s+(.+)$/;
const BULLET_RE = /^[-*•]\s+(.+)$/;
const NUMBERED_RE = /^\d+[.)]\s+(.+)$/;

/** Coerce common LLM plain-text patterns into parseable markdown. */
export function normalizeAnalystMarkdown(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");

  // Inline section labels (single paragraph) → proper markdown sections
  const promotions: [RegExp, string][] = [
    [/\sWhat happened:\s+/gi, "\n\n**What happened**\n"],
    [/\sWhy I believe it:\s+/gi, "\n\n**Why VAYNE believes it**\n"],
    [/\sWhy VAYNE believes it:\s+/gi, "\n\n**Why VAYNE believes it**\n"],
    [/\sCertainty:\s+/gi, "\n\n**How certain**\n"],
    [/\sHow certain:\s+/gi, "\n\n**How certain**\n"],
    [/\sNext steps:\s+/gi, "\n\n**Next steps**\n"],
    [/\sNext:\s+/gi, "\n\n**Next steps**\n"],
    [/\sMissing evidence:\s+/gi, "\n\n**Missing evidence**\n"],
  ];
  for (const [pattern, replacement] of promotions) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/^What happened:\s*/im, "**What happened**\n");

  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      out.push("");
      continue;
    }

    // 1) item → 1. item
    line = line.replace(/^(\s*)(\d+)\)\s+/, "$1$2. ");

    // • bullet → - bullet
    line = line.replace(/^(\s*)[•·‣▪]\s+/, "$1- ");

    const t = line.trim();

    // Bare section title (no markdown) on its own line → **Title**
    if (
      !t.startsWith("**") &&
      !t.startsWith("#") &&
      !BULLET_RE.test(t) &&
      !NUMBERED_RE.test(t) &&
      !t.startsWith("```") &&
      isBareSectionLine(t)
    ) {
      out.push(`**${t}**`);
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

function isBareSectionLine(line: string): boolean {
  if (line.length < 3 || line.length > 56) return false;
  if (/[.!?;:]$/.test(line)) return false;
  if (/^[\-*#\d`\\[]/.test(line)) return false;
  if (line.includes(",") && line.length > 28) return false;
  // Title-like: words only, often starts capitalized
  if (!/^[A-Z]/.test(line)) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9 '\-/()&]+$/.test(line)) return false;
  // Common analyst section labels or short labels
  if (
    /^(what|why|how|cause|fixes|fix|next|try|evidence|confidence|summary|answer|recommendation|if\b)/i.test(
      line,
    )
  ) {
    return true;
  }
  // Short label without being a full sentence
  return line.split(/\s+/).length <= 7 && !/\b(is|are|was|were|the|this|that)\b/i.test(line);
}

export function classifyInlineCode(code: string): "path" | "api" | "fn" | "log" | "default" {
  const trimmed = code.trim();
  if (/^\/api\b|^\/[a-z][\w/-]*/i.test(trimmed)) return "api";
  if (
    /[\\/]/.test(trimmed) ||
    /\.(py|tsx?|jsx?|json|css|md|txt|svg|png|js|mjs|cjs|yaml|yml|toml|env)$/i.test(trimmed)
  ) {
    return "path";
  }
  if (/^[A-Za-z_][\w.]*$/.test(trimmed) && (/[A-Z]/.test(trimmed) || trimmed.includes("_"))) {
    return "fn";
  }
  if (/^(Response|GET|POST|PUT|DELETE|PATCH|Error|Warning|INFO|DEBUG)\b/i.test(trimmed)) {
    return "log";
  }
  return "default";
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      nodes.push({ type: "text", value: text.slice(last, index) });
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push({ type: "bold", value: token.slice(2, -2) });
    } else if (token.startsWith("`")) {
      nodes.push({ type: "code", value: token.slice(1, -1) });
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        nodes.push({ type: "link", label: linkMatch[1], href: linkMatch[2] });
      } else {
        nodes.push({ type: "text", value: token });
      }
    }

    last = index + token.length;
  }

  if (last < text.length) {
    nodes.push({ type: "text", value: text.slice(last) });
  }

  return nodes.length ? nodes : [{ type: "text", value: text }];
}

function parseBlocks(lines: string[]): BlockNode[] {
  const blocks: BlockNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbered: string[] = [];
  let lastSectionTitle = "";

  const flushParagraph = () => {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text) blocks.push({ type: "paragraph", inline: parseInline(text) });
  };

  const flushBullets = () => {
    if (bullets.length) {
      blocks.push({ type: "bullets", items: bullets.map((item) => parseInline(item)) });
      bullets = [];
    }
  };

  const flushNumbered = () => {
    if (numbered.length) {
      blocks.push({ type: "numbered", items: numbered.map((item) => parseInline(item)) });
      numbered = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushBullets();
      flushNumbered();
      flushParagraph();
      continue;
    }

    const boldSection = trimmed.match(SECTION_BOLD_RE);
    if (boldSection) {
      flushBullets();
      flushNumbered();
      flushParagraph();
      const title = stripLeadingEnumeration(boldSection[1].trim());
      if (title.toLowerCase() !== lastSectionTitle.toLowerCase()) {
        blocks.push({ type: "section", title });
        lastSectionTitle = title;
      }
      continue;
    }

    const boldSectionInline = trimmed.match(SECTION_BOLD_INLINE_RE);
    if (boldSectionInline) {
      flushBullets();
      flushNumbered();
      flushParagraph();
      const title = stripLeadingEnumeration(boldSectionInline[1].slice(2, -2).trim());
      if (title.toLowerCase() !== lastSectionTitle.toLowerCase()) {
        blocks.push({ type: "section", title });
        lastSectionTitle = title;
      }
      blocks.push({ type: "paragraph", inline: parseInline(boldSectionInline[2].trim()) });
      continue;
    }

    const hashSection = trimmed.match(SECTION_HASH_RE);
    if (hashSection) {
      flushBullets();
      flushNumbered();
      flushParagraph();
      const title = stripLeadingEnumeration(hashSection[1].trim());
      if (title.toLowerCase() !== lastSectionTitle.toLowerCase()) {
        blocks.push({ type: "section", title });
        lastSectionTitle = title;
      }
      continue;
    }

    const bullet = trimmed.match(BULLET_RE);
    if (bullet) {
      flushParagraph();
      flushNumbered();
      bullets.push(bullet[1]);
      continue;
    }

    const num = trimmed.match(NUMBERED_RE);
    if (num) {
      flushParagraph();
      flushBullets();
      numbered.push(stripLeadingEnumeration(num[1]));
      continue;
    }

    flushBullets();
    flushNumbered();
    paragraph.push(trimmed);
  }

  flushBullets();
  flushNumbered();
  flushParagraph();
  return blocks;
}

export function parseAnalystMarkdown(text: string, streaming = false): BlockNode[] {
  const raw = normalizeAnalystMarkdown(text);
  if (!raw.trim()) return [];

  const fenceRe = /```(\w*)\n?([\s\S]*?)```/g;
  const blocks: BlockNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index);
    if (before.trim()) {
      blocks.push(...parseBlocks(before.split("\n")));
    }

    const language = match[1] || undefined;
    const content = match[2].replace(/\n$/, "");
    blocks.push({ type: "code", language, content });
    lastIndex = match.index + match[0].length;
  }

  let tail = raw.slice(lastIndex);
  if (streaming && tail.includes("```")) {
    const open = tail.lastIndexOf("```");
    const head = tail.slice(0, open);
    if (head.trim()) {
      blocks.push(...parseBlocks(head.split("\n")));
    }
    const partial = tail.slice(open + 3);
    const langMatch = partial.match(/^(\w*)\n?([\s\S]*)$/);
    if (langMatch) {
      blocks.push({
        type: "code",
        language: langMatch[1] || undefined,
        content: langMatch[2],
      });
    }
    return blocks;
  }

  if (tail.trim()) {
    blocks.push(...parseBlocks(tail.split("\n")));
  }

  return blocks;
}

export type ShellTokenKind = "cmd" | "flag" | "path" | "default";

export function classifyShellToken(token: string, index: number): ShellTokenKind {
  const bare = token.replace(/^['"]|['"]$/g, "");
  if (
    index === 0 &&
    /^(python|node|npm|npx|uvicorn|cd|pip|powershell|bash|sh|curl|git)$/i.test(bare)
  ) {
    return "cmd";
  }
  if (/^-{1,2}[\w-]+$/.test(bare) || bare === "-m") return "flag";
  if (/[\\/:.]/.test(bare)) return "path";
  return "default";
}

export function tokenizeShellLine(line: string): string[] {
  return line.match(/("[^"]*"|'[^']*'|\S+)/g) ?? (line ? [line] : []);
}
