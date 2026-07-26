"use client";

import {
  BulletGrid,
  KnowledgeLead,
  KnowledgeSection,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "now", label: "v0.2.0 Shipped" },
  { id: "ui", label: "Workstation UI" },
  { id: "engine", label: "Engine" },
  { id: "building", label: "In Progress" },
  { id: "next", label: "Next" },
  { id: "horizon", label: "Horizon" },
];

export function RoadmapContent() {
  return (
    <KnowledgeShell title="Roadmap" sections={TOC}>
      <KnowledgeSectionWrap id="now">
        <KnowledgeSection id="now-body" title="v0.2.0 Shipped">
          <KnowledgeLead>
            Current released engine/UI line is VAYNE 0.2.0 (Created By Nemzyi). The product shell
            ships a live investigation workstation over the deterministic Python engine.
          </KnowledgeLead>
          <TerminalBlock>{`Shipped in 0.2.0 (product + engine):
  • Investigation Engine dashboard (ASCII mark, phase, progress, ≤6 priority cards)
  • Engine Trace live stages + PATH DISCOVERY deferred to bottom
  • VAYNE Analyst chat with free-tier quota (default 4)
  • Swappable panels 39/29/31 with persisted order
  • Logo resume of active investigation (does not wipe session)
  • Analyst-facing priority reasons (not opaque model= labels)
  • Multi-file combined / separate investigation modes
  • Parsers: nmap, nuclei, burp, nessus, openvas, httpx, naabu, katana, …
  • finding_confidence / priority_score / attack graph / validation stack
  • Investigation Brief + Optional Details report after View full report`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ui">
        <KnowledgeSection id="ui-body" title="Workstation UI">
          <BulletGrid
            items={[
              "Desktop three-column dock + sidebar history",
              "Mobile: engine + trace stack, analyst overlay",
              "Knowledge pages: Tutorial → About (this nav)",
              "Drag tab titles to reorder Engine / Trace / Analyst",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="engine">
        <KnowledgeSection id="engine-body" title="Engine">
          <BulletGrid
            items={[
              "Deterministic pipeline with engine_trace instrumentation",
              "AI Boundary after summary — scores stay engine-owned",
              "Quality / confidence weights documented on Engine Documentation",
              "PostgreSQL-backed product investigations + filesystem storage",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="building">
        <KnowledgeSection id="building-body" title="In Progress">
          <KnowledgeLead>
            Active engineering focuses on deeper parser fidelity, richer Trace proof formatting,
            tighter resume/hydration of long sessions, and analyst UX that spends free-tier asks
            more deliberately (section-scoped context).
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="next">
        <KnowledgeSection id="next-body" title="Next">
          <BulletGrid
            items={[
              "More scanner families + fixture coverage",
              "Stronger change-detection across reruns",
              "Export packs aligned 1:1 with Trace proof",
              "Collaborative investigation sharing (product)",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="horizon">
        <KnowledgeSection id="horizon-body" title="Horizon">
          <KnowledgeLead>
            Long-term: keep the doctrine stable — scanners observe, VAYNE reasons, humans decide —
            while expanding graph fidelity and enterprise deployment (async workers, richer
            retention policies) without letting LLMs own scoring.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
