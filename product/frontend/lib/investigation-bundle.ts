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

export async function loadInvestigationBundle(id: string): Promise<InvestigationBundle> {
  const [detail, report, findings, graph, proof, remediation, workbench] = await Promise.all([
    getInvestigation(id),
    getReport(id),
    getFindings(id),
    getGraph(id),
    getProof(id),
    getRemediation(id),
    getWorkbench(id).catch(() => null),
  ]);
  return { detail, report, findings, graph, proof, remediation, workbench };
}
