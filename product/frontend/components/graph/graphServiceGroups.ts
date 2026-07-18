import type { GraphEdge, GraphNode } from "@/lib/types";
import { normalizeGraphType, serviceGroupKey } from "./graphUtils";

export interface ServiceGroup {
  id: string;
  key: string;
  label: string;
  memberIds: string[];
  maxRisk: number;
}

export function detectServiceGroups(nodes: GraphNode[]): ServiceGroup[] {
  const byKey = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    if (normalizeGraphType(node) !== "service") continue;
    const key = serviceGroupKey(node);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(node);
  }

  const groups: ServiceGroup[] = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    groups.push({
      id: `group:service:${key.replace(/[^\w/-]/g, "_")}`,
      key,
      label: `${key} · ${members.length} services`,
      memberIds: members.map((m) => m.id),
      maxRisk: Math.max(...members.map((m) => m.risk ?? 0)),
    });
  }
  return groups;
}

export function applyServiceGrouping(
  nodes: GraphNode[],
  edges: GraphEdge[],
  groups: ServiceGroup[],
  expandedGroups: Set<string>,
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hiddenNodeIds: Set<string>;
  memberToGroup: Map<string, string>;
} {
  const hiddenNodeIds = new Set<string>();
  const memberToGroup = new Map<string, string>();
  const displayNodes: GraphNode[] = [];
  const groupedMemberIds = new Set<string>();

  for (const group of groups) {
    for (const id of group.memberIds) memberToGroup.set(id, group.id);
    if (expandedGroups.has(group.id)) continue;
    for (const id of group.memberIds) {
      groupedMemberIds.add(id);
      hiddenNodeIds.add(id);
    }
    displayNodes.push({
      id: group.id,
      label: group.label,
      type: "group",
      risk: group.maxRisk,
      group: group.key,
      evidence: [`${group.memberIds.length} repeated services collapsed`],
    });
  }

  for (const node of nodes) {
    if (groupedMemberIds.has(node.id)) continue;
    displayNodes.push(node);
  }

  const remap = (id: string): string => {
    if (hiddenNodeIds.has(id)) return memberToGroup.get(id) ?? id;
    return id;
  };

  const edgeMap = new Map<string, GraphEdge>();
  for (const edge of edges) {
    const source = remap(edge.source);
    const target = remap(edge.target);
    if (source === target) continue;
    const key = `${source}::${target}::${edge.relationship ?? ""}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { ...edge, source, target });
    }
  }

  return {
    nodes: displayNodes,
    edges: [...edgeMap.values()],
    hiddenNodeIds,
    memberToGroup,
  };
}
