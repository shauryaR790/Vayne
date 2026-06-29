import {
  getFindings,
  getGraph,
  getInvestigation,
  getProof,
  getRemediation,
  getReport,
} from "./api";
import type {
  FindingsData,
  GraphData,
  InvestigationDetail,
  InvestigationReport,
  RemediationData,
} from "./types";

export interface InvestigationBundle {
  detail: InvestigationDetail;
  report: InvestigationReport;
  findings: FindingsData;
  graph: GraphData;
  proof: string;
  remediation: RemediationData;
}

export async function loadInvestigationBundle(id: string): Promise<InvestigationBundle> {
  const [detail, report, findings, graph, proof, remediation] = await Promise.all([
    getInvestigation(id),
    getReport(id),
    getFindings(id),
    getGraph(id),
    getProof(id),
    getRemediation(id),
  ]);
  return { detail, report, findings, graph, proof, remediation };
}
