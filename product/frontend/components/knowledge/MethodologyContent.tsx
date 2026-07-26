"use client";

import {
  BulletGrid,
  CompareBlock,
  FlowDiagram,
  KnowledgeLead,
  KnowledgeSection,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "doctrine", label: "Doctrine" },
  { id: "pipeline", label: "Pipeline" },
  { id: "evidence", label: "Evidence Classes" },
  { id: "correlation", label: "Correlation" },
  { id: "validation", label: "Validation" },
  { id: "confidence", label: "Confidence" },
  { id: "graph", label: "Attack Graph" },
  { id: "priority", label: "Priority" },
  { id: "ai-boundary", label: "AI Boundary" },
  { id: "ui-mapping", label: "UI Mapping" },
];

export function MethodologyContent() {
  return (
    <KnowledgeShell title="Methodology" sections={TOC}>
      <KnowledgeSectionWrap id="doctrine">
        <KnowledgeSection id="doctrine-body" title="Doctrine">
          <KnowledgeLead>
            VAYNE v0.2.0 (Nemzyi) answers “what matters?” not merely “what exists?”. Scanners emit
            observations; the deterministic engine decides retention, confidence, paths, and
            priority. The product UI (Investigation Engine, Engine Trace, VAYNE Analyst) is a live
            instrument panel over that engine — not a chatbot wrapper.
          </KnowledgeLead>
          <CompareBlock
            left={{
              label: "Traditional tools",
              body: "Enumerate vulns / ports / alerts. Severity labels dominate attention.",
            }}
            right={{
              label: "VAYNE",
              body: "Correlate → validate → graph → prioritize. Attention ranked by composite priority with explicit reasons.",
            }}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="pipeline">
        <KnowledgeSection id="pipeline-body" title="Pipeline">
          <FlowDiagram
            lines={[
              "Parser (Nmap, Nuclei, Burp, Nessus, OpenVAS, Httpx, Naabu, Katana, …)",
              "↓ Normalizer → Deduplicator",
              "↓ Correlation Engine",
              "↓ Validation Engine",
              "↓ Confidence Engine (finding_confidence)",
              "↓ Attack Graph Builder",
              "↓ Priority Engine (priority_score) → ≤6 attention cards",
              "↓ Investigation Generator → Export → Engine Summary",
              "↓ AI Boundary (LLM may explain; cannot change scores)",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="evidence">
        <KnowledgeSection id="evidence-body" title="Evidence Classes">
          <KnowledgeLead>
            Parsers map tool exports into normalized findings, assets, hosts, ports, and services.
            Observation strength depends on evidence class (banner, version, CPE, reproduced
            request/response, multi-scanner corroboration). Weak single-source noise is expected to
            lose to corroborated paths.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="correlation">
        <KnowledgeSection id="correlation-body" title="Correlation">
          <KnowledgeLead>
            Correlation merges duplicate/overlapping observations (host, port, CVE, title affinity)
            and computes scanner_agreement = |agreed_tools| / max(|capable_tools|, 1). Trace shows
            sample merges; UI Reason lines surface corroboration in plain language.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="validation">
        <KnowledgeSection id="validation-body" title="Validation">
          <KnowledgeLead>
            validate_finding() separates observation from exploitability: host alive, port open,
            service identified/fingerprinted, version, CVE applicability, auth, prerequisites,
            reachability, reproducibility (≥2 sources, no auth), privilege escalation, lateral
            movement. Failures feed FP / reject paths — visible in Trace and Why We Ignored the Rest.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="confidence">
        <KnowledgeSection id="confidence-body" title="Confidence">
          <TerminalBlock>{`finding_confidence()
  overall = Σ(dimension_score × dim_weight) / Σ(dim_weight)
  dimension_score = clamp(Σ feature_deltas, 0, 100)

  Weights (present dimensions only):
    observation   0.34
    reliability   0.24
    exploit       0.24
    impact        0.18

  Source: vayne/confidence/finding_confidence.py
  No hardcoded base scores (no fixed 85/75/60).`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="graph">
        <KnowledgeSection id="graph-body" title="Attack Graph">
          <KnowledgeLead>
            Edges require validation checks; edge_confidence / path_confidence use contribution
            formulas with MIN_PATH_CONFIDENCE and MIN_EDGE_CONFIDENCE at 50. Rejected edges/paths
            appear in Trace with reasons (e.g. no validated finding or verified exploit intelligence
            on path). PATH DISCOVERY proof dumps land at the bottom of Engine Trace after later
            stages.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "edge_confidence from checks + sources + validation",
              "path_confidence = mean edge contributions",
              "attacker_effort by hop count bands",
              "risk_score combines CVSS × maturity × access × … (capped)",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="priority">
        <KnowledgeSection id="priority-body" title="Priority">
          <TerminalBlock>{`priority_score / composite_priority_score
  priority = clamp(round(Σ(quality_dimension × weight)), 0, 99)

  Weights:
    business_impact              0.18
    exploitability               0.16
    internet_exposure            0.12
    confidence                   0.14
    blast_radius                 0.10
    data_sensitivity             0.10
    identity_exposure            0.08
    investigation_completeness   0.12

  UI emits ≤6 attention cards sorted by this score.
  Source: vayne/investigation/quality_score.py`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ai-boundary">
        <KnowledgeSection id="ai-boundary-body" title="AI Boundary">
          <KnowledgeLead>
            After Engine Summary the Trace shows AI Boundary: deterministic complete; AI not invoked
            to score. Ask VAYNE / briefing / section asks may run afterward in the product shell via
            OpenAI-compatible config — always as explanation over frozen engine artifacts.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ui-mapping">
        <KnowledgeSection id="ui-mapping-body" title="UI Mapping">
          <BulletGrid
            items={[
              "Investigation Engine — phase, progress, priority cards",
              "Engine Trace — stage proof + formulas + PATH DISCOVERY",
              "VAYNE Analyst — explanation only (4 free msgs default)",
              "View full report — Brief + Optional Details sections",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
