"use client";

import {
  BulletGrid,
  KnowledgeLead,
  KnowledgeSection,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "purpose", label: "Purpose" },
  { id: "noise", label: "Scanner Noise" },
  { id: "chains", label: "Attack Chains" },
  { id: "fp", label: "False Positives" },
  { id: "agreement", label: "Multi-scanner" },
  { id: "ui", label: "How UI Surfaces Research" },
  { id: "contribute", label: "Contribute" },
];

export function ResearchContent() {
  return (
    <KnowledgeShell title="Research" sections={TOC}>
      <KnowledgeSectionWrap id="purpose">
        <KnowledgeSection id="purpose-body" title="Purpose">
          <KnowledgeLead>
            Research notes for operators and contributors of VAYNE v0.2.0. The product is not a
            vulnerability database UI — it studies how real scanner exports become (or fail to
            become) validated attack reasoning. Use Engine Trace + Priority reasons as the live
            laboratory; this page captures the standing hypotheses.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="noise">
        <KnowledgeSection id="noise-body" title="Scanner Noise">
          <KnowledgeLead>
            Modern pipelines produce volume: Nuclei templates, Nessus plugins, Burp issues, Nmap
            scripts. Severity inflation and duplicate titles across tools create false urgency.
            VAYNE’s Priority Engine re-ranks with business_impact, exploitability, exposure, and
            confidence weights so the Investigation Engine shows ≤6 attention cards instead of a
            raw finding dump.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Severity ≠ attention",
              "Single-source observations stay weak",
              "Informational findings belong in Why We Ignored the Rest",
              "Re-ingest after adding a corroborating scanner",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="chains">
        <KnowledgeSection id="chains-body" title="Attack Chains">
          <KnowledgeLead>
            Chains require validated edges (host/port/service/version/CVE/prereq/reachability).
            Trace rejects paths without validated findings or exploit intelligence — those reasons
            appear in PATH DISCOVERY at the bottom of Engine Trace. Graph view in Optional Details
            is the analyst diagram; Trace is the proof log.
          </KnowledgeLead>
          <TerminalBlock>{`Research questions to ask on every run:
  - Which edges failed MIN_EDGE_CONFIDENCE (50)?
  - Was version exact or fuzzy?
  - Did lateral/privilege checks fire?
  - Is PATH badge present on priority cards?`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="fp">
        <KnowledgeSection id="fp-body" title="False Positives">
          <KnowledgeLead>
            Validation separates observation from exploitability. Version mismatches, auth-gated
            issues without proof, and unreproduced singles should fall out. If a true positive was
            marked FP, inspect Trace validation lines and parser coverage — fix evidence, do not
            prompt the LLM to “keep” it.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="agreement">
        <KnowledgeSection id="agreement-body" title="Multi-scanner">
          <KnowledgeLead>
            scanner_agreement = |agreed_tools| / max(|capable_tools|, 1). Combined ingest of Nmap +
            Nuclei + Burp is the intended research setup: Trace correlation samples show merges;
            Priority reasons say “Corroborated by …”. Separate mode is for isolating engements, not
            for maximizing agreement.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ui">
        <KnowledgeSection id="ui-body" title="How UI Surfaces Research">
          <BulletGrid
            items={[
              "Investigation Engine — ranked attention",
              "Engine Trace — formula + reject proof",
              "Brief — Why We Ignored the Rest taxonomy",
              "Ask VAYNE — paraphrase only (4 free msgs)",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="contribute">
        <KnowledgeSection id="contribute-body" title="Contribute">
          <TerminalBlock>{`Engine package:  vayne/
Parsers:         vayne/parsers/
Formulas:        vayne/confidence, investigation, attack_paths
Trace events:    vayne/engine_trace/
Product UI:      product/frontend
Product API:     product/backend

When adding a parser or weight change:
  1. Update engine tests / fixtures
  2. Confirm Engine Trace stage labels
  3. Update this Research note + Engine Documentation
  4. Document scoring changes against version 0.2.0`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
