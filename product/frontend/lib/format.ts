/** Display helpers — no inference, formatting only. */

export function formatCategory(category: string): string {
  return category.replace(/_/g, " ").toUpperCase();
}

export function formatClassification(c: string): string {
  return c.toUpperCase();
}

export function riskTone(risk: number): "danger" | "warning" | "success" {
  if (risk >= 8) return "danger";
  if (risk >= 6) return "warning";
  return "success";
}

export function confidenceTone(c: number): "success" | "warning" | "danger" {
  if (c >= 90) return "success";
  if (c >= 70) return "warning";
  return "danger";
}

export function categoryBadgeClass(category: string): string {
  if (category.includes("rce")) return "vx-badge-danger";
  if (category.includes("domain")) return "vx-badge-warning";
  if (category.includes("lateral")) return "vx-badge-neutral";
  return "vx-badge-neutral";
}

export function countByCategory(
  paths: Array<{ category: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of paths) {
    counts[p.category] = (counts[p.category] || 0) + 1;
  }
  return counts;
}

export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function nodeTypeColor(type: string): string {
  const map: Record<string, string> = {
    endpoint: "#71717a",
    asset: "#3B82F6",
    service: "#06b6d4",
    software: "#FFB224",
    vulnerability: "#FF4D4D",
    identity: "#FFB224",
    credential: "#FFB224",
    database: "#00C16A",
    data: "#00C16A",
  };
  return map[type] || "#71717a";
}

export function nodeTypeBackground(type: string): string {
  return "#0a0a0a";
}

export function findingBadgeClass(classification?: string, bucket?: string): string {
  const c = (classification || bucket || "").toLowerCase();
  if (c.includes("reject")) return "vx-badge-warning";
  if (c.includes("valid") || c.includes("confirm")) return "vx-badge-success";
  if (c.includes("observ")) return "vx-badge-info";
  if (c.includes("likely")) return "vx-badge-finding";
  return bucket === "rejected" ? "vx-badge-warning" : "vx-badge-success";
}

/** Compact graph node label — primary line + optional host suffix. */
export function formatGraphNodeLabel(label: string): {
  primary: string;
  secondary?: string;
} {
  const raw = label.trim();
  if (!raw) return { primary: "—" };

  const tail = raw.split("/").pop() || raw;
  const at = tail.split("@");
  if (at.length === 2) {
    return { primary: at[0], secondary: at[1] };
  }

  if (raw.length > 36) {
    const segments = raw.split("/");
    if (segments.length >= 2) {
      return {
        primary: segments.slice(-2).join("/"),
        secondary: segments.slice(0, -2).join("/") || undefined,
      };
    }
  }

  return { primary: tail.length < raw.length ? tail : raw };
}
