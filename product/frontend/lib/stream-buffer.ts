/** Batch rapid stream tokens into one React update per animation frame. */
export function createStreamBatcher(onFlush: (text: string) => void) {
  let buffer = "";
  let rafId: number | null = null;

  function flush() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    onFlush(buffer);
  }

  return {
    reset() {
      buffer = "";
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    append(token: string) {
      buffer += token;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        onFlush(buffer);
      });
    },
    finish() {
      flush();
    },
    get text() {
      return buffer;
    },
  };
}

const NEXT_SENTENCE =
  /^[\s\S]*?[.!?…]["')\]]*(?:\s+|$)|^[\s\S]*?\n\n/;

/**
 * Stream with natural rhythm: tokens flow live inside a sentence,
 * brief pause before the next completed sentence appears.
 * @deprecated Prefer createLineRevealBatcher for chat replies.
 */
export function createRhythmStreamBatcher(
  onFlush: (text: string) => void,
  options?: { pauseMs?: number },
) {
  const pauseMs = options?.pauseMs ?? 110;
  let buffer = "";
  let shown = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  function emit(text: string) {
    shown = text;
    onFlush(text);
  }

  function catchUp() {
    if (shown.length >= buffer.length) return;

    const ahead = buffer.slice(shown.length);
    const match = ahead.match(NEXT_SENTENCE);

    if (!match) {
      emit(buffer);
      return;
    }

    emit(shown + match[0]);
    if (shown.length < buffer.length) {
      timer = setTimeout(() => {
        timer = null;
        catchUp();
      }, pauseMs);
    }
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    reset() {
      buffer = "";
      shown = "";
      clearTimer();
    },
    append(token: string) {
      buffer += token;
      if (timer !== null) return;
      catchUp();
    },
    finish() {
      clearTimer();
      emit(buffer);
    },
    get text() {
      return buffer;
    },
  };
}

/**
 * Reveal streamed LLM text line-by-line with thinking-style holds.
 * Incomplete lines stay buffered until a newline (or finish).
 * Long paragraphs without newlines fall back to sentence chunks.
 */
export function createLineRevealBatcher(
  onFlush: (text: string) => void,
  options?: { linePauseMs?: number; sentencePauseMs?: number },
) {
  const linePauseMs = options?.linePauseMs ?? 140;
  const sentencePauseMs = options?.sentencePauseMs ?? 160;
  let buffer = "";
  let shown = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let finishing = false;
  let finishResolve: (() => void) | null = null;

  function emit(text: string) {
    shown = text;
    onFlush(text);
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function nextChunk(ahead: string): { chunk: string; pauseMs: number } | null {
    if (!ahead) return null;

    const nl = ahead.indexOf("\n");
    if (nl !== -1) {
      return { chunk: ahead.slice(0, nl + 1), pauseMs: linePauseMs };
    }

    const sentence = ahead.match(/^[\s\S]*?[.!?…]["')\]]*(?:\s+|$)/);
    if (sentence && (finishing || sentence[0].length >= 48)) {
      return { chunk: sentence[0], pauseMs: sentencePauseMs };
    }

    if (finishing) {
      return { chunk: ahead, pauseMs: 0 };
    }

    return null;
  }

  function tick() {
    timer = null;

    if (shown.length >= buffer.length) {
      if (finishing) {
        const resolve = finishResolve;
        finishResolve = null;
        finishing = false;
        resolve?.();
      }
      return;
    }

    const ahead = buffer.slice(shown.length);
    const next = nextChunk(ahead);

    if (!next) {
      // Wait for more tokens (or finish) before revealing a partial line.
      if (finishing) {
        emit(buffer);
        const resolve = finishResolve;
        finishResolve = null;
        finishing = false;
        resolve?.();
      }
      return;
    }

    emit(shown + next.chunk);

    if (shown.length < buffer.length) {
      timer = setTimeout(tick, next.pauseMs || linePauseMs);
      return;
    }

    if (finishing) {
      const resolve = finishResolve;
      finishResolve = null;
      finishing = false;
      resolve?.();
    }
  }

  function schedule(immediate = false) {
    if (timer !== null) return;
    if (immediate) {
      tick();
      return;
    }
    timer = setTimeout(tick, shown.length === 0 ? 40 : linePauseMs);
  }

  return {
    reset() {
      buffer = "";
      shown = "";
      finishing = false;
      finishResolve = null;
      clearTimer();
    },
    append(token: string) {
      buffer += token;
      if (timer !== null) return;
      const ahead = buffer.slice(shown.length);
      if (nextChunk(ahead)) {
        schedule(shown.length === 0);
      }
    },
    finish(): Promise<void> {
      return new Promise((resolve) => {
        finishing = true;
        if (shown.length >= buffer.length) {
          emit(buffer);
          finishing = false;
          resolve();
          return;
        }
        finishResolve = resolve;
        if (timer === null) schedule(true);
      });
    },
    get text() {
      return buffer;
    },
  };
}
