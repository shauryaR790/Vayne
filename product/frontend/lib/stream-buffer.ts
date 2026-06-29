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
