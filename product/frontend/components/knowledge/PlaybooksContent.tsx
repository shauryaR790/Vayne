"use client";

import {
  BulletGrid,
  FlowDiagram,
  KnowledgeLead,
  KnowledgeSection,
  PromptList,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "first-run", label: "First Investigation" },
  { id: "priority-cards", label: "Priority Cards" },
  { id: "read-trace", label: "Read Engine Trace" },
  { id: "triage-ask", label: "Triage with Ask VAYNE" },
  { id: "multi-file", label: "Multi-file Modes" },
  { id: "history", label: "Reopen History" },
  { id: "exec-brief", label: "Exec Translation" },
  { id: "ignored", label: "Ignored Findings" },
  { id: "re-ingest", label: "When to Re-ingest" },
  { id: "shortcuts", label: "Shortcuts" },
];

export function PlaybooksContent() {
  return (
    <KnowledgeShell title="Playbooks" sections={TOC}>
      <KnowledgeSectionWrap id="first-run">
        <KnowledgeSection id="first-run-body" title="First Investigation">
          <KnowledgeLead>
            End-to-end playbook for VAYNE v0.2.0 on the current workstation (Investigation Engine ·
            Engine Trace · VAYNE Analyst).
          </KnowledgeLead>
          <FlowDiagram
            lines={[
              "1. Open home (/) — idle Engine shows Version 0.2.0 / Created By Nemzyi",
              "2. Ingest File or Ingest Folder (or drop Nmap/Nuclei/Burp/Nessus/… artifacts)",
              "3. Watch Engine Trace stages + Engine progress % + Priority findings",
              "4. Wait for Complete → click View full report",
              "5. Read Investigation Brief (Start Here + Why We Ignored the Rest)",
              "6. Expand Attack Graph / Findings only as needed",
              "7. Spend Ask VAYNE budget on the top unanswered question",
            ]}
          />
          <TerminalBlock>{`Checklist before you leave the run:
  [ ] Priority cards reviewed (≤6)
  [ ] Trace PATH DISCOVERY skimmed at bottom
  [ ] Brief "Start Here" tasks noted
  [ ] Ask VAYNE remaining count checked`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="priority-cards">
        <KnowledgeSection id="priority-cards-body" title="Priority Cards">
          <KnowledgeLead>
            Treat Priority findings as the engine’s attention queue. Sort key is composite priority,
            not Critical/High labels. Read Reason lines first — they are analyst-facing
            (Observed by…, Corroborated by…, Internet-facing, No exploit evidence, Single-source).
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Open Investigation → jumps into report context",
              "PATH badge = on an accepted attack path",
              "Confidence % ≠ priority rank",
              "Empty cards = Priority Engine emitted nothing yet / idle",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="read-trace">
        <KnowledgeSection id="read-trace-body" title="Read Engine Trace">
          <KnowledgeLead>
            Use Trace to verify the engine actually did the work you will defend in review. Confirm
            parser counts, correlation merges, validation retained vs false positives, confidence
            and priority formula lines, graph accept/reject, then scroll to PATH DISCOVERY proof at
            the bottom.
          </KnowledgeLead>
          <TerminalBlock>{`Skim order:
  Parser complete → files / findings / hosts / ports
  Correlation → sample merges + scanner agreement
  Validation → retained vs FP
  Confidence / Priority → formula evaluations
  Attack graph → nodes, edges, rejected edges
  Bottom → PATH DISCOVERY / proof mode dump`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="triage-ask">
        <KnowledgeSection id="triage-ask-body" title="Triage with Ask VAYNE">
          <KnowledgeLead>
            Free tier defaults to 4 Ask VAYNE messages (includes section asks). Spend them after you
            have read the Brief. Prefer section Ask buttons so context is scoped.
          </KnowledgeLead>
          <PromptList
            prompts={[
              "Explain why this priority finding outranks higher-severity noise",
              "What would falsify this attack path?",
              "List missing evidence that would raise confidence",
              "Draft a 5-bullet executive summary from Start Here",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="multi-file">
        <KnowledgeSection id="multi-file-body" title="Multi-file Modes">
          <KnowledgeLead>
            Combined (Merge into one investigation) correlates across files into one narrative.
            Separate (Analyze files separately) produces multiple investigations / intros — use when
            evidence sets must not be fused (different engements, tenants, or timeboxes).
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="history">
        <KnowledgeSection id="history-body" title="Reopen History">
          <KnowledgeLead>
            Pick a row under Investigation History. VAYNE restores session messages, bundles, and
            refetches engine-trace events so Engine Trace is populated after you visited docs pages.
            Logo does the same for the active id.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="exec-brief">
        <KnowledgeSection id="exec-brief-body" title="Exec Translation">
          <KnowledgeLead>
            Do not paste Trace. Lead with Brief → Start Here → top priority card reasons → one path
            diagram → recommendations. Say scores are engine-computed; Ask VAYNE only paraphrased.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Lead with business impact, not CVE lists",
              "Cite Priority P n + confidence together",
              "Call out Why We Ignored the Rest explicitly",
              "Separate evidence facts from LLM wording",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ignored">
        <KnowledgeSection id="ignored-body" title="Ignored Findings">
          <KnowledgeLead>
            Why We Ignored the Rest groups duplicates, informational, mitigated, contradicted, low
            impact, false positives, and noise. If something critical was ignored, check Trace
            validation/FP lines and re-ingest with better corroborating scanners — do not ask the
            LLM to override retention.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="re-ingest">
        <KnowledgeSection id="re-ingest-body" title="When to Re-ingest">
          <BulletGrid
            items={[
              "New scanner export for the same asset set",
              "Separate→combined (or reverse) needed",
              "Parser skipped files (check warnings)",
              "Trace missing after storage wipe — rerun analyze",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="shortcuts">
        <KnowledgeSection id="shortcuts-body" title="Shortcuts">
          <TerminalBlock>{`Ctrl/Cmd + N     New Investigation
(See in-app shortcuts overlay for the full list.)

Panel tabs: drag title to swap Engine / Trace / Analyst.
Widths stay 39 / 29 / 31 by panel identity.`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
