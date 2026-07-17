"use client";

import Link from "next/link";

import {
  BulletGrid,
  CompareBlock,
  ConfidenceScale,
  FlowDiagram,
  KnowledgeLead,
  KnowledgeSection,
  KnowledgeSeeAlso,
  PromptList,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "start", label: "Getting Started" },
  { id: "layout", label: "Workspace Layout" },
  { id: "at-a-glance", label: "At a Glance" },
  { id: "executive", label: "Executive Summary" },
  { id: "story", label: "Investigation Story" },
  { id: "findings", label: "Confirmed Findings" },
  { id: "timeline", label: "Evidence Timeline" },
  { id: "missing", label: "Missing Evidence" },
  { id: "recommendations", label: "Recommendations" },
  { id: "attack-graph", label: "Attack Graph" },
  { id: "ask-vane", label: "Ask VANE AI" },
  { id: "analyst", label: "Analyst Panel" },
  { id: "advanced", label: "Advanced Sections" },
];

export function TutorialContent() {
  return (
    <KnowledgeShell
      title="Investigation Tutorial"
      subtitle="How to read the VANE investigation report — what each section means, how scores differ, and how to work the workspace on launch day."
      classification="GUIDE // ANALYST ONBOARDING"
      sections={TOC}
    >
      <KnowledgeSectionWrap id="start">
        <KnowledgeSection id="getting-started" title="Getting Started">
          <KnowledgeLead>
            Upload scan evidence from the home screen or open a recent investigation from the sidebar.
            VANE runs the reasoning engine, then renders a structured report you can read top to bottom
            or jump into with Ask VANE AI.
          </KnowledgeLead>
          <FlowDiagram
            lines={[
              "Upload evidence (Nmap, Nessus, Nuclei, etc.)",
              "↓",
              "Engine parses · correlates · validates",
              "↓",
              "Investigation report opens in the main panel",
              "↓",
              "Ask VANE AI for depth on any section",
            ]}
          />
          <BulletGrid
            items={[
              "New Investigation — start fresh from the sidebar",
              "Investigation History — reopen prior runs",
              "Analyst panel — chat opens when you Ask VANE AI",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="layout">
        <KnowledgeSection id="workspace-layout" title="Workspace Layout">
          <KnowledgeLead>
            The screen splits into three zones: navigation on the left, the investigation report in
            the center, and the VANE analyst chat on the right (after you start a session or ask a
            question).
          </KnowledgeLead>
          <CompareBlock
            left={{
              label: "Main report",
              body: "Engine output only — findings, paths, scores. Numbers come from evidence, not the LLM.",
            }}
            right={{
              label: "Analyst panel",
              body: "Narrates and explains report sections. Uses engine facts; does not invent CVEs or paths.",
            }}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="at-a-glance">
        <KnowledgeSection id="at-a-glance-metrics" title="At a Glance">
          <KnowledgeLead>
            The four headline metrics for triage. Read these first before diving into individual
            findings.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Risk — overall exposure severity weighted by reachable impact",
              "Exploit — likelihood the top finding can actually be exploited with current evidence",
              "Findings — count retained after VANE rejected weak or contradictory items",
              "Paths — attack chains validated vs blocked by the graph engine",
            ]}
          />
          <p>
            <strong className="text-white">Important:</strong> Risk and exploit confidence measure
            different things. High risk with low exploit % means the exposure is serious but
            exploitation has not been demonstrated yet — prioritize validation, not panic.
          </p>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="executive">
        <KnowledgeSection id="executive-summary" title="Executive Summary">
          <KnowledgeLead>
            Verdict-first summary for leadership and for you: what VANE concluded, what is still
            open, why it matters, and the single best next action.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Status pill — confirmed exposure, action required, or clear",
              "What VANE knows — evidence-backed facts",
              "What remains open — validation gaps",
              "Recommended next step — highest-value action",
              "Confidence breakdown (optional) — technical scores for analysts",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="story">
        <KnowledgeSection id="investigation-story" title="Investigation Story">
          <KnowledgeLead>
            Chronological narrative from raw scanner input through correlation, graph generation,
            validation, and report synthesis. Use this when you need to explain how VANE reached
            its conclusion.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="findings">
        <KnowledgeSection id="confirmed-findings" title="Confirmed Findings">
          <KnowledgeLead>
            Each retained finding with full reasoning. The highest-priority card opens by default.
            Expand any card for proof, confidence contributors, and alternative explanations the
            engine considered.
          </KnowledgeLead>
          <ConfidenceScale
            levels={[
              { pct: "80%+", label: "High — strong evidence, act with confidence" },
              { pct: "55–79%", label: "Moderate — likely real, validate before escalation" },
              { pct: "30–54%", label: "Low — documented exposure, reproduction needed" },
              { pct: "<30%", label: "Very low — treat as lead, not confirmed exploit" },
            ]}
          />
          <p className="pt-2">
            Status <strong className="text-white">Needs validation</strong> means the finding is
            supported in evidence but successful exploitation was not demonstrated in this
            environment.
          </p>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="timeline">
        <KnowledgeSection id="evidence-timeline" title="Evidence Timeline">
          <KnowledgeLead>
            Step-by-step path showing how confidence was built for the priority finding — which
            scanner signals contributed and how much each step moved the score.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="missing">
        <KnowledgeSection id="missing-evidence" title="Missing Evidence">
          <KnowledgeLead>
            Gaps VANE could not close. Each item explains why the gap matters and how filling it
            would change confidence — use this as your collection checklist for the next scan or
            manual test.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="recommendations">
        <KnowledgeSection id="recommendations-section" title="Recommendations">
          <KnowledgeLead>
            Prioritized tasks (P1, P2, …) ordered by investigation value. Each lists the expected
            outcome and optional confidence gain if you complete it.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="attack-graph">
        <KnowledgeSection id="attack-graph-guide" title="Attack Graph">
          <KnowledgeLead>
            Interactive model linking internet exposure to assets, services, software versions, and
            vulnerabilities. The graph loads zoomed out so wide environments fit vertically; drag
            inside the canvas to pan sideways and follow the full chain.
          </KnowledgeLead>
          <FlowDiagram
            lines={[
              "Endpoint (internet)",
              "↓ exposed to",
              "Asset (host IP)",
              "↓ runs",
              "Service (port)",
              "↓ runs",
              "Software (version)",
              "↓ may affect",
              "Vulnerability (CVE)",
            ]}
          />
          <BulletGrid
            items={[
              "Drag to pan — move left/right across long chains",
              "Pinch or trackpad zoom — optional zoom in/out",
              "Scroll wheel — scrolls the page, not the graph",
              "Node labels — type, identifier, and confidence where available",
            ]}
          />
          <p>
            Blocked paths appear below the graph with why the chain stopped and what evidence would
            unlock it.
          </p>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ask-vane">
        <KnowledgeSection id="ask-vane-ai" title="Ask VANE AI">
          <KnowledgeLead>
            Each report section has one Ask VANE AI control in the section header. Click it to open
            the analyst panel and receive a deep explanation of that section — summary, operational
            detail, and prioritized recommendations — grounded only in engine facts.
          </KnowledgeLead>
          <PromptList
            prompts={[
              "Explain the Executive Summary and what I should tell my CISO",
              "Why is exploit confidence low but risk is high?",
              "What should I validate first on the top finding?",
              "Walk me through the attack graph path to CVE-2021-41773",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="analyst">
        <KnowledgeSection id="analyst-panel" title="Analyst Panel">
          <KnowledgeLead>
            The right-hand chat is for questions, briefings, and section deep-dives. It does not
            re-run the engine; it interprets what is already in the report.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Opens automatically when you Ask VANE AI on a section",
              "Keyboard: Ctrl/Cmd+K focuses the analyst input",
              "Clear chat resets the conversation for the same investigation",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="advanced">
        <KnowledgeSection id="advanced-sections" title="Advanced Sections">
          <KnowledgeLead>
            Collapsed sections at the bottom hold supporting detail. Expand only when you need audit
            trail or parser diagnostics.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Business Impact — operational meaning of technical findings",
              "Investigation Timeline — engine event log",
              "Evidence Files — per-file parser output",
              "Investigation Metadata — scan counts and scope stats",
              "Developer Details — hypotheses; File Contribution and Parser Pipeline are collapsed by default",
            ]}
          />
          <p className="pt-4">
            For engine doctrine (discovery, validation, scoring architecture), see{" "}
            <Link href="/methodology" className="font-bold text-white underline underline-offset-2">
              Methodology
            </Link>
            . For analyst workflows and comms templates, see{" "}
            <Link href="/playbooks" className="font-bold text-white underline underline-offset-2">
              Playbooks
            </Link>
            .
          </p>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
