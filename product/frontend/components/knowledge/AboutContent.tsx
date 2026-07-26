"use client";

import {
  BulletGrid,
  CompareBlock,
  KnowledgeLead,
  KnowledgeSection,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "what", label: "What VAYNE Is" },
  { id: "not", label: "What It Is Not" },
  { id: "version", label: "Version" },
  { id: "architecture", label: "Architecture" },
  { id: "ui", label: "Current UI" },
  { id: "license-spirit", label: "Open Source Spirit" },
  { id: "contact", label: "Credits" },
];

export function AboutContent() {
  return (
    <KnowledgeShell title="About VAYNE" sections={TOC}>
      <KnowledgeSectionWrap id="what">
        <KnowledgeSection id="what-body" title="What VAYNE Is">
          <KnowledgeLead>
            VAYNE is an investigation operating system for attack reasoning. It ingests exports from
            security scanners, deterministically correlates and validates evidence, builds attack
            graphs, ranks what needs human attention, and streams proof in Engine Trace. Ask VAYNE
            explains those conclusions — it does not replace the engine.
          </KnowledgeLead>
          <CompareBlock
            left={{
              label: "Question scanners answer",
              body: "What exists? (ports, CVEs, alerts, templates)",
            }}
            right={{
              label: "Question VAYNE answers",
              body: "What matters? (validated paths, priority, explicit ignore reasons)",
            }}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="not">
        <KnowledgeSection id="not-body" title="What It Is Not">
          <BulletGrid
            items={[
              "Not a vulnerability scanner",
              "Not a generic chatbot over PDFs",
              "Not a severity-sorted ticket dump",
              "Not an LLM that invents CVSS or retain/reject",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="version">
        <KnowledgeSection id="version-body" title="Version">
          <TerminalBlock>{`Product name:     VAYNE
Engine version:   0.2.0   (vayne/__init__.py)
Created By:       Nemzyi
UI chrome shows the same Version / Created By on Investigation Engine
(idle home and live workstation).`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="architecture">
        <KnowledgeSection id="architecture-body" title="Architecture">
          <TerminalBlock>{`product/frontend   Next.js 14 · React 18 · TypeScript · Tailwind
product/backend    FastAPI product API
vayne/             Deterministic investigation engine (Python)

Wire path:
  UI ingest → /api/analyze/stream (or /api/analyze) →
  backend → vayne orchestrator →
  Engine Trace events + investigation artifacts →
  optional Ask VAYNE (OpenAI-compatible) for explanation`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ui">
        <KnowledgeSection id="ui-body" title="Current UI">
          <KnowledgeLead>
            Desktop workstation: sidebar + Investigation Engine (39%) + Engine Trace (29%) + VAYNE
            Analyst (31%), tabs draggable, widths bound to panel identity. Logo resumes the active
            investigation. Knowledge nav (Tutorial, Playbooks, Methodology, Engine Documentation,
            Research, Roadmap, About VAYNE) documents the same surface you are using.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="license-spirit">
        <KnowledgeSection id="license-spirit-body" title="Open Source Spirit">
          <KnowledgeLead>
            Treat formulas, Trace stages, and UI contracts as public surface area: document weights,
            keep AI behind the AI Boundary, and prefer reproducible fixtures over demo theater. If
            you change scoring, update Engine Documentation and bump narrative version notes.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="contact">
        <KnowledgeSection id="contact-body" title="Credits">
          <TerminalBlock>{`Created By:  Nemzyi
Product:     VAYNE — Investigation Operating System
Line:        Deterministic correlation, prioritization, and
             investigation generation — AI explains engine
             conclusions only.`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
