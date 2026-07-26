"use client";

import { KnowledgeLead, KnowledgeSection, TerminalBlock } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "intro", label: "Introduction" },
  { id: "layout", label: "The Workstation" },
  { id: "sidebar", label: "Sidebar & Navigation" },
  { id: "ingest", label: "Ingesting Evidence" },
  { id: "live", label: "Watching a Live Run" },
  { id: "trace", label: "Reading Engine Trace" },
  { id: "priority", label: "Priority Findings" },
  { id: "report", label: "After View Full Report" },
  { id: "ask", label: "Ask VAYNE" },
  { id: "panels", label: "Swapping Panels" },
  { id: "mobile", label: "Mobile Behavior" },
  { id: "resume", label: "Resume & History" },
  { id: "limits", label: "Limits & Failure Modes" },
];

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[1.75] text-white/90">{children}</p>;
}

export function TutorialContent() {
  return (
    <KnowledgeShell title="Investigation Tutorial" sections={TOC}>
      <KnowledgeSectionWrap id="intro">
        <KnowledgeSection id="intro-body" title="Introduction">
          <KnowledgeLead>
            This tutorial is the operator manual for the VAYNE product workstation as it ships in
            engine line 0.2.0 (Created By Nemzyi). It describes the UI you actually see — not an
            abstract architecture diagram — and it assumes you will run real scanner exports through
            the deterministic engine while Engine Trace streams proof beside you.
          </KnowledgeLead>
          <P>
            VAYNE is an investigation operating system. Scanners such as Nmap, Nuclei, Burp, Nessus,
            OpenVAS, Httpx, Naabu, Katana, Qualys, Rapid7-family tools, and SARIF producers emit
            observations. The Python package under <code className="text-white/70">vayne/</code>{" "}
            parses, normalizes, deduplicates, correlates, validates, scores confidence, builds an
            attack graph, ranks priority, and exports an investigation. The Next.js shell in{" "}
            <code className="text-white/70">product/frontend</code> is the live instrument panel for
            that work. The FastAPI service in{" "}
            <code className="text-white/70">product/backend</code> wires ingest and persistence.
          </P>
          <P>
            The most important mental model is the AI Boundary. Scores, retention decisions, path
            acceptance, and priority ranks come from the engine. Ask VAYNE (the Analyst column) may
            explain those conclusions in prose after the fact. It does not invent CVSS, does not
            silently re-open false positives, and does not redraw the graph. When Trace shows “AI
            Boundary,” deterministic work is finished.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="layout">
        <KnowledgeSection id="layout-body" title="The Workstation">
          <P>
            On a desktop viewport at least 1024px wide, the shell is a fixed left sidebar plus three
            main columns. The sidebar occupies roughly twenty percent of the width (clamped between
            about 272px and 320px). It holds the brand lockup, New Investigation, the documentation
            links you are reading now, Investigation History, and account chrome.
          </P>
          <P>
            The remaining width is a CSS grid of three swappable panels whose fractions are tied to
            panel identity, not to left/middle/right slot. Investigation Engine is always
            thirty-nine percent of that dock, Engine Trace twenty-nine percent, and VAYNE Analyst
            thirty-one percent — even after you drag tabs to reorder them. That mapping lives in
            localStorage under <code className="text-white/70">vayne-workspace-panel-order-v3</code>{" "}
            so your preferred order survives reloads.
          </P>
          <P>
            Investigation Engine is the status dashboard: the ASCII VAYNE / ENGINE wordmark, metadata
            rows (Version 0.2.0, Created By Nemzyi, current phase, files ingested and processed,
            engine status, execution time), ingest controls when idle, a progress bar while running,
            and Priority findings cards when the Priority Engine has something to say. Engine Trace
            is the proof console — stage telemetry, formula evaluations, and PATH DISCOVERY dumps.
            VAYNE Analyst is the explanation chat with a free-tier remaining count in the dock.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="sidebar">
        <KnowledgeSection id="sidebar-body" title="Sidebar & Navigation">
          <P>
            Resource pages open in the main column while the sidebar stays mounted: Tutorial,
            Playbooks, Methodology, Engine Documentation, Research, Roadmap, and About VAYNE. Leaving
            the home investigation for a docs page does not clear your active investigation id. Click
            the VAYNE logo and the shell navigates to <code className="text-white/70">/?id=…</code>{" "}
            for that active id when one exists, restoring messages, bundles, and — when the API still
            has them — Engine Trace events so Trace is not empty when you return.
          </P>
          <P>
            New Investigation is the destructive reset. It clears conversation state, clears the
            active investigation id, and returns you to idle home. Use it when you intend to start
            clean; use the logo when you intend to resume.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ingest">
        <KnowledgeSection id="ingest-body" title="Ingesting Evidence">
          <P>
            From the idle Investigation Engine panel you can Ingest File, Ingest Folder, or drag
            artifacts onto the panel. Drag-and-drop for files ignores the panel-reorder MIME type so
            swapping columns and dropping evidence do not collide. The engine’s parser loader maps
            hints and file shapes onto families including nuclei, nmap, burp, nessus, openvas, httpx,
            naabu, katana, qualys, rapid7 / nexpose / insightvm, sarif, and generic JSON heuristics
            for prowler-like exports, plus CSV and common XML/HTML/TXT detection.
          </P>
          <P>
            When multiple files are staged you choose combined versus separate mode. Combined merges
            evidence into one investigation narrative — the usual path when Nmap, Nuclei, and Burp
            describe the same estate. Separate analyzes files as distinct investigations when fusion
            would be dishonest (different tenants, engagements, or timeboxes). The UI labels these as
            merge versus analyze separately; the engine and API speak{" "}
            <code className="text-white/70">combined</code> and{" "}
            <code className="text-white/70">separate</code>.
          </P>
          <P>
            Ingest kicks a streaming analyze call when available (
            <code className="text-white/70">POST /api/analyze/stream</code>
            ). If streaming fails, the client falls back to classic{" "}
            <code className="text-white/70">/api/analyze</code>. Streaming is what feeds Engine Trace
            line-by-line; the fallback still completes an investigation but Trace may be thinner.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="live">
        <KnowledgeSection id="live-body" title="Watching a Live Run">
          <P>
            As soon as analysis starts, Investigation Engine leaves idle. Metadata rows update from
            phase telemetry: Current Phase advances through Parser, Normalizer, Deduplicator,
            Correlation Engine, Validation Engine, Confidence Engine, Attack Graph Builder, Priority
            Engine, Investigation Generator, Export, Engine Summary, and finally AI Boundary. Files
            Ingested and Files Processed tick as real work completes. Engine Status moves from
            Running toward Complete. Execution Time fills in elapsed seconds. Version and Created By
            continue to show 0.2.0 and Nemzyi as emitted by the instrumented engine.
          </P>
          <P>
            Progress percentage is driven by stage completion weights in the engine’s instrumentation
            — it is not a cosmetic timer. Stay on the live session until you intentionally click View
            full report; that is the designed handoff from “watching proof” to “reading the brief.”
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="trace">
        <KnowledgeSection id="trace-body" title="Reading Engine Trace">
          <P>
            Engine Trace is where you defend the run. Idle standby copy invites you to ingest so
            proof can stream. While running, stages render as blocks: parser counts (files, findings,
            assets, hosts, ports, services), normalization schema notes, deduplication raw versus
            unique, correlation merges with scanner agreement samples, validation retained versus
            false positives, confidence and priority formula evaluations, graph node and edge
            statistics, accepted and rejected paths, investigation generation counts, export and
            summary rollups, and the AI Boundary marker.
          </P>
          <P>
            Proof-mode lines — the CLI-faithful PATH DISCOVERY / VAYNE PROOF MODE dumps — are
            buffered and appended at the bottom after Investigation Generator and the later stages.
            That ordering is deliberate: read structured stage math first, then the long proof
            appendix. The panel scrolls vertically only; if you scroll up, use Resume auto-scroll
            when you want to follow the tail again.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="priority">
        <KnowledgeSection id="priority-body" title="Priority Findings">
          <P>
            The Priority Engine emits at most six attention cards onto the Investigation Engine
            dashboard. Ranking uses composite priority, not severity labels alone. Each card carries
            severity, an optional PATH badge when the finding sits on an accepted attack path,
            priority P n, title, confidence percent, affected host (and +N when more hosts share it),
            source file, and a Reason list written for analysts — lines such as Observed by Nmap,
            Corroborated by Nuclei and Burp, Internet-facing, No exploit evidence, or Single-source
            observation. Opaque internals like <code className="text-white/70">model=</code> strings
            are filtered out of what you see.
          </P>
          <P>
            Open Investigation → is the bridge into the full report context for that finding. If the
            cards area stays empty while status is Complete, the Priority Engine simply had nothing
            above the emission bar for that run — check Trace for priority evaluations and the Brief
            later for Why We Ignored the Rest.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="report">
        <KnowledgeSection id="report-body" title="After View Full Report">
          <P>
            View full report opens Investigation Workspace. Above the fold you get the Investigation
            Brief: workload and review headlines, metric tiles, Start Here (what to investigate first,
            which evidence files matter, the evidence chain, concrete analyst tasks, expected review
            minutes), Why We Ignored the Rest (duplicates, informational, mitigated, contradicted,
            low impact, false positives, noise), a Reasoning narrative that walks Evidence →
            Correlation → Business Context → Conclusion, and Change Detection when a prior snapshot
            exists.
          </P>
          <P>
            Below the Brief, Optional Details are collapsible sections — Attack Graph, Findings,
            Impact, Confidence, Evidence, Recommendations, Timeline, Reasoning, Engine Conclusions,
            Missing Evidence, Evidence Timeline, Evidence Files, Investigation Notes. Each section
            header can offer Ask VAYNE about this section, which ships scoped engine context into the
            Analyst column and spends free-tier quota like a normal ask. Combined multi-file runs may
            show attribution across source files so you can see which export contributed what.
          </P>
          <P>
            If you need the live Engine Status session again, View Engine Session (when telemetry
            exists) returns you to the workstation framing. Resume-from-docs also rehydrates Trace
            events from <code className="text-white/70">/api/investigation/:id/engine-trace</code>.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ask">
        <KnowledgeSection id="ask-body" title="Ask VAYNE">
          <P>
            VAYNE Analyst is the right-hand explanation surface. After ingest you may see an Evidence
            detected briefing card offering Explain investigation or Skip. Explaining runs a structured
            briefing stream into the chat; skipping leaves the dock quiet until you ask. The composer
            placeholder shifts with context: with a loaded bundle it asks about findings, paths, and
            evidence; without a bundle it invites general cybersecurity questions.
          </P>
          <P>
            Free tier defaults to four Ask VAYNE messages (
            <code className="text-white/70">VAYNE_FREE_CHAT_LIMIT</code>), enforced server-side in
            the product API and mirrored in the dock (“N free Ask VAYNE messages left”). Section asks
            count against the same budget. Spend asks after you have read Start Here and at least the
            top priority card — the model is strongest when grounded in engine artifacts you already
            understand.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="panels">
        <KnowledgeSection id="panels-body" title="Swapping Panels">
          <P>
            Drag a panel’s active tab title onto another panel to swap their positions. A light inset
            ring marks the drop target. Engine, Trace, and Analyst keep their 39 / 29 / 31 width
            shares as they move, so Investigation Engine never collapses into a narrow proof column
            by accident. Order persistence means the next visit opens the way you left the dock.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="mobile">
        <KnowledgeSection id="mobile-body" title="Mobile Behavior">
          <P>
            Below the lg breakpoint the three-column dock does not apply. A fixed top bar exposes
            menu, logo, and Ask. The sidebar becomes a drawer. The main column stacks Investigation
            Engine above Engine Trace at roughly forty-two percent viewport height. Analyst opens as
            a fullscreen overlay. Serious investigation work still belongs on desktop where Trace and
            Engine can sit side by side.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="resume">
        <KnowledgeSection id="resume-body" title="Resume & History">
          <P>
            Investigation History lists recent runs from local cache synchronized with the API.
            Selecting a row navigates to the investigation id, restores chat and report bundles, and
            refetches engine-trace telemetry when the backend still holds it. That is why Trace
            should repopulate after you browse Tutorial or Engine Documentation and click the logo
            home.
          </P>
          <P>
            If Trace stays empty after resume, the investigation likely has no stored telemetry
            (older run, wiped storage, or analyze completed only through the non-streaming fallback
            without persisted events). The report can still be intact; re-ingest if you need proof
            lines again.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="limits">
        <KnowledgeSection id="limits-body" title="Limits & Failure Modes">
          <P>
            Expect at most six priority cards, four free Ask VAYNE messages by default, and an AI
            Boundary that forbids the LLM from rewriting scores. Streaming analyze may fall back to
            classic analyze — watch the browser console for the fallback warning. Backend health and
            analyst online flags are polled from the workstation; if health is down, ingest will
            fail loudly rather than fake a run.
          </P>
          <TerminalBlock>{`Quick checks
  Backend health green · Analyst online if you need chat
  Trace stages while Running · Priority cards ≤6 on Complete
  Logo resume restores Trace when /engine-trace has data
  New Investigation clears active id on purpose`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
