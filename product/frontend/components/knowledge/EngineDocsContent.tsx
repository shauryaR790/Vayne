"use client";

import {
  BulletGrid,
  KnowledgeLead,
  KnowledgeSection,
  TerminalBlock,
} from "@/components/knowledge/primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "@/components/knowledge/KnowledgeShell";

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "confidence", label: "Confidence" },
  { id: "priority", label: "Priority" },
  { id: "scanner-agreement", label: "Scanner Agreement" },
  { id: "graph", label: "Attack Graph" },
  { id: "glossary", label: "Glossary" },
];

export function EngineDocsContent() {
  return (
    <KnowledgeShell
      title="Engine Documentation"
      subtitle="Permanent reference for formulas, weights, and algorithms implemented by the deterministic investigation engine. This is documentation — not live execution."
      classification="ENGINE // FORMULA REFERENCE"
      sections={TOC}
    >
      <KnowledgeSectionWrap id="overview">
        <KnowledgeSection id="overview-lead" title="Deterministic Investigation Engine">
          <KnowledgeLead>
            VAYNE&apos;s investigation engine is a deterministic pipeline: parser → normalizer →
            correlator → validator → confidence → attack graph → priority → investigation export.
            Live values appear in Engine Trace only while a formula is evaluated. This page documents
            those formulas permanently.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "All scores originate from backend computation",
              "Engine Trace shows formulas only when executed",
              "AI interpretation runs after the deterministic engine completes",
              "Weights below match the implementation in vayne.engine_trace",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="confidence">
        <KnowledgeSection id="finding-confidence" title="finding_confidence()">
          <KnowledgeLead>
            Overall confidence mixes observation, reliability, exploitability, and impact. Dimensions
            without evidence are omitted from the mix.
          </KnowledgeLead>
          <TerminalBlock>{`overall = Σ(dimension_score × dim_weight) / Σ(dim_weight)
dimension_score = clamp(Σ feature_deltas, 0, 100)

Weights:
  observation   0.34
  reliability   0.24
  exploit       0.24
  impact        0.18

Source: vayne.confidence.finding_confidence`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="priority">
        <KnowledgeSection id="priority-score" title="priority_score() / composite_priority_score()">
          <KnowledgeLead>
            Priority ranks findings for analyst attention. The Engine Status dashboard shows at most
            six findings sorted by this score — not by severity labels alone.
          </KnowledgeLead>
          <TerminalBlock>{`priority = clamp(round(Σ(quality_dimension × weight)), 0, 99)

Weights:
  business_impact              0.18
  exploitability               0.16
  internet_exposure            0.12
  confidence                   0.14
  blast_radius                 0.10
  data_sensitivity             0.10
  identity_exposure            0.08
  investigation_completeness   0.12

Source: vayne.investigation.quality_score.composite_priority_score`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="scanner-agreement">
        <KnowledgeSection id="scanner-agreement-fn" title="scanner_agreement()">
          <TerminalBlock>{`scanner_agreement.ratio = len(agreed_tools) / max(len(capable_tools), 1)

Terms: agreed_tools, capable_tools
Source: vayne.correlator.engine._scanner_agreement`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="graph">
        <KnowledgeSection id="graph-formulas" title="Attack Graph Formulas">
          <KnowledgeLead>
            Graph construction emits node/edge counts, rejected edges, traversal algorithm, and path
            acceptance statistics into Engine Trace when the Attack Graph Builder runs.
          </KnowledgeLead>
          <TerminalBlock>{`edge_confidence() — passed_checks, source_count, validation_confidence
path_confidence() — aggregate of edge.confidence_contribution
risk_score() — cvss_base × maturity × access × auth × evidence × blast × privilege
attacker_effort() — derived from path_hop_count

Source: vayne.attack_paths.formulas`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="glossary">
        <KnowledgeSection id="glossary-terms" title="Formula Glossary">
          <BulletGrid
            items={[
              "Observation — scanner evidence that the finding exists on a host/service",
              "Reliability — source/tool agreement and fingerprint strength",
              "Exploitability — whether a viable exploit path is evidenced",
              "Impact — business/data/identity blast if exploited",
              "Internet Exposure — whether the asset is reachable from an internet entry node",
              "False-positive penalty — negative deltas for spoofability / weak signals",
              "Engine Trace — live telemetry panel (not this documentation page)",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
