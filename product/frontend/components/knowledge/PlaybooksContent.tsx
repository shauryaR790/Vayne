"use client";

import { KnowledgeLead, KnowledgeSection, TerminalBlock } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "first", label: "First Investigation" },
  { id: "cards", label: "Working Priority Cards" },
  { id: "trace", label: "Trace Triage Pass" },
  { id: "ask", label: "Spending Ask Budget" },
  { id: "modes", label: "Combined vs Separate" },
  { id: "history", label: "History Re-entry" },
  { id: "exec", label: "Briefing Executives" },
  { id: "ignored", label: "Challenging Ignores" },
  { id: "reingest", label: "When to Re-ingest" },
];

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[1.75] text-white/90">{children}</p>;
}

export function PlaybooksContent() {
  return (
    <KnowledgeShell title="Playbooks" sections={TOC}>
      <KnowledgeSectionWrap id="first">
        <KnowledgeSection id="first-body" title="First Investigation">
          <KnowledgeLead>
            This playbook walks a complete first run on VAYNE 0.2.0 using the live workstation —
            Investigation Engine, Engine Trace, and VAYNE Analyst — the way an analyst would actually
            spend the first half hour with a new evidence drop.
          </KnowledgeLead>
          <P>
            Begin on idle home. Confirm the Engine chrome still reads Version 0.2.0 and Created By
            Nemzyi so you know you are on the expected build. Ingest File or Ingest Folder with the
            exports you trust for this engagement — ideally more than one scanner family so
            correlation has something to agree on. If you are dropping mixed estate evidence that
            must stay fused, leave mode on combined. If the files are unrelated engagements, switch
            to separate before you start.
          </P>
          <P>
            Do not leave the live session early. Watch Trace until stages settle and AI Boundary
            appears. Skim Priority findings as they land. Only then click View full report. Read Start
            Here and Why We Ignored the Rest before you expand Attack Graph or open Ask VAYNE. That
            order keeps you from spending free-tier asks on questions the Brief already answers.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="cards">
        <KnowledgeSection id="cards-body" title="Working Priority Cards">
          <P>
            Treat the six-or-fewer Priority findings as the engine’s attention queue. Read the Reason
            lines before the title drama. “Corroborated by Nuclei, Burp” and “Internet-facing” change
            triage posture more than a Critical label alone. Note whether PATH is present — that badge
            means the finding participates in an accepted attack path, not merely that a CVE string
            exists.
          </P>
          <P>
            Compare confidence percent to priority rank deliberately. A medium-confidence
            internet-facing foothold can outrank a high-confidence informational finding; that is the
            point of composite priority. Use Open Investigation → when you are ready to jump into the
            report context for that card, then return to Trace if you need to defend the math.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="trace">
        <KnowledgeSection id="trace-body" title="Trace Triage Pass">
          <P>
            Make one disciplined pass down Engine Trace before you argue with the Brief. Confirm
            parser counts match what you thought you uploaded. Check correlation samples for the
            merges you expected across scanners. Read validation retained versus false-positive
            counts. Look for finding_confidence and priority_score evaluation lines so you can cite
            them later. Inspect graph accept and reject tallies. Finally scroll to the bottom PATH
            DISCOVERY appendix and read why rejected paths died.
          </P>
          <P>
            If a path you believed in was rejected for missing validated findings or exploit
            intelligence, that is an evidence problem, not a chat problem. Plan the next scanner
            export or manual check from that reject reason rather than asking the LLM to overturn it.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ask">
        <KnowledgeSection id="ask-body" title="Spending Ask Budget">
          <P>
            Default free tier is four Ask VAYNE messages including section asks. After the Brief,
            spend the first ask on the single highest-leverage ambiguity — usually “why this priority
            over noisier Criticals” or “what would falsify this path.” Prefer section Ask buttons so
            the prompt carries scoped engine context instead of a vague global question.
          </P>
          <P>
            Save one ask for executive paraphrase if you must produce outbound language. Do not burn
            quota asking the model to list every finding; Optional Details already has Findings and
            Evidence. When the dock says the free tier is exhausted, stop and continue as a human
            with Trace and Brief only.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="modes">
        <KnowledgeSection id="modes-body" title="Combined vs Separate">
          <P>
            Combined mode is the research default: one investigation narrative across files so
            scanner_agreement and shared hosts can lift confidence and priority. Separate mode
            produces multiple investigations and analyst intros — use it when merging would create a
            false shared estate story. You can change posture between runs; you cannot honestly
            “unmerge” inside a completed combined artifact without re-ingest.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="history">
        <KnowledgeSection id="history-body" title="History Re-entry">
          <P>
            Opening a history row or clicking the logo with an active id should restore the session
            and refetch engine-trace events. If you visited Methodology mid-investigation, you should
            land back with Trace populated rather than the empty standby line. If standby persists,
            the id has no stored telemetry — re-run analyze if proof is required for the record.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="exec">
        <KnowledgeSection id="exec-body" title="Briefing Executives">
          <P>
            Do not paste Engine Trace into an exec channel. Lead with Start Here, the top priority
            card’s plain-language reasons, one sentence on business impact, and the recommendation
            that changes risk this week. Explicitly mention What you ignored and why — that is how
            you show the engine reduced noise rather than hid it. State that scores are
            engine-computed and that any polished wording came from Ask VAYNE as explanation only.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ignored">
        <KnowledgeSection id="ignored-body" title="Challenging Ignores">
          <P>
            Why We Ignored the Rest is a first-class output. If something in that taxonomy looks
            wrong, open Trace validation and correlation for the underlying finding ids. Common
            fixes are adding a second scanner export, correcting a version-bearing banner capture, or
            splitting an engagement that should have been separate. Asking the Analyst to “keep”
            an ignored item cannot change retention in 0.2.0.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="reingest">
        <KnowledgeSection id="reingest-body" title="When to Re-ingest">
          <P>
            Re-ingest when you obtain a better export for the same assets, when you need to flip
            combined versus separate, when parser warnings show skipped files you can repair, or when
            Trace telemetry was never persisted and you need proof lines for audit. Prefer New
            Investigation only when the prior session should not remain the active resume target.
          </P>
          <TerminalBlock>{`Ctrl/Cmd+N — New Investigation (clears active id)
Logo — resume active investigation when one exists
Drag panel tabs — reorder Engine / Trace / Analyst (widths stay 39/29/31)`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
