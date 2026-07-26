"use client";

import { KnowledgeLead, KnowledgeSection, TerminalBlock } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "doctrine", label: "Doctrine" },
  { id: "observe", label: "Observation vs Judgment" },
  { id: "pipeline", label: "Pipeline Narrative" },
  { id: "correlation", label: "Correlation Doctrine" },
  { id: "validation", label: "Validation Doctrine" },
  { id: "confidence", label: "Confidence Doctrine" },
  { id: "graph", label: "Graph Doctrine" },
  { id: "priority", label: "Priority Doctrine" },
  { id: "boundary", label: "AI Boundary" },
  { id: "ui", label: "How the UI Honors This" },
];

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[1.75] text-white/90">{children}</p>;
}

export function MethodologyContent() {
  return (
    <KnowledgeShell title="Methodology" sections={TOC}>
      <KnowledgeSectionWrap id="doctrine">
        <KnowledgeSection id="doctrine-body" title="Doctrine">
          <KnowledgeLead>
            VAYNE’s methodology is intentionally narrow. Version 0.2.0 exists to turn noisy scanner
            observation into defended attack reasoning. Created By Nemzyi, the engine line prefers
            explicit rejects and ranked attention over exhaustive severity lists. Humans still decide
            what to fix; VAYNE decides what deserves the room’s oxygen first and why.
          </KnowledgeLead>
          <P>
            Traditional tooling answers “what exists?” — open ports, matching templates, plugin
            hits, issue trackers. VAYNE answers “what matters?” by requiring correlation,
            validation, path viability, and composite priority before a finding earns a Priority
            card or an accepted edge. That doctrine is why the workstation shows three panels of
            proof rather than a single infinite table of Criticals.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="observe">
        <KnowledgeSection id="observe-body" title="Observation vs Judgment">
          <P>
            Parsers observe. They lift structured and semi-structured exports into normalized
            findings, hosts, ports, services, and evidence pointers. Judgment begins afterward:
            deduplication collapses clones, correlation merges overlapping stories, validation
            tests whether exploitability claims survive host/port/service/version/reachability
            checks, confidence mixes observation quality with exploit and impact dimensions, and
            the graph refuses edges that cannot clear minimum confidence thresholds.
          </P>
          <P>
            Keeping observation and judgment separate is what makes Engine Trace auditable. You can
            see that a parser extracted four findings and that validation later retained two. An LLM
            paraphrase cannot blur that ledger if you read Trace honestly.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="pipeline">
        <KnowledgeSection id="pipeline-body" title="Pipeline Narrative">
          <P>
            The live UI phases follow the instrumented engine: Parser, Normalizer, Deduplicator,
            Correlation Engine, Validation Engine, Confidence Engine, Attack Graph Builder, Priority
            Engine, Investigation Generator, Export, Engine Summary, AI Boundary. Progress percent
            advances when stages complete for real. Priority attention cards emit from the Priority
            Engine with analyst-facing reasons. Investigation export produces the artifacts the Brief
            and Optional Details render after View full report.
          </P>
          <P>
            Contributors should treat this order as a contract. Inserting an LLM call before
            validation or letting chat mutate retention would violate the product’s public claim that
            AI explains engine conclusions only.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="correlation">
        <KnowledgeSection id="correlation-body" title="Correlation Doctrine">
          <P>
            Correlation assumes scanners are partial witnesses. Agreement across tools that are
            capable of seeing the same class of issue raises trust; disagreement and single-source
            flashes do not. The ratio scanner_agreement = |agreed_tools| / max(|capable_tools|, 1)
            is the quantitative spine, but the UI translates outcomes into Reason lines humans can
            read without opening correlator source.
          </P>
          <P>
            Combined multi-file ingest is how you give correlation enough witnesses. Separate mode
            is how you refuse a false shared narrative. Methodology favors combined when the estate
            is truly shared, and separate when politics or scope would make fusion misleading.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="validation">
        <KnowledgeSection id="validation-body" title="Validation Doctrine">
          <P>
            Validation asks whether the world implied by the finding is actually constrained enough
            to talk about exploitation. Host alive, port open, service identified or fingerprinted,
            version evidence, CVE applicability, authentication requirements, prerequisites,
            reachability, reproducibility across sources, privilege escalation, and lateral movement
            each contribute checks. Failing checks do not merely “lower a vibe score” — they feed
            false-positive / reject paths that later show up in Trace and in Why We Ignored the Rest.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="confidence">
        <KnowledgeSection id="confidence-body" title="Confidence Doctrine">
          <P>
            finding_confidence() refuses hardcoded prestige numbers. Dimensions without evidence
            drop out of the weighted mix. Observation, reliability, exploit, and impact carry
            weights 0.34, 0.24, 0.24, and 0.18 when present. Feature deltas inside each dimension
            encode evidence class, banners, versions, CPE, agreement, conflicts, FP penalties,
            reliability tiers, CVE/EPSS/KEV signals, and exposure-style impact cues. The Trace
            formula lines are the public diary of that mix for a given finding.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="graph">
        <KnowledgeSection id="graph-body" title="Graph Doctrine">
          <P>
            Graphs are earned. Edges need validation contribution and clear minimum confidence;
            paths average edge contributions and must clear MIN_PATH_CONFIDENCE. Rejected paths are
            first-class teaching artifacts — especially when PATH DISCOVERY at the bottom of Trace
            explains missing exploit intelligence or missing validated findings on the chain.
            Attacker effort bands by hop count keep “interesting” from being confused with
            “practical.”
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="priority">
        <KnowledgeSection id="priority-body" title="Priority Doctrine">
          <P>
            Priority is how VAYNE rations analyst time. Composite weights emphasize business impact
            and exploitability alongside exposure, confidence, blast radius, data sensitivity,
            identity exposure, and investigation completeness. Emitting at most six cards is a
            methodological choice: attention is finite, so the engine must commit. Severity labels
            remain visible on cards but do not own the sort.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="boundary">
        <KnowledgeSection id="boundary-body" title="AI Boundary">
          <P>
            After Engine Summary, Trace records AI Boundary. Deterministic scoring is closed. Any
            subsequent Ask VAYNE briefing or section question is explanation over frozen artifacts.
            If product configuration points at an OpenAI-compatible model, that model still cannot
            lawfully rewrite retention in this architecture — and operators should not pretend
            otherwise in writeups.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ui">
        <KnowledgeSection id="ui-body" title="How the UI Honors This">
          <P>
            Investigation Engine externalizes phase and priority. Engine Trace externalizes proof.
            VAYNE Analyst externalizes explanation under quota. The Brief externalizes Start Here and
            explicit ignores. Panel width identity (39/29/31) keeps proof and judgment from being
            crushed by a single dominant chat column. Logo resume preserving Trace is part of the
            methodology too: proof should survive a trip through documentation pages.
          </P>
          <TerminalBlock>{`Doctrine in one line:
  Scanners observe → VAYNE judges → humans decide → LLMs explain.`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
