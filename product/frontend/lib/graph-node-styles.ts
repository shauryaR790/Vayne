/** Node dimensions and glow palette for the attack graph. */

export const NODE_SIZE: Record<string, { width: number; height: number }> = {
  endpoint: { width: 120, height: 56 },
  asset: { width: 140, height: 60 },
  service: { width: 132, height: 58 },
  software: { width: 140, height: 60 },
  vulnerability: { width: 156, height: 64 },
  attack: { width: 160, height: 64 },
  verified: { width: 160, height: 64 },
  rejected: { width: 150, height: 60 },
  secondary: { width: 120, height: 48 },
  unknown: { width: 132, height: 58 },
};

export const NODE_GLOW: Record<string, { color: string; label: string }> = {
  endpoint: { color: "#d4d4d8", label: "ENTRY" },
  asset: { color: "#e4e4e7", label: "ASSET" },
  service: { color: "#a1a1aa", label: "SERVICE" },
  software: { color: "#d4d4d8", label: "SOFTWARE" },
  vulnerability: { color: "#fafafa", label: "VULNERABILITY" },
  attack: { color: "#ffffff", label: "ATTACK" },
  verified: { color: "#ffffff", label: "VERIFIED" },
  rejected: { color: "#737373", label: "REJECTED" },
  secondary: { color: "#52525b", label: "EVIDENCE" },
  unknown: { color: "#71717a", label: "NODE" },
};

export const TIMELINE_STEPS = [
  { id: "internet", label: "Internet", types: ["endpoint"] },
  { id: "asset", label: "Asset", types: ["asset"] },
  { id: "service", label: "Service", types: ["service"] },
  { id: "software", label: "Software", types: ["software"] },
  { id: "vulnerability", label: "Vulnerability", types: ["vulnerability"] },
  { id: "exploit", label: "Exploit", types: ["attack", "verified"] },
  { id: "impact", label: "Impact", types: ["rejected"] },
] as const;

export function nodeSizeForType(type: string, secondary?: boolean): { width: number; height: number } {
  if (secondary) return NODE_SIZE.secondary;
  const t = type.toLowerCase();
  if (t.includes("reject")) return NODE_SIZE.rejected;
  if (t.includes("attack") || t.includes("verified")) return NODE_SIZE.attack;
  return NODE_SIZE[t] ?? NODE_SIZE.unknown;
}

export function glowForType(type: string, secondary?: boolean): { color: string; label: string } {
  if (secondary) return NODE_GLOW.secondary;
  const t = type.toLowerCase();
  if (t.includes("reject")) return NODE_GLOW.rejected;
  if (t.includes("attack") || t.includes("verified")) return NODE_GLOW.verified;
  return NODE_GLOW[t] ?? NODE_GLOW.unknown;
}
