"use client";

import { KnowledgeLead, KnowledgeSection, TerminalBlock } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "frame", label: "Research Frame" },
  { id: "noise", label: "Noise Economics" },
  { id: "agreement", label: "Agreement Experiments" },
  { id: "paths", label: "Path Rejection Studies" },
  { id: "fp", label: "False Positive Craft" },
  { id: "ui-lab", label: "UI as Laboratory" },
  { id: "contribute", label: "Contributing Findings" },
];

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[1.75] text-white/90">{children}</p>;
}

export function ResearchContent() {
  return (
    <KnowledgeShell title="Research" sections={TOC}>
      <KnowledgeSectionWrap id="frame">
        <KnowledgeSection id="frame-body" title="Research Frame">
          <KnowledgeLead>
            Research in VAYNE 0.2.0 is not a blog roll of CVEs. It is the ongoing study of how
            scanner exports become — or fail to become — validated attack reasoning under Nemzyi’s
            deterministic engine. The workstation is the bench: Investigation Engine shows what
            earned attention, Engine Trace shows why, and the Brief shows what was consciously
            ignored.
          </KnowledgeLead>
          <P>
            Useful research questions are operational. Does adding Burp beside Nuclei change
            priority for the same host more than bumping a severity label? Do PATH DISCOVERY rejects
            cluster around missing version evidence or missing lateral prerequisites? When
            confidence is middling but priority is high, is internet_exposure doing the work you
            think it is? Answer those with Trace lines and card reasons, not with vibes.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="noise">
        <KnowledgeSection id="noise-body" title="Noise Economics">
          <P>
            Security pipelines overproduce. Template engines, plugin packs, and crawl-assisted
            discovery create duplicate titles, near-duplicate hosts, and severity inflation.
            Organizations respond by hiring people to stare at Critical queues. VAYNE’s counter is
            economic: emit at most six priority cards and force Why We Ignored the Rest into the
            Brief so ignored work is visible instead of silently deleted from consciousness.
          </P>
          <P>
            When you research a new parser or weight change, measure whether the attention set
            shrinks without dropping true paths. A change that merely recolors severity without
            moving composite priority is not progress in this codebase.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="agreement">
        <KnowledgeSection id="agreement-body" title="Agreement Experiments">
          <P>
            scanner_agreement only means something when capable tools are defined honestly. Run
            paired ingests: Nmap alone, then Nmap+Nuclei, then Nmap+Nuclei+Burp on the same estate.
            Watch correlation samples and Reason lines. Combined mode should allow corroboration to
            lift findings that separate mode keeps isolated. If agreement never moves, your capable
            set or merge keys are wrong — fix parsers and correlator before touching LLM prompts.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="paths">
        <KnowledgeSection id="paths-body" title="Path Rejection Studies">
          <P>
            Rejected paths are the curriculum. Scroll to PATH DISCOVERY after every non-trivial run
            and classify rejects: missing validated finding, missing exploit intelligence, edge
            below MIN_EDGE_CONFIDENCE, path below MIN_PATH_CONFIDENCE, effort impractical, or graph
            connectivity gaps. Those classes tell you whether to chase banners, exploit intel,
            reachability proof, or simply accept that a chain is theoretical.
          </P>
          <P>
            Optional Details’ Attack Graph is the illustration; Trace is the lab notebook. Research
            writeups should cite both, with Trace winning disputes.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="fp">
        <KnowledgeSection id="fp-body" title="False Positive Craft">
          <P>
            False positives are not a moral failing of scanners; they are a validation outcome.
            Study version mismatches, auth-gated issues without reproduction, and single-source
            flares. When a true positive is marked FP, capture the Trace validation lines and the
            raw export snippet. The remediation is better evidence or a parser fix — never an Ask
            VAYNE override fantasy.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ui-lab">
        <KnowledgeSection id="ui-lab-body" title="UI as Laboratory">
          <P>
            Keep Engine and Trace visible while you experiment — that is why the dock preserves 39 /
            29 / 31 widths by identity. After docs browsing, logo resume should refetch Trace so
            experiments are not lost to empty standby. Use free-tier asks sparingly to paraphrase
            results for humans; do not use them as a substitute for reading formula lines.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="contribute">
        <KnowledgeSection id="contribute-body" title="Contributing Findings">
          <P>
            Contributions that matter look like parser fixtures, weight patches with before/after
            Trace screenshots, clearer analyst_reasons, or documentation updates that match code.
            If you change scoring, update Engine Documentation in the same pull request and call out
            the 0.2.0 baseline you diverged from.
          </P>
          <TerminalBlock>{`Primary trees
  vayne/parsers · vayne/confidence · vayne/investigation
  vayne/attack_paths · vayne/engine_trace
  product/frontend/components/workspace
  product/frontend/components/knowledge`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
