/** Copy and workflow definitions for the investigation workspace homepage. */

export const COMPOSER_EXAMPLES = [
  "Correlate Nessus and Nuclei on the same host",
  "Why is this investigation ranked #1?",
  "What evidence contradicts this finding?",
  "What should I validate next?",
] as const;

export type QuickChipId =
  | "analyze_nmap"
  | "compare_reports"
  | "attack_graph"
  | "explain_findings"
  | "priority_ranking"
  | "false_positives"
  | "correlate_scanners"
  | "missing_evidence";

export interface QuickChip {
  id: QuickChipId;
  label: string;
  prompt: string;
  needsEvidence?: boolean;
}

export const QUICK_INVESTIGATION_CHIPS: QuickChip[] = [
  {
    id: "correlate_scanners",
    label: "Correlate Scanners",
    prompt:
      "Which investigations merged evidence from multiple scanners? Show agreement, conflicts, and what each tool contributed.",
    needsEvidence: true,
  },
  {
    id: "compare_reports",
    label: "Cross-Tool Evidence",
    prompt:
      "Compare scanner outputs and explain how VANE correlated them into investigations — not separate per-scanner summaries.",
    needsEvidence: true,
  },
  {
    id: "priority_ranking",
    label: "Why This Rank?",
    prompt:
      "Explain why the top investigation is ranked here — priority factors, business impact, exposure, and evidence strength.",
  },
  {
    id: "explain_findings",
    label: "Explain Investigation",
    prompt:
      "Explain the top investigation: what happened, why it matters, supporting evidence, contradictions, and unknowns.",
  },
  {
    id: "missing_evidence",
    label: "Missing Evidence",
    prompt:
      "What evidence is missing for the top investigation? What would increase or decrease confidence, and what should I collect?",
  },
  {
    id: "false_positives",
    label: "Contradictions",
    prompt:
      "What evidence contradicts the top investigation? How did the contradiction engine adjust confidence?",
  },
  {
    id: "attack_graph",
    label: "Evidence Graph",
    prompt:
      "Walk through the evidence graph — assets, findings, CVEs, and how graph traversal produced this investigation.",
  },
  {
    id: "analyze_nmap",
    label: "Validate Exposure",
    prompt:
      "From the evidence graph, what confirms or denies internet exposure and reachable services?",
    needsEvidence: true,
  },
];

export type InvestigationTemplateId =
  | "external_attack_surface"
  | "active_directory"
  | "cloud_exposure"
  | "web_app"
  | "internal_network"
  | "compliance";

export interface InvestigationTemplate {
  id: InvestigationTemplateId;
  title: string;
  description: string;
  prompt: string;
}

export const INVESTIGATION_TEMPLATES: InvestigationTemplate[] = [
  {
    id: "external_attack_surface",
    title: "External Attack Surface",
    description: "Internet exposure, correlated findings, and priority queue.",
    prompt:
      "Investigate external exposure from the evidence graph: reachable services, merged scanner findings, and top-priority investigations.",
  },
  {
    id: "active_directory",
    title: "Active Directory Review",
    description: "Identity paths, Kerberos/LDAP evidence, and blast radius.",
    prompt:
      "Review Active Directory investigations from correlated evidence: identity impact, lateral movement, and missing evidence.",
  },
  {
    id: "cloud_exposure",
    title: "Cloud Exposure",
    description: "Cloud resources, misconfigs, and cross-source correlation.",
    prompt:
      "Assess cloud exposure investigations: correlated misconfigs, public assets, and priority ranking rationale.",
  },
  {
    id: "web_app",
    title: "Web Application Assessment",
    description: "HTTP services, CVE correlation, and exploitability evidence.",
    prompt:
      "Focus on web application investigations: version/CVE correlation across scanners and analyst validation workflows.",
  },
  {
    id: "internal_network",
    title: "Internal Network Audit",
    description: "East-west reachability, dependencies, and graph paths.",
    prompt:
      "Audit internal network investigations: can-reach edges, blast radius, and what evidence would confirm pivot paths.",
  },
  {
    id: "compliance",
    title: "Compliance Review",
    description: "Evidence gaps, contradictions, and audit-ready workflows.",
    prompt:
      "Review investigations for compliance: missing evidence checklist, contradictions, and analyst workflows — not generic patch lists.",
  },
];

export type CommandPaletteItemKind = "command" | "investigation" | "action" | "search";

export interface CommandPaletteItem {
  id: string;
  kind: CommandPaletteItemKind;
  label: string;
  hint?: string;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
}
