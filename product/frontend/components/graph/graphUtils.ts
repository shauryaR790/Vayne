import type { GraphEdge, GraphNode } from "@/lib/types";

export function normalizeGraphType(node: GraphNode): string {
  const raw = node as GraphNode & { node_type?: string };
  const t = (node.type || raw.node_type || "").toLowerCase();
  if (t) return t;
  const id = node.id.toLowerCase();
  if (id.startsWith("entry:") || id.startsWith("exploit:") || id.startsWith("access:")) return "endpoint";
  if (id.startsWith("asset:")) return "asset";
  if (id.startsWith("service:")) return "service";
  if (id.startsWith("software:")) return "software";
  if (id.startsWith("vuln") || id.includes("cve")) return "vulnerability";
  if (id.startsWith("group:")) return "group";
  return "unknown";
}

export function isValidatedEdge(e: GraphEdge): boolean {
  const rel = String(e.relationship ?? "").toLowerCase();
  const cat = String(e.category ?? "").toLowerCase();
  return !rel.includes("reject") && !cat.includes("reject");
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  exposed_to: "EXPOSED",
  runs: "RUNS",
  version_may_affect: "AFFECTS",
  confirms_applicability: "TRUST",
  enables: "EXPLOITS",
  yields_access: "AUTH",
  lateral_movement: "LATERAL",
  lateral: "LATERAL",
  trusts: "TRUST",
  authenticates: "AUTH",
  exploits: "EXPLOITS",
  connects_to: "CONNECTS",
  hosts: "HOSTS",
  depends_on: "DEPENDS",
};

export function formatEdgeLabel(edge: GraphEdge): string {
  const key = String(edge.relationship ?? "").toLowerCase();
  if (RELATIONSHIP_LABELS[key]) return RELATIONSHIP_LABELS[key];
  const raw = String(edge.relationship ?? "linked").replace(/_/g, " ");
  return raw.toUpperCase();
}

export function severityBorderColor(node: GraphNode): string {
  const crit = String(node.criticality ?? "").toLowerCase();
  const risk = node.risk ?? 0;
  if (crit === "critical" || risk >= 8) return "#ef4444";
  if (crit === "high" || risk >= 6) return "#f97316";
  if (risk >= 4) return "#eab308";
  return "#3f3f46";
}

export function isCriticalNode(node: GraphNode): boolean {
  const crit = String(node.criticality ?? "").toLowerCase();
  return crit === "critical" || (node.risk ?? 0) >= 7;
}

export function isExploitableNode(node: GraphNode, edges: GraphEdge[]): boolean {
  const t = normalizeGraphType(node);
  if (["vulnerability", "attack", "verified"].includes(t)) return true;
  if (node.id.startsWith("exploit:")) return true;
  if (String(node.category ?? "").toLowerCase().includes("rce")) return true;
  return edges.some(
    (e) =>
      (e.source === node.id || e.target === node.id) &&
      ["enables", "yields_access", "exploits"].includes(String(e.relationship ?? "").toLowerCase()),
  );
}

export function isInternetFacingNode(node: GraphNode, edges: GraphEdge[]): boolean {
  if (node.id === "entry:internet" || node.label.toLowerCase() === "internet") return true;
  if (normalizeGraphType(node) === "endpoint" && node.id.startsWith("entry:")) return true;
  return edges.some(
    (e) =>
      e.target === node.id &&
      (e.source === "entry:internet" || e.source.startsWith("entry:")) &&
      String(e.relationship ?? "").toLowerCase().includes("expos"),
  );
}

export function isLateralMovementNode(node: GraphNode, edges: GraphEdge[]): boolean {
  const mitre = (node.mitre ?? []).join(" ").toLowerCase();
  if (mitre.includes("lateral") || mitre.includes("ta0008")) return true;
  return edges.some((e) => {
    if (e.source !== node.id && e.target !== node.id) return false;
    const rel = String(e.relationship ?? "").toLowerCase();
    return rel.includes("lateral");
  });
}

export function nodeMatchesSearch(node: GraphNode, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    node.id.toLowerCase().includes(q) ||
    node.label.toLowerCase().includes(q) ||
    normalizeGraphType(node).includes(q)
  );
}

export function serviceGroupKey(node: GraphNode): string | null {
  if (normalizeGraphType(node) !== "service") return null;
  const label = node.label || node.id;
  const at = label.indexOf("@");
  const head = at >= 0 ? label.slice(0, at) : label;
  const portMatch = head.match(/:(\d+)$/);
  if (portMatch) {
    const protoMatch = head.match(/\/(tcp|udp|sctp)\//i);
    return `${(protoMatch?.[1] ?? "tcp").toLowerCase()}/${portMatch[1]}`;
  }
  return head.replace(/^service\//i, "");
}
