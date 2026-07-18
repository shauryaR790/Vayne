"use client";

import { useEffect } from "react";

export function useGraphKeyboard({
  enabled,
  onClearSelection,
  onOpenSearch,
  onFit,
  onZoomIn,
  onZoomOut,
}: {
  enabled: boolean;
  onClearSelection: () => void;
  onOpenSearch: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClearSelection();
        return;
      }
      if (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        onOpenSearch();
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        onFit();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        onZoomIn();
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        onZoomOut();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onClearSelection, onOpenSearch, onFit, onZoomIn, onZoomOut]);
}
