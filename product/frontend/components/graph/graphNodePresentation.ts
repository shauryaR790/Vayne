import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  Database,
  Globe,
  Layers,
  Package,
  Server,
  ShieldAlert,
  User,
  Waypoints,
} from "lucide-react";

import type { GraphEdge, GraphNode } from "@/lib/types";
import { formatGraphNodeLabel } from "@/lib/format";
import { normalizeGraphType, severityBorderColor } from "./graphUtils";

export function graphNodeIcon(type: string): LucideIcon {
  const t = type.toLowerCase();
  if (t.includes("endpoint") || t.startsWith("entry")) return Globe;
  if (t.includes("asset")) return Server;
  if (t.includes("service")) return Waypoints;
  if (t.includes("software")) return Package;
  if (t.includes("vuln") || t.includes("attack") || t.includes("verified")) return ShieldAlert;
  if (t.includes("user") || t.includes("identity")) return User;
  if (t.includes("database") || t.includes("data")) return Database;
  if (t.includes("cloud")) return Cloud;
  if (t.includes("group")) return Layers;
  return Server;
}

export function extractCves(node: GraphNode): string[] {
  const hay = `${node.id} ${node.label} ${(node.evidence ?? []).join(" ")}`;
  const matches = hay.match(/CVE-\d{4}-\d+/gi) ?? [];
  return [...new Set(matches.map((c) => c.toUpperCase()))];
}

export function severityLabel(node: GraphNode): string {
  const crit = String(node.criticality ?? "").toLowerCase();
  const risk = node.risk ?? 0;
  if (crit === "critical" || risk >= 8) return "Critical";
  if (crit === "high" || risk >= 6) return "High";
  if (risk >= 4) return "Medium";
  return "Low";
}

export function connectedAssetLabels(node: GraphNode, edges: GraphEdge[], nodes: GraphNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const labels = new Set<string>();
  for (const e of edges) {
    if (e.source === node.id) {
      const t = byId.get(e.target);
      if (t) labels.add(formatGraphNodeLabel(t.label).primary);
    }
    if (e.target === node.id) {
      const s = byId.get(e.source);
      if (s) labels.add(formatGraphNodeLabel(s.label).primary);
    }
  }
  return [...labels].slice(0, 8);
}

export function whyItMatters(node: GraphNode): string {
  if (node.evidence?.[0]) return node.evidence[0];
  const t = normalizeGraphType(node);
  if (t === "vulnerability") return "Links scanner evidence to a reachable exploit path.";
  if (t === "service") return "Exposed service that can bridge external access to internal assets.";
  if (t === "asset") return "Host in the blast radius of validated attack movement.";
  return "Evidence-linked entity in the validated attack graph.";
}

export function businessImpact(node: GraphNode): string {
  const radius = node.blast_radius;
  if (radius != null && radius > 0) {
    return `Blast radius spans ${radius} related entities if this step succeeds.`;
  }
  const risk = node.risk ?? 0;
  if (risk >= 7) return "High-risk pivot — compromise here accelerates lateral movement.";
  if (risk >= 4) return "Moderate exposure — contributes to path confidence but not sole impact.";
  return "Supporting node — contextual evidence for the broader attack chain.";
}

export function recommendedRemediation(node: GraphNode): string[] {
  const t = normalizeGraphType(node);
  const cves = extractCves(node);
  const items: string[] = [];
  if (cves.length) items.push(`Patch or mitigate ${cves.slice(0, 2).join(", ")} on affected assets.`);
  if (t === "service") items.push("Restrict exposure with firewall rules and disable unused services.");
  if (t === "vulnerability") items.push("Validate version fingerprints and deploy vendor fixes.");
  if (t === "asset") items.push("Segment host, enforce MFA for admin access, and monitor east-west traffic.");
  if (t === "endpoint") items.push("Reduce internet-facing attack surface and require VPN for admin paths.");
  if (!items.length) items.push("Correlate with findings and remove unnecessary trust relationships.");
  return items.slice(0, 3);
}

export function nodeBorderColor(node: GraphNode): string {
  return severityBorderColor(node);
}
