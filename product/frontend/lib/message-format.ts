/** Parse analyst prose into render blocks — no markdown document chrome. */

export type MessageBlock =
  | { type: "title"; text: string }
  | { type: "lead"; text: string }
  | { type: "divider" }
  | { type: "section"; label: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "path"; lines: string[] }
  | { type: "emphasis"; label: string; value: string; tier: "large" | "small" }
  | { type: "links"; lines: string[] };

const DIVIDER_RE = /^[━─\-–—]{6,}\s*$/;
const SECTION_RE = /^[A-Z][A-Z0-9 &/:'\-]{2,48}$/;
const BULLET_RE = /^[•\-\*]\s+(.+)$/;
const NUMBERED_RE = /^\d+\.\s+(.+)$/;
const EMPHASIS_RE = /^(Business risk|Confidence|Risk level|Attack surface|Severity):\s*(.+)$/i;
const PATH_RE = /[↓→]|(?:\s->\s)/;

function isLinkLine(line: string): boolean {
  return /^\[[^\]]+\]\([^)]+\)$/.test(line.trim());
}

function flushParagraph(lines: string[], blocks: MessageBlock[]) {
  const text = lines.join("\n").trim();
  lines.length = 0;
  if (text) blocks.push({ type: "paragraph", text });
}

function flushBullets(items: string[], blocks: MessageBlock[]) {
  if (items.length) blocks.push({ type: "bullets", items: [...items] });
  items.length = 0;
}

function flushNumbered(items: string[], blocks: MessageBlock[]) {
  if (items.length) blocks.push({ type: "numbered", items: [...items] });
  items.length = 0;
}

function flushPath(lines: string[], blocks: MessageBlock[]) {
  if (lines.length) blocks.push({ type: "path", lines: [...lines] });
  lines.length = 0;
}

export function parseMessageBlocks(text: string): MessageBlock[] {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const blocks: MessageBlock[] = [];
  const lines = raw.split("\n");

  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbered: string[] = [];
  let pathLines: string[] = [];
  let inPath = false;
  let titleSet = false;
  let leadCount = 0;
  let footerStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (inPath) {
        flushPath(pathLines, blocks);
        inPath = false;
      }
      flushBullets(bullets, blocks);
      flushNumbered(numbered, blocks);
      flushParagraph(paragraph, blocks);
      continue;
    }

    if (isLinkLine(trimmed) && footerStart === -1) {
      footerStart = i;
      break;
    }

    if (DIVIDER_RE.test(trimmed)) {
      if (inPath) {
        flushPath(pathLines, blocks);
        inPath = false;
      }
      flushBullets(bullets, blocks);
      flushNumbered(numbered, blocks);
      flushParagraph(paragraph, blocks);
      blocks.push({ type: "divider" });
      continue;
    }

    const emphasis = trimmed.match(EMPHASIS_RE);
    if (emphasis) {
      if (inPath) {
        flushPath(pathLines, blocks);
        inPath = false;
      }
      flushBullets(bullets, blocks);
      flushNumbered(numbered, blocks);
      flushParagraph(paragraph, blocks);
      const label = emphasis[1];
      const value = emphasis[2].trim();
      const tier =
        /business risk|risk level|severity/i.test(label) ? "large" : "small";
      blocks.push({ type: "emphasis", label, value, tier });
      continue;
    }

    if (SECTION_RE.test(trimmed)) {
      if (inPath) {
        flushPath(pathLines, blocks);
        inPath = false;
      }
      flushBullets(bullets, blocks);
      flushNumbered(numbered, blocks);
      flushParagraph(paragraph, blocks);
      blocks.push({ type: "section", label: trimmed });
      continue;
    }

    const bullet = trimmed.match(BULLET_RE);
    if (bullet) {
      if (inPath) {
        flushPath(pathLines, blocks);
        inPath = false;
      }
      flushParagraph(paragraph, blocks);
      flushNumbered(numbered, blocks);
      bullets.push(bullet[1]);
      continue;
    }

    const num = trimmed.match(NUMBERED_RE);
    if (num) {
      if (inPath) {
        flushPath(pathLines, blocks);
        inPath = false;
      }
      flushParagraph(paragraph, blocks);
      flushBullets(bullets, blocks);
      numbered.push(num[1]);
      continue;
    }

    if (PATH_RE.test(trimmed) || inPath) {
      flushParagraph(paragraph, blocks);
      flushBullets(bullets, blocks);
      flushNumbered(numbered, blocks);
      inPath = true;
      pathLines.push(trimmed);
      continue;
    }

    if (inPath) {
      flushPath(pathLines, blocks);
      inPath = false;
    }

    if (!titleSet && blocks.length === 0 && paragraph.length === 0) {
      if (trimmed.length < 80 && !SECTION_RE.test(trimmed)) {
        blocks.push({ type: "title", text: trimmed });
        titleSet = true;
        continue;
      }
    }

    if (
      titleSet &&
      paragraph.length === 0 &&
      bullets.length === 0 &&
      numbered.length === 0 &&
      leadCount < 3 &&
      trimmed.length < 160 &&
      !SECTION_RE.test(trimmed)
    ) {
      blocks.push({ type: "lead", text: trimmed });
      leadCount++;
      continue;
    }

    if (
      !titleSet &&
      blocks.length === 0 &&
      paragraph.length === 0 &&
      leadCount < 2 &&
      trimmed.length < 160
    ) {
      blocks.push({ type: "lead", text: trimmed });
      leadCount++;
      continue;
    }

    paragraph.push(trimmed);
  }

  if (inPath) flushPath(pathLines, blocks);
  flushBullets(bullets, blocks);
  flushNumbered(numbered, blocks);
  flushParagraph(paragraph, blocks);

  if (footerStart >= 0) {
    const footerLines = lines.slice(footerStart).map((l) => l.trim()).filter(Boolean);
    if (footerLines.length) blocks.push({ type: "links", lines: footerLines });
  }

  return blocks;
}
