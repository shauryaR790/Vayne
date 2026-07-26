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
  { id: "pipeline", label: "Pipeline" },
  { id: "parsers", label: "Parsers" },
  { id: "confidence", label: "finding_confidence" },
  { id: "priority", label: "priority_score" },
  { id: "agreement", label: "scanner_agreement" },
  { id: "graph", label: "Attack Graph" },
  { id: "validation", label: "Validation Checks" },
  { id: "risk", label: "risk_score" },
  { id: "trace-ui", label: "Engine Trace UI" },
  { id: "sources", label: "Source Paths" },
];

export function EngineDocsContent() {
  return (
    <KnowledgeShell title="Engine Documentation" sections={TOC}>
      <KnowledgeSectionWrap id="overview">
        <KnowledgeSection id="overview-body" title="Overview">
          <KnowledgeLead>
            Permanent reference for VAYNE engine v0.2.0 (Created By Nemzyi). Live values appear in
            Engine Trace while formulas evaluate; this page documents the implementation. The
            product UI never invents scores — it renders engine telemetry and artifacts.
          </KnowledgeLead>
          <TerminalBlock>{`Package:     vayne/  (__version__ = "0.2.0")
Product API: product/backend (FastAPI)
Workstation: product/frontend

Deterministic path:
  parser → normalizer → correlator → validator → confidence →
  attack graph → priority → investigation export → AI boundary`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="pipeline">
        <KnowledgeSection id="pipeline-body" title="Pipeline Stages">
          <BulletGrid
            items={[
              "Parser — extract findings/assets/hosts/ports/services",
              "Normalizer — schema mapping",
              "Deduplicator — raw vs unique",
              "Correlation — merges + scanner agreement",
              "Validation — retain / FP / exploitability checks",
              "Confidence — finding_confidence()",
              "Attack Graph — nodes/edges/paths",
              "Priority — priority_score() → ≤6 attention cards",
              "Investigation Generator / Export / Summary",
              "AI Boundary — explanation only afterward",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="parsers">
        <KnowledgeSection id="parsers-body" title="Parsers">
          <KnowledgeLead>
            Hint map (vayne/parsers/loader.py PARSER_BY_HINT) includes nuclei, nmap, burp, nessus,
            openvas, httpx, naabu, katana, qualys, rapid7/nexpose/insightvm, sarif, prowler,
            scoutsuite, plus extension/content auto-detect (JSON/XML/HTML/TXT/CSV).
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="confidence">
        <KnowledgeSection id="confidence-body" title="finding_confidence()">
          <TerminalBlock>{`overall = Σ(dimension_score × dim_weight) / Σ(dim_weight)
dimension_score = clamp(Σ feature_deltas, 0, 100)

Weights (omit missing dimensions):
  observation   0.34
  reliability   0.24
  exploit       0.24
  impact        0.18

Feature deltas include evidence class, banner/version/CPE,
scanner agreement, observation count, conflicts, FP penalties,
reliability tier, CVE/EPSS/KEV, severity, privilege/lateral/exposure.

Source: vayne/confidence/finding_confidence.py`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="priority">
        <KnowledgeSection id="priority-body" title="priority_score()">
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

Engine Status / Priority findings show at most six cards
sorted by this score — not severity alone.

Source: vayne/investigation/quality_score.py
Analyst reasons: vayne/investigation/analyst_reasons.py`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="agreement">
        <KnowledgeSection id="agreement-body" title="scanner_agreement()">
          <TerminalBlock>{`ratio = len(agreed_tools) / max(len(capable_tools), 1)

Implemented in correlator; surfaced in Trace correlation samples
and in Priority card reasons (“Corroborated by …”).`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="graph">
        <KnowledgeSection id="graph-body" title="Attack Graph Formulas">
          <TerminalBlock>{`edge contribution ≈
  (passed_checks / 10) * 50
  + min(25, source_count * 8)
  + min(25, validation_confidence * 0.25)
  (clamped)

path_confidence = mean(edge confidence_contribution)
MIN_PATH_CONFIDENCE = 50
MIN_EDGE_CONFIDENCE = 50

attacker_effort():
  1 hop trivial · 2–3 low · 4–5 moderate · 6+ high

Sources: vayne/attack_paths/formulas.py`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="validation">
        <KnowledgeSection id="validation-body" title="Validation Checks">
          <TerminalBlock>{`CHECK_POINTS (indicative):
  host alive +20 · port open +15 · service identified +15
  fingerprinted +10 · version +15 · CVE applicable +15
  prerequisites +10 · reproduced +10 · reachable +10
  privilege +8 · lateral +8

validate_finding() in vayne/validator/engine.py`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="risk">
        <KnowledgeSection id="risk-body" title="risk_score()">
          <TerminalBlock>{`risk = min(10,
  cvss_base × maturity_factor × access_factor × auth_factor
  × evidence_factor × blast_factor × privilege_factor
  × business_criticality × data_sensitivity × identity_impact
  × lateral_movement × persistence)

maturity: weaponized=1.0 … theoretical≈0.55
blast_factor = min(1.15, 1.0 + (blast-1)*0.004)
lateral evidenced → ~1.40 factor

Source: vayne/attack_paths/scoring.py`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="trace-ui">
        <KnowledgeSection id="trace-ui-body" title="Engine Trace UI">
          <KnowledgeLead>
            Frontend STAGE_LABELS map stage ids to Parser, Normalization, Deduplicator, Correlation,
            Validation, Confidence Engine, Attack Graph Builder, Priority Engine, Investigation
            Generator, Risk Engine, Export, Engine Summary, AI Explanation, Engine Console, Proof
            Mode. Proof lines (stage=proof) are deferred to the bottom of the Trace panel after
            priority/export/summary/AI boundary chunks.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="sources">
        <KnowledgeSection id="sources-body" title="Source Paths">
          <TerminalBlock>{`vayne/__init__.py
vayne/orchestrator/pipeline.py
vayne/engine_trace/instrument.py
vayne/engine_trace/events.py
vayne/confidence/finding_confidence.py
vayne/investigation/quality_score.py
vayne/investigation/analyst_reasons.py
vayne/attack_paths/formulas.py
vayne/attack_paths/scoring.py
vayne/validator/engine.py
vayne/parsers/loader.py
product/frontend/lib/engine-trace.ts
product/frontend/components/workspace/engine-trace-live.tsx`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
