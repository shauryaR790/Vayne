"use client";

import { useMemo } from "react";

import type { CommandPaletteItem } from "@/lib/investigation-home";
import { INVESTIGATION_TEMPLATES, QUICK_INVESTIGATION_CHIPS } from "@/lib/investigation-home";
import { loadRecentInvestigations } from "@/lib/recent-investigations";
import {
  OPEN_EVIDENCE_EVENT,
  WORKSPACE_SHORTCUTS,
  dispatchWorkspaceEvent,
} from "@/lib/workspace-shortcuts";

export function useCommandPaletteItems({
  onNewInvestigation,
  onOpenInvestigation,
  onFocusAnalyst,
  onAnalyze,
  onShowShortcuts,
  onOpenCommandPalette,
  onSubmitPrompt,
  canAnalyze,
  paletteOpen,
}: {
  onNewInvestigation: () => void;
  onOpenInvestigation: (id: string) => void;
  onFocusAnalyst: () => void;
  onAnalyze: () => void;
  onShowShortcuts: () => void;
  onOpenCommandPalette: () => void;
  onSubmitPrompt: (prompt: string) => void;
  canAnalyze: boolean;
  paletteOpen: boolean;
}): CommandPaletteItem[] {
  return useMemo(() => {
    const recents = loadRecentInvestigations(8);
    const commands: CommandPaletteItem[] = WORKSPACE_SHORTCUTS.map((row) => ({
      id: `cmd-${row.action}`,
      kind: "command",
      label: row.action,
      shortcut: row.shortcut,
      keywords: [row.action, row.shortcut],
      action: () => {
        if (row.action === "New Investigation") onNewInvestigation();
        else if (row.action === "Open Evidence") dispatchWorkspaceEvent(OPEN_EVIDENCE_EVENT);
        else if (row.action === "Analyze Selected Evidence" && canAnalyze) onAnalyze();
        else if (row.action === "Ask VANE Analyst") onFocusAnalyst();
        else if (row.action === "Command Palette") onOpenCommandPalette();
        else if (row.action === "Keyboard Shortcuts") onShowShortcuts();
      },
    }));

    const investigations: CommandPaletteItem[] = recents.map((item) => ({
      id: `inv-${item.id}`,
      kind: "investigation",
      label: item.title || "Security Investigation",
      hint: item.sourceFile || item.id,
      keywords: [item.title, item.summary, item.sourceFile, item.id].filter(Boolean) as string[],
      action: () => onOpenInvestigation(item.id),
    }));

    const actions: CommandPaletteItem[] = QUICK_INVESTIGATION_CHIPS.map((chip) => ({
      id: `action-${chip.id}`,
      kind: "action",
      label: chip.label,
      hint: chip.needsEvidence ? "Needs evidence" : "Ask analyst",
      keywords: [chip.label, chip.prompt],
      action: () => onSubmitPrompt(chip.prompt),
    }));

    const templates: CommandPaletteItem[] = INVESTIGATION_TEMPLATES.map((template) => ({
      id: `template-${template.id}`,
      kind: "action",
      label: template.title,
      hint: template.description,
      keywords: [template.title, template.description, template.prompt],
      action: () => onSubmitPrompt(template.prompt),
    }));

    const searchHints: CommandPaletteItem[] = [
      {
        id: "search-hosts",
        kind: "search",
        label: "Search hosts (after investigation)",
        hint: "Upload evidence first",
        keywords: ["host", "ip", "asset"],
        action: onFocusAnalyst,
      },
      {
        id: "search-cve",
        kind: "search",
        label: "Search CVEs (after investigation)",
        hint: "Upload evidence first",
        keywords: ["cve", "vulnerability"],
        action: onFocusAnalyst,
      },
    ];

    return [...commands, ...investigations, ...actions, ...templates, ...searchHints];
  }, [
    canAnalyze,
    onAnalyze,
    onFocusAnalyst,
    onNewInvestigation,
    onOpenCommandPalette,
    onOpenInvestigation,
    onShowShortcuts,
    onSubmitPrompt,
    paletteOpen,
  ]);
}
