"use client";

import { EngineStatus, KnowledgeLead, KnowledgeSection, KnowledgeSeeAlso, MetricReadout } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "status", label: "Engine Status" },
  { id: "metrics", label: "Operational Metrics" },
];

const ENGINES = [
  { name: "Attack Engine", status: "ONLINE" },
  { name: "Graph Engine", status: "ONLINE" },
  { name: "Confidence Engine", status: "ONLINE" },
  { name: "Proof Engine", status: "ONLINE" },
  { name: "Analyst LLM", status: "BETA" },
  { name: "Report Engine", status: "ONLINE" },
  { name: "Memory Engine", status: "COMING SOON" },
];

const METRICS = [
  { label: "Engine Version", value: "0.9.4" },
  { label: "Model Version", value: "vayne-reason-1" },
  { label: "Rule Count", value: "2,847" },
  { label: "Exploit DB", value: "48,291" },
  { label: "Graph Nodes", value: "1.2M+" },
  { label: "Investigations", value: "12,408" },
  { label: "Confidence Evals", value: "891K" },
  { label: "Attack Chains", value: "34,102" },
];

export function SystemContent() {
  return (
    <KnowledgeShell
      title="System"
      subtitle="Operational status of VAYNE reasoning engines, model versions, and platform telemetry."
      classification="SYSTEM // OPERATIONAL STATUS"
      sections={TOC}
    >
      <div className="mb-10">
        <KnowledgeSeeAlso />
      </div>
      <KnowledgeSectionWrap id="status">
        <KnowledgeSection id="engine-status" title="Engine Status">
          <KnowledgeLead>
            Real-time operational readout of VAYNE subsystems. All core reasoning engines are
            online and processing investigations.
          </KnowledgeLead>
          <EngineStatus engines={ENGINES} />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="metrics">
        <KnowledgeSection id="platform-metrics" title="Operational Metrics">
          <KnowledgeLead>
            Platform telemetry aggregated across investigation runs, graph construction, and
            confidence evaluations.
          </KnowledgeLead>
          <MetricReadout metrics={METRICS} />
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
