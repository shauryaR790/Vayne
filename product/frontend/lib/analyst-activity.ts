import type { InvestigationBundle } from "@/lib/investigation-bundle";

export interface AgentActivityLine {
  id: string;
  verb: string;
  detail?: string;
  state: "active" | "done";
}

export interface AgentActivityFeed {
  title?: string;
  subtitle?: string;
  lines: AgentActivityLine[];
  waitingLabel?: string;
}

let activityId = 0;

function lineId(): string {
  activityId += 1;
  return `act-${activityId}`;
}

export function createActivityLine(
  verb: string,
  detail?: string,
  state: "active" | "done" = "active",
): AgentActivityLine {
  return { id: lineId(), verb, detail, state };
}

/** Cursor-style chat preamble while the LLM responds. */
export function buildChatActivityScript(
  question: string,
  bundle?: InvestigationBundle | null,
): Omit<AgentActivityLine, "id" | "state">[] {
  const q = question.toLowerCase();
  const hasInv = Boolean(bundle);
  const findings = bundle?.workbench?.confirmed_findings.length ?? 0;
  const paths = bundle?.detail.attack_paths.length ?? 0;

  const scripts: Omit<AgentActivityLine, "id" | "state">[] = [];

  if (hasInv) {
    scripts.push({
      verb: "Searching",
      detail: bundle?.report.name?.trim() || "investigation context",
    });
  } else {
    scripts.push({ verb: "Searching", detail: "cybersecurity knowledge base" });
  }

  if (/path|chain|exploit|attack/.test(q)) {
    scripts.push({
      verb: "Grepped",
      detail: `attack_paths|candidate_paths|graph${hasInv ? " in investigation" : ""}`,
    });
    scripts.push({ verb: "Tracing", detail: "validated exploitation chain" });
  } else if (/finding|cve|vuln|evidence|retain/.test(q)) {
    scripts.push({
      verb: "Grepped",
      detail: `findings|evidence|confidence${hasInv ? ` · ${findings} retained` : ""}`,
    });
  } else if (/fix|remed|next|should/.test(q)) {
    scripts.push({ verb: "Grepped", detail: "recommendations|missing_evidence|next_actions" });
  } else if (hasInv) {
    scripts.push({
      verb: "Grepped",
      detail: `workbench|findings|paths · ${findings} findings · ${paths} paths`,
    });
  }

  scripts.push({ verb: "Drafting", detail: "analyst response" });
  return scripts;
}

/** Micro-steps shown during a briefing think pause. */
export function buildThinkMicroScript(
  label: string,
  detail?: string,
): Omit<AgentActivityLine, "id" | "state">[] {
  const lower = label.toLowerCase();

  if (lower.includes("inspecting evidence")) {
    return [
      { verb: "Opening", detail: "evidence queue" },
      { verb: "Scanning", detail: detail || "uploaded artifacts" },
      { verb: "Indexing", detail: "file contributions" },
    ];
  }

  if (lower.includes("reading")) {
    const file = detail?.split(" · ")[0] || detail || "artifact";
    const tool = detail?.includes(" · ") ? detail.split(" · ")[1] : undefined;
    return [
      { verb: "Reading", detail: file },
      { verb: "Parsing", detail: tool ? `${tool} output` : "scan output" },
      { verb: "Extracting", detail: "retained signals" },
    ];
  }

  if (lower.includes("parsing")) {
    return [
      { verb: "Parsing", detail: detail || "scan output" },
      { verb: "Normalizing", detail: "host and service rows" },
      { verb: "Matching", detail: "correlation keys" },
    ];
  }

  if (lower.includes("cross-correlating")) {
    return [
      { verb: "Correlating", detail: detail || "multi-source evidence" },
      { verb: "Grepped", detail: "findings|services|software across files" },
      { verb: "Weighing", detail: "cross-source matches" },
    ];
  }

  if (lower.includes("weighing confidence")) {
    return [
      { verb: "Reading", detail: "confidence factors" },
      { verb: "Computing", detail: "proof scores" },
      { verb: "Explaining", detail: "engine conclusions" },
    ];
  }

  return [
    { verb: label.replace(/\.\.\.$/, "").trim(), detail },
    { verb: "Working through", detail: "investigation evidence" },
  ].filter((row) => row.verb);
}

export function initActivityFeed(
  script: Omit<AgentActivityLine, "id" | "state">[],
  options?: { title?: string; subtitle?: string; waitingLabel?: string },
): AgentActivityFeed {
  const first = script[0];
  return {
    title: options?.title,
    subtitle: options?.subtitle,
    waitingLabel: options?.waitingLabel ?? "Waiting for analyst model",
    lines: first ? [createActivityLine(first.verb, first.detail, "active")] : [],
  };
}

export function advanceActivityFeed(feed: AgentActivityFeed, script: Omit<AgentActivityLine, "id" | "state">[], step: number): AgentActivityFeed {
  const capped = Math.min(step, script.length - 1);
  const lines: AgentActivityLine[] = [];

  for (let i = 0; i <= capped; i++) {
    const item = script[i];
    lines.push(
      createActivityLine(item.verb, item.detail, i === capped ? "active" : "done"),
    );
  }

  return { ...feed, lines };
}

export function finalizeActivityFeed(feed: AgentActivityFeed): AgentActivityFeed {
  return {
    ...feed,
    lines: feed.lines.map((line) => ({ ...line, state: "done" as const })),
  };
}
