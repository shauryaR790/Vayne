import {
  getFindings,
  getGraph,
  getInvestigation,
  getProof,
  getRemediation,
  getReport,
  getWorkbench,
} from "./api";
import type {
  FindingsData,
  GraphData,
  InvestigationDetail,
  InvestigationReport,
  RemediationData,
  WorkbenchData,
} from "./types";

export interface InvestigationBundle {
  detail: InvestigationDetail;
  report: InvestigationReport;
  findings: FindingsData;
  graph: GraphData;
  proof: string;
  remediation: RemediationData;
  workbench: WorkbenchData | null;
}

const EMPTY_GRAPH: GraphData = {
  nodes: [],
  edges: [],
  attack_paths: [],
  statistics: {},
};

const EMPTY_REMEDIATION: RemediationData = {
  items: [],
  total_items: 0,
};

type BundleListener = (bundle: InvestigationBundle) => void;

interface BundleEntry {
  promise: Promise<InvestigationBundle>;
  listeners: Set<BundleListener>;
  latest?: InvestigationBundle;
}

const bundleCache = new Map<string, BundleEntry>();

function emit(entry: BundleEntry, bundle: InvestigationBundle) {
  entry.latest = bundle;
  for (const listener of entry.listeners) {
    listener(bundle);
  }
}

function partialBundle(
  detail: InvestigationDetail,
  report: InvestigationReport,
  findings: FindingsData,
): InvestigationBundle {
  return {
    detail,
    report,
    findings,
    graph: EMPTY_GRAPH,
    proof: "",
    remediation: EMPTY_REMEDIATION,
    workbench: null,
  };
}

async function fetchInvestigationBundle(id: string, entry: BundleEntry): Promise<InvestigationBundle> {
  const detail = await getInvestigation(id);
  const [report, findings] = await Promise.all([getReport(id), getFindings(id)]);

  let current = partialBundle(detail, report, findings);
  emit(entry, current);

  const [workbench, graph, proof, remediation] = await Promise.all([
    getWorkbench(id).catch(() => null),
    getGraph(id).catch(() => EMPTY_GRAPH),
    getProof(id).catch(() => ""),
    getRemediation(id).catch(() => EMPTY_REMEDIATION),
  ]);

  let resolvedGraph = graph;
  const graphStage = workbench?.pipeline.find((stage) => stage.id === "graph");
  const graphNodesHint = Number(graphStage?.detail?.match(/(\d+)\s+nodes?/i)?.[1] || 0);
  if (!resolvedGraph.nodes.length && graphNodesHint > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    resolvedGraph = await getGraph(id).catch(() => EMPTY_GRAPH);
  }

  current = {
    ...current,
    workbench,
    graph: resolvedGraph,
    proof,
    remediation,
  };
  emit(entry, current);
  return current;
}

function getOrCreateEntry(id: string): BundleEntry {
  const existing = bundleCache.get(id);
  if (existing) return existing;

  const entry: BundleEntry = {
    listeners: new Set(),
    promise: Promise.resolve({} as InvestigationBundle),
  };

  entry.promise = fetchInvestigationBundle(id, entry).catch((error) => {
    bundleCache.delete(id);
    throw error;
  });

  bundleCache.set(id, entry);
  return entry;
}

function attachListener(entry: BundleEntry, onUpdate: BundleListener) {
  entry.listeners.add(onUpdate);
  if (entry.latest) onUpdate(entry.latest);
  void entry.promise.then(onUpdate).catch(() => undefined);
}

/** Loads investigation artifacts with staged hydration — core data first, graph/workbench after. */
export function loadInvestigationBundle(
  id: string,
  onUpdate?: BundleListener,
): Promise<InvestigationBundle> {
  const entry = getOrCreateEntry(id);
  if (onUpdate) attachListener(entry, onUpdate);
  return entry.promise;
}

export function subscribeInvestigationBundle(
  id: string,
  onUpdate: BundleListener,
): () => void {
  const entry = getOrCreateEntry(id);
  attachListener(entry, onUpdate);
  return () => {
    bundleCache.get(id)?.listeners.delete(onUpdate);
  };
}

export function primeInvestigationBundle(id: string, bundle: InvestigationBundle): void {
  bundleCache.set(id, {
    listeners: new Set(),
    promise: Promise.resolve(bundle),
    latest: bundle,
  });
}

export function clearInvestigationBundleCache(id?: string): void {
  if (id) bundleCache.delete(id);
  else bundleCache.clear();
}
