import type { GraphData, GraphEdge, GraphNode, WorkbenchData } from "@/lib/types";
import { normalizeGraphType } from "@/components/graph/layoutEngine";

export type PlaybackPhase = "idle" | "playing" | "paused" | "complete";

export interface AttackPathStep {
  nodeId: string;
  /** Edge from the previous step node to this one. */
  edgeKey: string | null;
  caption: string;
  type: string;
}

export interface AttackPathScript {
  steps: AttackPathStep[];
  title: string;
  confidence: number;
}

const TYPE_ORDER: Record<string, number> = {
  endpoint: 0,
  asset: 1,
  service: 2,
  software: 3,
  vulnerability: 4,
  attack: 5,
  verified: 6,
};

function nodeType(node: GraphNode): string {
  const raw = node as GraphNode & { node_type?: string };
  return (node.type || raw.node_type || normalizeGraphType(node)).toLowerCase();
}

function isValidatedEdge(e: GraphEdge): boolean {
  const rel = String(e.relationship ?? "").toLowerCase();
  const cat = String(e.category ?? "").toLowerCase();
  return !rel.includes("reject") && !cat.includes("reject");
}

function edgeKey(source: string, target: string): string {
  return `${source}::${target}`;
}

function shortCaption(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 45)}…`;
}

function findEntryNode(nodes: GraphNode[]): GraphNode | undefined {
  return (
    nodes.find((n) => n.id.startsWith("entry:")) ||
    nodes.find((n) => nodeType(n) === "endpoint")
  );
}

/** Longest validated chain from entry → impact (greedy DFS). */
function buildNodeChain(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const validated = edges.filter(isValidatedEdge);
  const adj = new Map<string, string[]>();

  for (const e of validated) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  for (const [, targets] of adj) {
    targets.sort((a, b) => {
      const ta = TYPE_ORDER[nodeType(nodeMap.get(a)!)] ?? 99;
      const tb = TYPE_ORDER[nodeType(nodeMap.get(b)!)] ?? 99;
      return ta - tb || a.localeCompare(b);
    });
  }

  const entry = findEntryNode(nodes);
  if (!entry) {
    return nodes
      .filter((n) => TYPE_ORDER[nodeType(n)] != null)
      .sort((a, b) => (TYPE_ORDER[nodeType(a)] ?? 99) - (TYPE_ORDER[nodeType(b)] ?? 99))
      .map((n) => n.id);
  }

  function walk(id: string, visited: Set<string>): string[] {
    let best: string[] = [id];
    for (const next of adj.get(id) || []) {
      if (visited.has(next)) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(next);
      const path = [id, ...walk(next, nextVisited)];
      if (path.length > best.length) best = path;
    }
    return best;
  }

  return walk(entry.id, new Set([entry.id]));
}

function mergeWorkbenchCaptions(
  chain: string[],
  nodeMap: Map<string, GraphNode>,
  workbench?: WorkbenchData,
): string[] {
  const validated = workbench?.candidate_paths.find((p) => p.status === "VALIDATED");
  const textSteps = validated?.steps ?? [];
  if (!textSteps.length) {
    return chain.map((id) => shortCaption(nodeMap.get(id)?.label || id));
  }

  return chain.map((id, i) => {
    const fromPath = textSteps[i]?.trim();
    if (fromPath) return shortCaption(fromPath);
    return shortCaption(nodeMap.get(id)?.label || id);
  });
}

export function buildAttackPathScript(
  graph: GraphData,
  workbench?: WorkbenchData,
): AttackPathScript | null {
  if (!graph.nodes.length) return null;

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const chain = buildNodeChain(graph.nodes, graph.edges);
  if (!chain.length) return null;

  const captions = mergeWorkbenchCaptions(chain, nodeMap, workbench);
  const validated = workbench?.candidate_paths.find((p) => p.status === "VALIDATED");

  const steps: AttackPathStep[] = chain.map((nodeId, i) => {
    const prev = i > 0 ? chain[i - 1] : null;
    return {
      nodeId,
      edgeKey: prev ? edgeKey(prev, nodeId) : null,
      caption: captions[i] || shortCaption(nodeMap.get(nodeId)?.label || nodeId),
      type: nodeType(nodeMap.get(nodeId)!),
    };
  });

  const title =
    validated?.steps.join(" → ") ||
    graph.nodes.find((n) => nodeType(n) === "vulnerability")?.label ||
    "Validated attack path";

  return {
    steps,
    title: shortCaption(title),
    confidence: validated?.confidence ?? 0,
  };
}

export function revealedThroughStep(
  script: AttackPathScript,
  stepIndex: number,
): { nodeIds: Set<string>; edgeKeys: Set<string> } {
  const nodeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  const limit = Math.max(0, stepIndex);

  for (let i = 0; i <= limit && i < script.steps.length; i++) {
    const step = script.steps[i];
    nodeIds.add(step.nodeId);
    if (step.edgeKey) edgeKeys.add(step.edgeKey);
  }

  return { nodeIds, edgeKeys };
}
