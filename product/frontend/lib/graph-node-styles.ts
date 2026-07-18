/** Attack graph node dimensions and presentation tokens. */

export const GRAPH_NODE_WIDTH = 196;
export const GRAPH_NODE_HEIGHT = 88;

export const NODE_SIZE: Record<string, { width: number; height: number }> = {
  endpoint: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  asset: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  service: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  software: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  vulnerability: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  attack: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  verified: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  rejected: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  secondary: { width: GRAPH_NODE_WIDTH, height: 72 },
  unknown: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  group: { width: GRAPH_NODE_WIDTH, height: 76 },
  user: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  database: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
  cloud: { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT },
};

export function nodeSizeForType(type: string, secondary?: boolean): { width: number; height: number } {
  if (secondary) return NODE_SIZE.secondary;
  const t = type.toLowerCase();
  if (t.includes("reject")) return NODE_SIZE.rejected;
  if (t.includes("attack") || t.includes("verified")) return NODE_SIZE.attack;
  if (t.includes("user") || t.includes("identity")) return NODE_SIZE.user;
  if (t.includes("database") || t.includes("data")) return NODE_SIZE.database;
  if (t.includes("cloud")) return NODE_SIZE.cloud;
  return NODE_SIZE[t] ?? NODE_SIZE.unknown;
}

export const TIMELINE_STEPS = [
  { id: "internet", label: "Internet", types: ["endpoint"] },
  { id: "asset", label: "Asset", types: ["asset"] },
  { id: "service", label: "Service", types: ["service"] },
  { id: "software", label: "Software", types: ["software"] },
  { id: "vulnerability", label: "Vulnerability", types: ["vulnerability"] },
  { id: "exploit", label: "Exploit", types: ["attack", "verified"] },
  { id: "impact", label: "Impact", types: ["rejected"] },
] as const;
