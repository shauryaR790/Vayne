export const WORKSPACE_SHORTCUTS = [
  { shortcut: "Ctrl/Cmd + N", action: "New Investigation" },
  { shortcut: "Ctrl/Cmd + O", action: "Open Evidence" },
  { shortcut: "Enter", action: "Analyze Selected Evidence" },
  { shortcut: "Ctrl/Cmd + K", action: "Ask VANE Analyst" },
  { shortcut: "Ctrl/Cmd + Shift + P", action: "Command Palette" },
  { shortcut: "?", action: "Keyboard Shortcuts" },
] as const;

export const SUPPORTED_FORMATS = [
  "Nmap",
  "Nessus",
  "OpenVAS",
  "Burp",
  "Nuclei",
  "XML",
  "JSON",
] as const;

export const OPEN_EVIDENCE_EVENT = "vane:open-evidence";
export const COMMAND_PALETTE_EVENT = "vane:command-palette";
export const SHOW_SHORTCUTS_EVENT = "vane:show-shortcuts";

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function dispatchWorkspaceEvent(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(name));
}
