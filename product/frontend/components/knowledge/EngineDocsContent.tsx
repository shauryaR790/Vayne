"use client";

import { KnowledgeLead, KnowledgeSection, TerminalBlock } from "@/components/knowledge/primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "@/components/knowledge/KnowledgeShell";

const TOC = [
  { id: "intro", label: "Introduction" },
  { id: "pipeline", label: "Pipeline & Trace" },
  { id: "parsers", label: "Parsers" },
  { id: "confidence", label: "finding_confidence()" },
  { id: "priority", label: "priority_score()" },
  { id: "agreement", label: "scanner_agreement()" },
  { id: "validation", label: "Validation" },
  { id: "graph", label: "Attack Graph Math" },
  { id: "risk", label: "risk_score()" },
  { id: "attention", label: "Attention Cards" },
  { id: "boundary", label: "AI Boundary" },
  { id: "sources", label: "Source Map" },
];

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[1.75] text-white/90">{children}</p>;
}

export function EngineDocsContent() {
  return (
    <KnowledgeShell title="Engine Documentation" sections={TOC}>
      <KnowledgeSectionWrap id="intro">
        <KnowledgeSection id="intro-body" title="Introduction">
          <KnowledgeLead>
            This page is the long-form reference for the deterministic VAYNE engine at version 0.2.0
            (Created By Nemzyi). Engine Trace shows formulas when they run; this document explains
            what those lines mean, which files own them, and how the product UI is allowed to present
            them. It is intentionally dense. If you are changing weights, start here and leave the
            Trace contract intact.
          </KnowledgeLead>
          <P>
            The engine package lives under <code className="text-white/70">vayne/</code>. The product
            API in <code className="text-white/70">product/backend</code> invokes orchestration and
            persists investigations. The workstation in{" "}
            <code className="text-white/70">product/frontend</code> streams{" "}
            <code className="text-white/70">engine_event</code> payloads into Engine Trace and renders
            priority attention cards on Investigation Engine. Nowhere in that path is the LLM
            permitted to author a score.
          </P>
          <P>
            Read this as open-source documentation for contributors and as an audit companion for
            operators. When Trace and this page disagree, trust the code paths cited at the bottom —
            then patch this page.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="pipeline">
        <KnowledgeSection id="pipeline-body" title="Pipeline & Trace">
          <P>
            Instrumental phases exposed to the UI include Parser, Normalizer, Deduplicator,
            Correlation Engine, Validation Engine, Confidence Engine, Attack Graph Builder, Priority
            Engine, Investigation Generator, Export, Engine Summary, and AI Boundary. Progress
            percentages advance on real stage completion via instrumentation in{" "}
            <code className="text-white/70">vayne/engine_trace/instrument.py</code>. Frontend labels
            map stage ids through <code className="text-white/70">STAGE_LABELS</code> in{" "}
            <code className="text-white/70">product/frontend/lib/engine-trace.ts</code>.
          </P>
          <P>
            Engine Trace renders stage blocks with the fields each stage emits — files processed,
            findings extracted, dedup counts, correlation merges, validation retained versus false
            positives, confidence and priority evaluations, graph statistics, path accept/reject,
            investigation counts, and summary rollups. Proof-mode lines (PATH DISCOVERY / VAYNE PROOF
            MODE) are buffered and appended at the bottom after later stages so operators read
            structured math before the long CLI appendix.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="parsers">
        <KnowledgeSection id="parsers-body" title="Parsers">
          <P>
            <code className="text-white/70">vayne/parsers/loader.py</code> routes by hint and by
            content sniffing. First-class families include nuclei, nmap, burp, nessus, openvas,
            httpx, naabu, katana, qualys, rapid7 / nexpose / insightvm, and sarif. Generic JSON
            handling covers prowler-like and scoutsuite-like shapes. CSV and common XML/HTML/TXT
            paths exist for awkward exports. Parser output is observation only: normalized findings
            and inventory facts waiting for judgment stages.
          </P>
          <P>
            When files are skipped, product analyze responses may carry warnings. Operators should
            treat skipped files as coverage holes, not as silent success. Re-ingest after renaming or
            converting stubborn exports beats asking Ask VAYNE what the parser never saw.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="confidence">
        <KnowledgeSection id="confidence-body" title="finding_confidence()">
          <P>
            Confidence is implemented in{" "}
            <code className="text-white/70">vayne/confidence/finding_confidence.py</code>. There is
            no prestigious hardcoded base such as 85/75/60. Each dimension accumulates feature
            deltas, clamps to the closed interval from 0 to 100, and participates in a weighted mean
            only when that dimension has evidence.
          </P>
          <P>
            The standing dimension weights are observation 0.34, reliability 0.24, exploit 0.24, and
            impact 0.18. If exploit evidence is absent, exploit drops out and the remaining weights
            renormalize through the sum of present weights. Overall confidence is therefore
            evidence-shaped rather than template-shaped.
          </P>
          <P>
            Observation deltas include evidence class weights, banner and version and CPE presence,
            scanner agreement contributions, observation counts, and penalties for conflicts or
            false-positive pressure. Reliability blends source quality anchors and corroboration
            among sources that clear a reliability floor. Exploit blends CVE applicability, EPSS/KEV
            style signals when present, and exploit-oriented evidence. Impact blends severity and
            exposure-oriented cues such as privilege and lateral context when those facts exist.
          </P>
          <TerminalBlock>{`overall = Σ(dimension_score × dim_weight) / Σ(dim_weight)
dimension_score = clamp(Σ feature_deltas, 0, 100)

dim_weight defaults when present:
  observation 0.34
  reliability 0.24
  exploit     0.24
  impact      0.18

Source: vayne/confidence/finding_confidence.py`}</TerminalBlock>
          <P>
            In Engine Trace you should see contribution lines that justify the final confidence for
            a finding. If a Priority card shows a confidence percent that surprises you, reconcile it
            against those lines before arguing from severity alone.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="priority">
        <KnowledgeSection id="priority-body" title="priority_score()">
          <P>
            Priority is implemented in{" "}
            <code className="text-white/70">vayne/investigation/quality_score.py</code> as a
            composite over quality dimensions, each already on a 0–100 style scale. The engine
            clamps the rounded weighted sum into 0–99 and uses that rank for attention.
          </P>
          <P>
            Weights emphasize what changes an organization’s near-term risk posture: business_impact
            0.18, exploitability 0.16, internet_exposure 0.12, confidence 0.14, blast_radius 0.10,
            data_sensitivity 0.10, identity_exposure 0.08, investigation_completeness 0.12. Confidence
            appears inside priority so poorly evidenced drama cannot dominate simply by shouting
            Critical.
          </P>
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

Source: vayne/investigation/quality_score.py`}</TerminalBlock>
          <P>
            Analyst-facing reason strings are built in{" "}
            <code className="text-white/70">vayne/investigation/analyst_reasons.py</code> and emitted
            on attention cards so operators are not forced to decode opaque{" "}
            <code className="text-white/70">model=</code> tags. The UI filters residual internal
            labels if any slip through.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="agreement">
        <KnowledgeSection id="agreement-body" title="scanner_agreement()">
          <P>
            Scanner agreement is the fraction of capable tools that actually concur on an issue:
            len(agreed_tools) / max(len(capable_tools), 1). Capable matters — a tool that cannot see
            a class of issue should not punish agreement by absence. Correlation stages surface
            sample merges in Trace; Priority reasons translate strong agreement into “Corroborated
            by …” copy on the Engine dashboard.
          </P>
          <P>
            Combined ingest is how you maximize meaningful agreement. Separate mode intentionally
            withholds cross-file fusion, which will suppress agreement-driven lifts even when filenames
            sit in the same folder.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="validation">
        <KnowledgeSection id="validation-body" title="Validation">
          <P>
            <code className="text-white/70">validate_finding()</code> in{" "}
            <code className="text-white/70">vayne/validator/engine.py</code> distinguishes whether
            something was observed from whether it is exploitable in context. Checks include host
            alive, port open, service identified, fingerprinted, version evidence, CVE applicability,
            authentication requirements, prerequisites, reachability, reproducibility (multiple
            sources without auth theater), privilege escalation, and lateral movement.
          </P>
          <P>
            Point hints used when contributing to edge confidence include magnitudes on the order of
            host alive +20, port open +15, service identified +15, fingerprinted +10, version +15,
            CVE applicable +15, prerequisites +10, reproduced +10, reachable +10, privilege +8,
            lateral +8 (see CHECK_POINTS in attack path formulas). Failed validation is how false
            positives and rejected paths earn their keep in the methodology.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="graph">
        <KnowledgeSection id="graph-body" title="Attack Graph Math">
          <P>
            Attack path formulas live primarily in{" "}
            <code className="text-white/70">vayne/attack_paths/formulas.py</code>. Edge confidence
            contributions combine the fraction of passed checks, a source-count term, and a
            validation-confidence term, each clamped into a bounded contribution. A representative
            shape is (passed_checks / 10) * 50 + min(25, source_count * 8) + min(25,
            validation_confidence * 0.25). Path confidence is the mean of edge contributions along
            the path.
          </P>
          <P>
            Minimum thresholds MIN_PATH_CONFIDENCE and MIN_EDGE_CONFIDENCE sit at 50 in the current
            line. Paths or edges beneath those floors are rejected rather than softly grayed in a
            way operators might miss. Attacker effort is banded by hop count: one hop trivial, two to
            three low, four to five moderate, six or more high.
          </P>
          <TerminalBlock>{`edge contribution ≈
  (passed_checks / 10) * 50
  + min(25, source_count * 8)
  + min(25, validation_confidence * 0.25)

path_confidence = mean(edge confidence_contribution)
MIN_PATH_CONFIDENCE = 50
MIN_EDGE_CONFIDENCE = 50

attacker_effort: 1 trivial · 2–3 low · 4–5 moderate · 6+ high`}</TerminalBlock>
          <P>
            PATH DISCOVERY proof dumps in Engine Trace are the narrative companion to these numbers.
            Read rejects there when a graph edge you expected never appears in Optional Details.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="risk">
        <KnowledgeSection id="risk-body" title="risk_score()">
          <P>
            Path risk scoring in{" "}
            <code className="text-white/70">vayne/attack_paths/scoring.py</code> multiplies a CVSS
            base by maturity, access, authentication, evidence, blast, privilege, business
            criticality, data sensitivity, identity impact, lateral movement, and persistence
            factors, then caps at 10. Maturity maps weaponized near 1.0 down toward theoretical near
            0.55. Blast expands gently with breadth. Lateral evidence can apply a sharp multiplier
            on the order of 1.40. Remote access and authentication posture nudge factors up or down
            rather than replacing the whole score.
          </P>
          <TerminalBlock>{`risk = min(10,
  cvss_base
  × maturity_factor
  × access_factor
  × auth_factor
  × evidence_factor
  × blast_factor
  × privilege_factor
  × business_criticality
  × data_sensitivity
  × identity_impact
  × lateral_movement
  × persistence)

blast_factor ≈ min(1.15, 1.0 + (blast - 1) * 0.004)
Source: vayne/attack_paths/scoring.py`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="attention">
        <KnowledgeSection id="attention-body" title="Attention Cards">
          <P>
            The Priority Engine emits at most six attention findings into Trace and onto the
            Investigation Engine dashboard. Cards include severity, optional PATH badge, priority
            value, title, confidence, hosts, source file, and reason lists from analyst_reasons.
            Emitting a hard cap is part of the scoring product: VAYNE refuses to pretend infinite
            Critical queues are actionable.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="boundary">
        <KnowledgeSection id="boundary-body" title="AI Boundary">
          <P>
            After summary instrumentation, Trace records AI Boundary: deterministic complete; AI not
            invoked to score. Product chat may still run briefings and section asks afterward via
            configured LLM credentials. Those turns consume free-tier quota and must be read as
            commentary. If chat output conflicts with Trace math, Trace wins until the engine code
            changes.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="sources">
        <KnowledgeSection id="sources-body" title="Source Map">
          <TerminalBlock>{`vayne/__init__.py                          __version__ = 0.2.0
vayne/orchestrator/pipeline.py             stage narrative
vayne/engine_trace/instrument.py           phase + attention emit
vayne/engine_trace/events.py               event/stage ids
vayne/parsers/loader.py                    parser routing
vayne/confidence/finding_confidence.py     finding_confidence()
vayne/investigation/quality_score.py       priority composite
vayne/investigation/analyst_reasons.py     human reasons
vayne/validator/engine.py                  validate_finding()
vayne/attack_paths/formulas.py             edge/path confidence
vayne/attack_paths/scoring.py              risk_score()
product/frontend/lib/engine-trace.ts       STAGE_LABELS + fetch
product/frontend/components/workspace/engine-trace-live.tsx
product/frontend/components/workspace/engine-workstation.tsx`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
