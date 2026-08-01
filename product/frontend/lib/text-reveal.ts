export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function revealText(
  fullText: string,
  onUpdate: (partial: string) => void,
  options?: {
    charsPerTick?: number;
    tickMs?: number;
    paragraphPauseMs?: number;
    signal?: AbortSignal;
  },
): Promise<void> {
  const charsPerTick = options?.charsPerTick ?? 2;
  const tickMs = options?.tickMs ?? 18;
  const paragraphPauseMs = options?.paragraphPauseMs ?? 280;
  let index = 0;
  let lastParagraphEnd = 0;

  while (index < fullText.length) {
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    index = Math.min(fullText.length, index + charsPerTick);
    onUpdate(fullText.slice(0, index));

    const slice = fullText.slice(0, index);
    if (slice.endsWith("\n\n") && index - lastParagraphEnd > 40) {
      lastParagraphEnd = index;
      await sleep(paragraphPauseMs, options?.signal);
    } else {
      await sleep(tickMs, options?.signal);
    }
  }

  onUpdate(fullText);
}

/**
 * Think-then-type reveal: never dumps a full reply in one paint.
 * Hard newlines pause longer; long lines are bitten into ~8-word chunks.
 */
export async function revealLines(
  fullText: string,
  onUpdate: (partial: string) => void,
  options?: {
    linePauseMs?: number;
    wordGroupPauseMs?: number;
    wordsPerBite?: number;
    signal?: AbortSignal;
  },
): Promise<void> {
  const linePauseMs = options?.linePauseMs ?? 180;
  const wordGroupPauseMs = options?.wordGroupPauseMs ?? 75;
  const wordsPerBite = options?.wordsPerBite ?? 8;

  if (!fullText) {
    onUpdate("");
    return;
  }

  const lines = fullText.replace(/\r\n/g, "\n").split("\n");
  let acc = "";

  for (let i = 0; i < lines.length; i++) {
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (i > 0) acc += "\n";

    const line = lines[i];
    if (!line) {
      onUpdate(acc);
    } else {
      const tokens = line.split(/(\s+)/);
      let lineBuilt = "";
      let wordsInBite = 0;

      for (let t = 0; t < tokens.length; t++) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        lineBuilt += tokens[t];
        if (tokens[t].trim()) wordsInBite += 1;

        const atEnd = t === tokens.length - 1;
        if (wordsInBite >= wordsPerBite || atEnd) {
          onUpdate(acc + lineBuilt);
          wordsInBite = 0;
          if (!atEnd) {
            await sleep(wordGroupPauseMs, options?.signal);
          }
        }
      }
      acc += line;
    }

    if (i < lines.length - 1) {
      await sleep(linePauseMs, options?.signal);
    }
  }

  onUpdate(fullText);
}
