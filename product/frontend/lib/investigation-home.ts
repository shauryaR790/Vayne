/** Copy and workflow definitions for the investigation workspace homepage. */

export const COMPOSER_EXAMPLES = [
  "Analyze these Nmap scans",
  "Explain why this finding was retained",
  "Compare these Nessus reports",
  "Build an attack path",
] as const;

export type QuickChipId =
  | "analyze_nmap"
  | "compare_reports"
  | "attack_graph"
  | "explain_findings"
  | "executive_report"
  | "false_positives"
  | "correlate_scanners"
  | "threat_hunt";

export interface QuickChip {
  id: QuickChipId;
  label: string;
  prompt: string;
  needsEvidence?: boolean;
}

export const QUICK_INVESTIGATION_CHIPS: QuickChip[] = [
  {
    id: "analyze_nmap",
    label: "Analyze Nmap",
    prompt: "Analyze the uploaded Nmap scan evidence and summarize exposed services and risk.",
    needsEvidence: true,
  },
  {
    id: "compare_reports",
    label: "Compare Reports",
    prompt: "Compare the uploaded scanner reports and highlight agreement, conflicts, and gaps.",
    needsEvidence: true,
  },
  {
    id: "attack_graph",
    label: "Build Attack Graph",
    prompt: "Walk me through the validated attack paths and what evidence supports each step.",
  },
  {
    id: "explain_findings",
    label: "Explain Findings",
    prompt: "Explain the most significant retained finding and cite the evidence behind it.",
  },
  {
    id: "executive_report",
    label: "Executive Report",
    prompt: "Give me an executive summary of this investigation for leadership.",
  },
  {
    id: "false_positives",
    label: "Review False Positives",
    prompt: "Which findings look like false positives and what evidence would confirm or reject them?",
  },
  {
    id: "correlate_scanners",
    label: "Correlate Scanners",
    prompt: "Correlate findings across scanners and show where versions or severities disagree.",
    needsEvidence: true,
  },
  {
    id: "threat_hunt",
    label: "Threat Hunt",
    prompt: "Based on the evidence, what attacker behaviors should I hunt for next?",
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
    description: "Internet-facing hosts, open ports, and exposure paths.",
    prompt:
      "Investigate external attack surface exposure: internet-reachable services, critical findings, and likely entry points.",
  },
  {
    id: "active_directory",
    title: "Active Directory Review",
    description: "Kerberos, LDAP, SMB, and identity attack paths.",
    prompt:
      "Review Active Directory exposure from this evidence: Kerberos, LDAP, SMB signing, and lateral movement risk.",
  },
  {
    id: "cloud_exposure",
    title: "Cloud Exposure",
    description: "Misconfigurations and public cloud assets.",
    prompt:
      "Assess cloud exposure and misconfiguration risk from the uploaded evidence.",
  },
  {
    id: "web_app",
    title: "Web Application Assessment",
    description: "HTTP services, CVEs, and exploitable web paths.",
    prompt:
      "Focus on web application findings: version exposure, CVE mapping, and realistic exploit paths.",
  },
  {
    id: "internal_network",
    title: "Internal Network Audit",
    description: "East-west movement and internal service risk.",
    prompt:
      "Audit internal network exposure: lateral movement paths, weak services, and pivot opportunities.",
  },
  {
    id: "compliance",
    title: "Compliance Review",
    description: "Control gaps, evidence quality, and audit posture.",
    prompt:
      "Review this investigation for compliance gaps, missing evidence, and audit-ready remediation priorities.",
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
