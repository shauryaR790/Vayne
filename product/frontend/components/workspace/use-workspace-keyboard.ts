"use client";

import { useEffect } from "react";

import {
  COMMAND_PALETTE_EVENT,
  dispatchWorkspaceEvent,
  isEditableTarget,
  OPEN_EVIDENCE_EVENT,
  SHOW_SHORTCUTS_EVENT,
} from "@/lib/workspace-shortcuts";

export function useWorkspaceKeyboard({
  canAnalyze,
  workspaceEmpty,
  onNewInvestigation,
  onAnalyze,
  onFocusAnalyst,
  onCommandPalette,
  onShowShortcuts,
}: {
  canAnalyze: boolean;
  workspaceEmpty: boolean;
  onNewInvestigation: () => void;
  onAnalyze: () => void;
  onFocusAnalyst: () => void;
  onCommandPalette: () => void;
  onShowShortcuts: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const mod = event.metaKey || event.ctrlKey;

      if (mod && !event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        onNewInvestigation();
        return;
      }

      if (mod && !event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        dispatchWorkspaceEvent(OPEN_EVIDENCE_EVENT);
        return;
      }

      if (mod && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onFocusAnalyst();
        return;
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        onCommandPalette();
        return;
      }

      if (event.key === "/" && !mod && !event.shiftKey) {
        event.preventDefault();
        onCommandPalette();
        return;
      }

      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        onShowShortcuts();
        return;
      }

      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        workspaceEmpty &&
        canAnalyze &&
        !mod
      ) {
        event.preventDefault();
        onAnalyze();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canAnalyze,
    onAnalyze,
    onCommandPalette,
    onFocusAnalyst,
    onNewInvestigation,
    onShowShortcuts,
    workspaceEmpty,
  ]);
}

export function useWorkspaceShortcutEvents({
  onShowShortcuts,
  onCommandPalette,
}: {
  onShowShortcuts: () => void;
  onCommandPalette: () => void;
}) {
  useEffect(() => {
    const show = () => onShowShortcuts();
    const palette = () => onCommandPalette();
    window.addEventListener(SHOW_SHORTCUTS_EVENT, show);
    window.addEventListener(COMMAND_PALETTE_EVENT, palette);
    return () => {
      window.removeEventListener(SHOW_SHORTCUTS_EVENT, show);
      window.removeEventListener(COMMAND_PALETTE_EVENT, palette);
    };
  }, [onCommandPalette, onShowShortcuts]);
}
