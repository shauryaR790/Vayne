import type { InvestigationDetail, InvestigationReport } from "./types";

export const ENGINE_VERSION = "1.0.0";

export function countServices(report: InvestigationReport): number {
  const ports = new Set<string>();
  for (const asset of report.assets || []) {
    const pt = asset.port_technologies as Record<string, string> | undefined;
    if (pt) Object.keys(pt).forEach((p) => ports.add(p));
  }
  return ports.size;
}

export function countSoftware(report: InvestigationReport): number {
  const sw = new Set<string>();
  for (const asset of report.assets || []) {
    for (const t of (asset.technologies as string[]) || []) {
      if (t) sw.add(t);
    }
  }
  return sw.size;
}

export function avgConfidence(detail: InvestigationDetail): number {
  if (!detail.attack_paths.length) return 0;
  const sum = detail.attack_paths.reduce((a, p) => a + p.confidence, 0);
  return Math.round(sum / detail.attack_paths.length);
}

export function topRejectionReasons(report: InvestigationReport): string[] {
  const gp = report.graph_proof as Record<string, unknown>;
  const discovery = (gp?.path_discovery as Record<string, unknown>) || {};
  const reasons = (discovery.rejected_path_reasons as string[]) || [];
  if (reasons.length) return reasons.slice(0, 6);

  const rejected = (gp?.rejected_edges as Array<Record<string, unknown>>) || [];
  const fromEdges = rejected
    .map((e) => String(e.rejection_reason || e.reject_reason || e.reason || ""))
    .filter(Boolean);
  return [...new Set(fromEdges)].slice(0, 6);
}

export interface RejectedChain {
  steps: string[];
  reason: string;
}

function shortNodeId(id: string): string {
  const tail = id.split("/").pop() || id;
  return tail.split("@")[0].split(":").pop() || tail;
}

function pathToSteps(path: unknown): string[] {
  if (Array.isArray(path)) {
    return path.map(String).filter(Boolean);
  }
  const raw = String(path || "").trim();
  if (!raw) return [];
  if (raw.includes(",") && !/[→\->]/.test(raw)) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return raw.split(/\s*[→\->]\s*/).map((s) => s.trim()).filter(Boolean);
}

export function parseRejectedChains(report: InvestigationReport): RejectedChain[] {
  const gp = report.graph_proof as Record<string, unknown>;
  const discovery = (gp?.path_discovery as Record<string, unknown>) || {};
  const proofs = (discovery.rejected_path_proofs as Array<Record<string, unknown>>) || [];
  const chains: RejectedChain[] = [];

  for (const proof of proofs.slice(0, 6)) {
    const steps = pathToSteps(proof.path ?? proof.title);
    chains.push({
      steps: steps.length ? steps : ["internet", "unknown"],
      reason: String(proof.reason || proof.reject_reason || "insufficient evidence"),
    });
  }

  const rejectedEdges = (gp?.rejected_edges as Array<Record<string, unknown>>) || [];
  for (const edge of rejectedEdges.slice(0, 6 - chains.length)) {
    chains.push({
      steps: [shortNodeId(String(edge.source)), shortNodeId(String(edge.target))],
      reason: String(edge.reject_reason || edge.rejection_reason || "confidence below threshold"),
    });
  }

  const pruneReasons = discovery.search_prune_reasons as Record<string, number> | undefined;
  if (!chains.length && pruneReasons) {
    for (const [reason, count] of Object.entries(pruneReasons).slice(0, 3)) {
      chains.push({
        steps: ["internet", "candidate path"],
        reason: `${reason.replace(/_/g, " ")} (${count})`,
      });
    }
  }

  return chains;
}

export function collectMitreFromPaths(detail: InvestigationDetail): string[] {
  const set = new Set<string>();
  for (const p of detail.attack_paths) {
    for (const t of p.mitre_tactics || []) set.add(t);
  }
  return Array.from(set).slice(0, 8);
}

export function avgRisk(detail: InvestigationDetail): number {
  if (!detail.attack_paths.length) return 0;
  const sum = detail.attack_paths.reduce((a, p) => a + p.risk, 0);
  return Math.round((sum / detail.attack_paths.length) * 10) / 10;
}

export function proofTimelineSteps(report: InvestigationReport) {
  const gp = report.graph_proof as Record<string, unknown>;
  const discovery = (gp?.path_discovery as Record<string, unknown>) || {};
  const stats = report.stats;

  return [
    {
      id: "discovery",
      title: "Discovery",
      detail: `${(gp?.nodes as unknown[])?.length ?? 0} nodes discovered`,
      data: gp?.nodes,
    },
    {
      id: "fingerprint",
      title: "Fingerprinting",
      detail: `${countSoftware(report)} software fingerprints`,
      data: report.assets,
    },
    {
      id: "vulnerability",
      title: "Vulnerability Mapping",
      detail: `${stats.observed} observed findings`,
      data: null,
    },
    {
      id: "exploit",
      title: "Exploit Intelligence",
      detail: `${stats.likely_exploitable + stats.confirmed} mapped exploits`,
      data: null,
    },
    {
      id: "enumeration",
      title: "Path Generation",
      detail: `${discovery.paths_explored ?? stats.paths_explored ?? stats.attack_paths} paths explored`,
      data: discovery,
    },
    {
      id: "validation",
      title: "Validation",
      detail: `${stats.attack_paths} verified · ${stats.paths_rejected ?? 0} rejected`,
      data: gp?.rejected_edges,
    },
    {
      id: "confidence",
      title: "Confidence",
      detail: JSON.stringify(stats.confidence_distribution || {}),
      data: report.attack_surface_proof,
    },
    {
      id: "verdict",
      title: "Final Verdict",
      detail: `${report.attack_surface_classification} · ${report.attack_surface_score}/100`,
      data: report.attack_surface_proof,
    },
  ];
}
