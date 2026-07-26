"use client";

import {
  BulletGrid,
  CompareBlock,
  FlowDiagram,
  KnowledgeLead,
  KnowledgeSection,
  PromptList,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "layout", label: "Workstation Layout" },
  { id: "sidebar", label: "Sidebar" },
  { id: "ingest", label: "Ingest Evidence" },
  { id: "live-run", label: "Live Engine Run" },
  { id: "trace", label: "Engine Trace" },
  { id: "priority", label: "Priority Findings" },
  { id: "report", label: "Full Report" },
  { id: "brief", label: "Investigation Brief" },
  { id: "details", label: "Optional Details" },
  { id: "ask", label: "Ask VAYNE" },
  { id: "swap", label: "Panel Swap" },
  { id: "mobile", label: "Mobile" },
  { id: "history", label: "History" },
  { id: "limits", label: "Limits" },
  { id: "troubleshoot", label: "Troubleshooting" },
];

export function TutorialContent() {
  return (
    <KnowledgeShell title="Investigation Tutorial" sections={TOC}>
      <KnowledgeSectionWrap id="overview">
        <KnowledgeSection id="overview-body" title="Overview">
          <KnowledgeLead>
            VAYNE v0.2.0 (Created By Nemzyi) is an investigation operating system: a deterministic
            Python engine correlates scanner evidence into attack reasoning, and the product UI
            streams that work live. The LLM (Ask VAYNE) explains engine conclusions — it does not
            invent scores, retain/reject findings, or build paths.
          </KnowledgeLead>
          <TerminalBlock>{`Product:     VAYNE
Version:     0.2.0
Created By:  Nemzyi
UI shell:    product/frontend (Next.js)
API:         product/backend (FastAPI)
Engine:      vayne/ (Python package)

Core loop:
  ingest artifacts → engine stages stream → priority cards →
  View full report → Investigation Brief + Optional Details → Ask VAYNE`}</TerminalBlock>
          <BulletGrid
            items={[
              "Deterministic engine first — AI second",
              "Three desktop panels: Engine · Trace · Analyst",
              "Logo returns to the active investigation",
              "New Investigation clears the active session",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="layout">
        <KnowledgeSection id="layout-body" title="Workstation Layout">
          <KnowledgeLead>
            On desktop (viewport ≥ 1024px) the shell is a fixed left sidebar plus three swappable
            columns. Widths are bound to panel identity, not column index: Investigation Engine 39%,
            Engine Trace 29%, VAYNE Analyst 31%. Order is stored in localStorage key
            vayne-workspace-panel-order-v3.
          </KnowledgeLead>
          <CompareBlock
            left={{
              label: "Investigation Engine",
              body: "Status dashboard — ASCII VAYNE ENGINE mark, version/phase/files/progress, ingest controls, Priority findings (≤6 cards).",
            }}
            right={{
              label: "Engine Trace",
              body: "Live CLI-style stage telemetry and formula evaluations. PATH DISCOVERY / proof dumps render at the bottom after later stages.",
            }}
          />
          <CompareBlock
            left={{
              label: "VAYNE Analyst",
              body: "Chat that explains engine output. Shows free-tier remaining count. Optional post-ingest briefing prompt.",
            }}
            right={{
              label: "Sidebar",
              body: "~20% width (min 272px / max 320px): logo, New Investigation, Tutorial→About nav, Investigation History, account.",
            }}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="sidebar">
        <KnowledgeSection id="sidebar-body" title="Sidebar">
          <KnowledgeLead>
            Resource pages (this Tutorial, Playbooks, Methodology, Engine Documentation, Research,
            Roadmap, About VAYNE) open in the main column while keeping the same sidebar chrome.
            Clicking the VAYNE logo resumes the active investigation via /?id=&lt;id&gt; instead of
            wiping state. New Investigation clears conversation + active id and returns to idle home.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Tutorial — operator guide (this page)",
              "Playbooks — step-by-step runbooks",
              "Methodology — attack-reasoning doctrine",
              "Engine Documentation — formulas & weights",
              "Research — threat / FP reference",
              "Roadmap — shipped / building / next",
              "About VAYNE — product purpose",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ingest">
        <KnowledgeSection id="ingest-body" title="Ingest Evidence">
          <KnowledgeLead>
            From the idle Investigation Engine panel use Ingest File, Ingest Folder, or drag files
            onto the panel. Supported families include Nmap, Nuclei, Burp, Nessus, OpenVAS, Httpx,
            Naabu, Katana, Qualys, Rapid7/Nexpose/InsightVM, SARIF, plus JSON/XML/HTML/TXT/CSV
            heuristics. Multi-file runs can Merge into one investigation (combined) or Analyze files
            separately (separate mode).
          </KnowledgeLead>
          <FlowDiagram
            lines={[
              "Ingest File / Folder / drop artifacts",
              "↓",
              "Validation → POST /api/analyze/stream (fallback: /api/analyze)",
              "↓",
              "Engine Trace streams stages · Engine panel shows progress + priority cards",
              "↓",
              "Complete → View full report (Investigation Workspace)",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="live-run">
        <KnowledgeSection id="live-run-body" title="Live Engine Run">
          <KnowledgeLead>
            While running, Investigation Engine meta updates from phase telemetry: Current Phase,
            Files Ingested / Processed, Engine Status (Running → Complete), Execution Time, Version
            0.2.0, Created By Nemzyi. Progress percentage advances as real stages complete (not a
            fake timer).
          </KnowledgeLead>
          <TerminalBlock>{`Phase order (UI labels):
  Parser → Normalizer → Deduplicator → Correlation Engine →
  Validation Engine → Confidence Engine → Attack Graph Builder →
  Priority Engine → Investigation Generator → Export →
  Engine Summary → AI Boundary

AI Boundary means deterministic work finished; LLM was not used to score.`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="trace">
        <KnowledgeSection id="trace-body" title="Engine Trace">
          <KnowledgeLead>
            Engine Trace is the proof console. Idle standby: “Ingest scanner evidence to stream live
            CLI proof…”. During a run you see stage blocks (files processed, findings extracted,
            correlation merges, validation retained/FP, finding_confidence() / priority_score()
            lines, graph node/edge counts, path accept/reject). Proof-mode PATH DISCOVERY dumps are
            buffered and appended at the bottom after Investigation Generator and later stages.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Vertical scroll only",
              "Resume auto-scroll when you leave the bottom",
              "Returning from docs re-fetches stored engine-trace events",
              "Empty Trace after resume usually means no stored telemetry for that id",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="priority">
        <KnowledgeSection id="priority-body" title="Priority Findings">
          <KnowledgeLead>
            Up to six Priority findings cards appear on the Engine dashboard, ranked by engine
            priority score — not severity labels alone. Each card shows severity, optional PATH
            badge, priority P n, title, confidence %, host (+N), source file, analyst-facing Reason
            lines (e.g. Observed by Nmap, Corroborated by Nuclei, Internet-facing), and Open
            Investigation →.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="report">
        <KnowledgeSection id="report-body" title="Full Report">
          <KnowledgeLead>
            Click View full report (when the run is complete) to open Investigation Workspace. The
            Engine Status / Trace live session remains recoverable via View Engine Session when
            telemetry exists. The report is engine output; Ask VAYNE is optional explanation.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="brief">
        <KnowledgeSection id="brief-body" title="Investigation Brief">
          <KnowledgeLead>
            The Brief sits above Optional Details: workload/review headlines, metric tiles, Start
            Here (priority investigation, evidence files, chain, analyst tasks, expected review
            minutes), Why We Ignored the Rest (duplicates, informational, mitigated, contradicted,
            low impact, FPs, noise), Reasoning pipeline (Evidence → Correlation → Business Context →
            Conclusion), and Change Detection.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="details">
        <KnowledgeSection id="details-body" title="Optional Details">
          <KnowledgeLead>
            Collapsible sections (each with Ask VAYNE about this section): Attack Graph, Findings,
            Impact, Confidence, Evidence, Recommendations, Timeline, Reasoning, Engine Conclusions,
            Missing Evidence, Evidence Timeline, Evidence Files, Investigation Notes. Combined
            multi-file runs may show evidence attribution across sources.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ask">
        <KnowledgeSection id="ask-body" title="Ask VAYNE">
          <KnowledgeLead>
            VAYNE Analyst is the chat column. After ingest you may see an Evidence detected briefing
            prompt (Explain investigation / Skip). Free tier defaults to 4 Ask VAYNE messages
            (VAYNE_FREE_CHAT_LIMIT) including section asks — enforced server-side. Composer
            placeholders: with a bundle “Ask about findings, paths, evidence…”; without “Ask VAYNE
            about cybersecurity…”.
          </KnowledgeLead>
          <PromptList
            prompts={[
              "Why was this path rejected?",
              "Summarize the top priority finding in plain language",
              "What evidence supports the confidence on finding X?",
              "What should I verify manually next?",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="swap">
        <KnowledgeSection id="swap-body" title="Panel Swap">
          <KnowledgeLead>
            Drag a panel’s active tab title onto another panel to swap positions. Engine stays 39%,
            Trace 29%, Analyst 31% wherever they sit. Drop highlight uses a light inset ring. File
            drops onto the Engine panel ignore panel-reorder MIME types so ingest and swap do not
            collide.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="mobile">
        <KnowledgeSection id="mobile-body" title="Mobile">
          <KnowledgeLead>
            Below lg: fixed top bar (menu, logo, Ask). Sidebar is a drawer. Main column stacks
            Investigation Engine (flex) over Engine Trace (~42vh). Analyst opens fullscreen overlay.
            Prefer desktop for three-column investigation work.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="history">
        <KnowledgeSection id="history-body" title="History">
          <KnowledgeLead>
            Investigation History lists recent runs (synced from API + local cache). Selecting a row
            navigates to /?id=&lt;id&gt;, restores messages/bundles, and reloads Engine Trace events
            when available so Trace is not empty after leaving docs pages.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="limits">
        <KnowledgeSection id="limits-body" title="Limits">
          <BulletGrid
            items={[
              "Free Ask VAYNE: 4 messages (default)",
              "Priority cards: max 6 per run",
              "Engine scores: deterministic — not LLM",
              "AI Boundary: explanation only after engine",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="troubleshoot">
        <KnowledgeSection id="troubleshoot-body" title="Troubleshooting">
          <TerminalBlock>{`Empty Engine Trace after leaving Tutorial/docs
  → Resume should refetch /api/investigation/:id/engine-trace
  → If still empty, that investigation has no stored telemetry

Logo goes to empty home
  → No active investigation id (New Investigation clears it)
  → Start ingest or open a history row

Panels crushed / missing
  → Desktop only (lg+). Hard refresh. Order key: vayne-workspace-panel-order-v3

Stream fails
  → UI falls back to classic /api/analyze; Trace may be thinner`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
