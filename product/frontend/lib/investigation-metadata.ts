import type { InvestigationBundle } from "./investigation-bundle";
import type { FindingsData, InvestigationDetail, InvestigationReport } from "./types";

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface InvestigationCardMeta {
  title: string;
  summary: string;
  risk: RiskLevel;
  findingsHash: string;
  sourceFile?: string;
}

function truncate(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function looksLikeFilename(value?: string): boolean {
  if (!value?.trim()) return false;
  const v = value.trim();
  return /\.[a-z0-9]{2,5}$/i.test(v) || /^vayne[_-]/i.test(v) || /^[a-z0-9_-]+\.(xml|json|nessus|nmap)/i.test(v);
}

export function extractSourceFile(label?: string, report?: InvestigationReport): string | undefined {
  const raw = label?.trim() || report?.target?.trim();
  if (!raw) return undefined;
  const leaf = raw.split(/[/\\]/).pop()?.trim();
  return leaf || undefined;
}

function buildCorpus(
  detail: InvestigationDetail,
  report: InvestigationReport,
  findings: FindingsData,
): string {
  const techs: string[] = [];
  for (const asset of report.assets || []) {
    for (const t of (asset.technologies as string[]) || []) {
      if (t) techs.push(t);
    }
    const pt = asset.port_technologies as Record<string, string> | undefined;
    if (pt) Object.values(pt).forEach((v) => v && techs.push(v));
  }

  return [
    report.target,
    report.name,
    report.attack_surface_classification,
    ...detail.attack_paths.map(
      (p) => `${p.title} ${p.category} ${(p.mitre_tactics || []).join(" ")}`,
    ),
    ...findings.validated.flatMap((f) => [
      f.title,
      f.cve,
      f.host,
      f.classification,
      ...(f.reasoning || []),
    ]),
    ...techs,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

type TechLabel =
  | "Active Directory"
  | "SMB"
  | "Apache"
  | "Jenkins"
  | "Tomcat"
  | "Nginx"
  | "SSH"
  | "Database"
  | "Container Platform"
  | "Windows"
  | "Linux"
  | "Enterprise";

function detectTechnology(corpus: string): TechLabel | null {
  if (/kerberos|active.?directory|\bad\b|ldap|domain controller|ntlm/.test(corpus)) {
    return "Active Directory";
  }
  if (/eternalblue|ms17-010|\bsmb\b|smbv|samba/.test(corpus)) return "SMB";
  if (/jenkins/.test(corpus)) return "Jenkins";
  if (/\bapache\b|httpd/.test(corpus)) return "Apache";
  if (/tomcat/.test(corpus)) return "Tomcat";
  if (/nginx/.test(corpus)) return "Nginx";
  if (/\bssh\b|openssh/.test(corpus)) return "SSH";
  if (/mysql|postgres|mssql|mongodb|redis|database/.test(corpus)) return "Database";
  if (/kubernetes|k8s|docker|container/.test(corpus)) return "Container Platform";
  if (/\bwindows\b|win32|rdp/.test(corpus)) return "Windows";
  if (/\blinux\b|ubuntu|debian|centos/.test(corpus)) return "Linux";
  return null;
}

type ActivityKind =
  | "rce"
  | "lateral"
  | "credential"
  | "kerberos"
  | "external"
  | "chain"
  | "review";

function detectActivity(
  corpus: string,
  hasPaths: boolean,
): ActivityKind {
  if (/kerberos|as-rep|kerberoast|golden ticket|silver ticket/.test(corpus)) return "kerberos";
  if (/rce|remote code|code execution|exploit chain|command injection/.test(corpus)) return "rce";
  if (/lateral|pivot|relay|pass-the-hash|pass the hash|movement/.test(corpus)) return "lateral";
  if (/credential|password|secret|token|hash dump|leak/.test(corpus)) return "credential";
  if (/internet.?facing|external|perimeter|exposed|public/.test(corpus)) return "external";
  if (hasPaths) return "chain";
  return "review";
}

function isEnterpriseScope(
  corpus: string,
  report: InvestigationReport,
  findings: FindingsData,
): boolean {
  const assets = report.assets?.length ?? report.discovered_assets?.length ?? 0;
  const hosts = new Set(findings.validated.map((f) => f.host).filter(Boolean));
  return assets >= 4 || hosts.size >= 3 || /enterprise|multi.?tenant|org.?wide/.test(corpus);
}

function activityTitle(tech: TechLabel | null, activity: ActivityKind): string {
  const map: Record<ActivityKind, string> = {
    rce: "RCE Investigation",
    lateral: "Lateral Movement Assessment",
    credential: "Credential Exposure",
    kerberos: "Kerberos Attack Surface Review",
    external: "External Exposure",
    chain: "Attack Path Analysis",
    review: "Exposure Analysis",
  };

  if (tech === "Apache" && activity === "rce") return "Apache RCE Investigation";
  if (tech === "Apache" && activity === "review") return "Apache HTTP Service Review";
  if (tech === "SMB" && activity === "lateral") return "SMB Lateral Movement Assessment";
  if (tech === "Active Directory" && activity === "kerberos") {
    return "Kerberos Attack Surface Review";
  }
  if (tech === "Active Directory") return "Active Directory Exposure Analysis";
  if (tech === "Jenkins" && activity === "credential") return "Jenkins Credential Exposure";

  if (tech) {
    const suffix = map[activity] ?? "Exposure Analysis";
    if (suffix === "Exposure Analysis" || suffix === "Attack Path Analysis") {
      return `${tech} ${suffix}`;
    }
    return `${tech} ${suffix}`;
  }

  if (activity === "external") return "External Exposure Analysis";
  if (activity === "rce") return "Remote Code Execution Investigation";
  if (activity === "lateral") return "Lateral Movement Assessment";
  if (activity === "credential") return "Credential Exposure Analysis";
  if (activity === "chain") return "Validated Attack Path Analysis";
  return "Security Exposure Review";
}

function humanizePathTitle(pathTitle: string): string | null {
  const segment = pathTitle.split(/\s*→\s*|\s*>\s*/)[0]?.trim();
  if (!segment || segment.length > 56) return null;
  if (looksLikeFilename(segment)) return null;
  if (/^[a-z0-9@._-]+$/i.test(segment) && !/\s/.test(segment)) return null;
  return truncate(segment, 56);
}

export function generateInvestigationTitle(
  detail: InvestigationDetail,
  report: InvestigationReport,
  findings: FindingsData,
): string {
  const corpus = buildCorpus(detail, report, findings);
  const hasPaths = detail.attack_paths.length > 0;
  const tech = detectTechnology(corpus);
  const activity = detectActivity(corpus, hasPaths);

  if (isEnterpriseScope(corpus, report, findings) && (activity === "external" || activity === "rce")) {
    return "Enterprise External Exposure";
  }

  const pathTitle = detail.attack_paths[0]?.title;
  if (pathTitle) {
    const humanized = humanizePathTitle(pathTitle);
    if (humanized && !looksLikeFilename(humanized) && humanized.split(/\s+/).length >= 2) {
      return humanized;
    }
  }

  const engineName = detail.summary.name?.trim();
  if (engineName && !looksLikeFilename(engineName) && engineName.length > 8) {
    return truncate(engineName, 56);
  }

  const title = activityTitle(tech, activity);
  const primaryHost =
    findings.validated[0]?.host ||
    (report.assets?.[0] as { host?: string } | undefined)?.host ||
    (report.discovered_assets?.[0] as { host?: string } | undefined)?.host;
  if (primaryHost && /exposure analysis|attack path analysis|attack surface review/i.test(title)) {
    const shortHost = primaryHost.split(".")[0] || primaryHost;
    return `${title} · ${truncate(shortHost, 24)}`;
  }
  return title;
}

export function generateInvestigationSummary(
  detail: InvestigationDetail,
  report: InvestigationReport,
  findings: FindingsData,
): string {
  const path = detail.attack_paths[0];
  const finding = findings.validated[0];
  const corpus = buildCorpus(detail, report, findings);

  if (path?.title) {
    const tail = path.title.split(/\s*→\s*|\s*>\s*/).pop()?.trim();
    if (tail && tail.length <= 72) {
      if (/rce|exploit|execution/i.test(tail)) return truncate(`${tail} identified`, 72);
      if (/lateral|movement|pivot/i.test(tail)) return truncate(`${tail} discovered`, 72);
      return truncate(`Validated path: ${tail}`, 72);
    }
  }

  if (finding?.cve && /apache|httpd/i.test(corpus)) {
    return truncate(`Internet-facing ${finding.cve} exposure identified`, 72);
  }

  if (finding?.title) {
    const t = finding.title.trim();
    if (/rce|remote code|exploit/i.test(t)) return truncate(`${t} identified`, 72);
    if (/smb|eternalblue|legacy/i.test(t)) {
      return truncate("Legacy protocol exploitation path found", 72);
    }
    return truncate(t, 72);
  }

  if (detail.attack_paths.length > 0) {
    return "Validated exploitation chain discovered";
  }

  if (findings.validated.length > 0) {
    return truncate(`${findings.validated.length} retained finding${findings.validated.length === 1 ? "" : "s"} · surface mapped`, 72);
  }

  const rejected = report.stats.paths_rejected ?? 0;
  if (rejected > 0) {
    return truncate(`${rejected} candidate chain${rejected === 1 ? "" : "s"} rejected by evidence`, 72);
  }

  return "Attack surface mapped · no validated chain";
}

export function deriveRiskLevel(
  detail: InvestigationDetail,
  report: InvestigationReport,
): RiskLevel {
  const c = (report.attack_surface_classification || "").toLowerCase();
  const hasPaths = detail.attack_paths.length > 0;
  const critical = detail.summary.critical_count ?? report.stats.critical_count ?? 0;

  if (c.includes("critical") || critical > 0) return "CRITICAL";
  if (c.includes("high") || hasPaths) return "HIGH";
  if (c.includes("medium") || c.includes("moderate")) return "MEDIUM";
  if (c.includes("info")) return "INFO";
  if (c.includes("low")) return "LOW";
  return hasPaths ? "HIGH" : "LOW";
}

function simpleHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export function computeFindingsHash(
  detail: InvestigationDetail,
  report: InvestigationReport,
  findings: FindingsData,
): string {
  const payload = {
    paths: detail.attack_paths.map((p) => p.stable_id || p.id).sort(),
    findings: findings.validated
      .map((f) => f.id || f.title || f.cve)
      .filter(Boolean)
      .sort(),
    retained: report.stats.findings_retained,
    pathCount: detail.summary.path_count,
    score: report.attack_surface_score,
  };
  return simpleHash(JSON.stringify(payload));
}

export function buildInvestigationCardMeta(
  detail: InvestigationDetail,
  report: InvestigationReport,
  findings: FindingsData,
  sourceFileLabel?: string,
): InvestigationCardMeta {
  return {
    title: generateInvestigationTitle(detail, report, findings),
    summary: generateInvestigationSummary(detail, report, findings),
    risk: deriveRiskLevel(detail, report),
    findingsHash: computeFindingsHash(detail, report, findings),
    sourceFile: extractSourceFile(sourceFileLabel, report),
  };
}

export function buildInvestigationCardMetaFromBundle(
  bundle: InvestigationBundle,
  sourceFileLabel?: string,
): InvestigationCardMeta {
  return buildInvestigationCardMeta(
    bundle.detail,
    bundle.report,
    bundle.findings,
    sourceFileLabel,
  );
}

export function displayInvestigationTitle(entry: {
  title?: string;
  name?: string;
  headline?: string;
}): string {
  if (entry.title?.trim()) return entry.title;
  if (entry.name?.trim() && !looksLikeFilename(entry.name)) return entry.name;
  if (entry.headline?.trim() && !looksLikeFilename(entry.headline)) return entry.headline;
  return "Security Investigation";
}

export function displayInvestigationSummary(entry: {
  summary?: string;
  headline?: string;
}): string {
  return entry.summary?.trim() || entry.headline?.trim() || "Attack surface under review";
}

export function displayRiskLevel(entry: {
  risk?: RiskLevel | string;
  riskScore?: number;
  criticalCount?: number;
}): RiskLevel {
  if (entry.risk) {
    const r = String(entry.risk).toUpperCase();
    if (r === "CRITICAL" || r === "HIGH" || r === "MEDIUM" || r === "LOW" || r === "INFO") {
      return r as RiskLevel;
    }
  }
  if ((entry.criticalCount ?? 0) > 0) return "CRITICAL";
  if ((entry.riskScore ?? 0) >= 70) return "HIGH";
  if ((entry.riskScore ?? 0) >= 40) return "MEDIUM";
  return "LOW";
}
