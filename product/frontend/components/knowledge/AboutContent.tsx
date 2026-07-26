"use client";

import { KnowledgeLead, KnowledgeSection, TerminalBlock } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "what", label: "What VAYNE Is" },
  { id: "not", label: "What It Is Not" },
  { id: "version", label: "Version & Credit" },
  { id: "architecture", label: "Architecture" },
  { id: "ui", label: "The Workstation Promise" },
  { id: "opensource", label: "Open Source Expectations" },
];

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[1.75] text-white/90">{children}</p>;
}

export function AboutContent() {
  return (
    <KnowledgeShell title="About VAYNE" sections={TOC}>
      <KnowledgeSectionWrap id="what">
        <KnowledgeSection id="what-body" title="What VAYNE Is">
          <KnowledgeLead>
            VAYNE is an investigation operating system for attack reasoning. It takes the noisy
            exports of security scanners and runs a deterministic engine that correlates evidence,
            validates exploitability claims, rejects weak paths, ranks what deserves human attention,
            and streams proof into Engine Trace while Investigation Engine shows status and priority
            cards. Ask VAYNE exists to explain those frozen conclusions in language humans can carry
            into reviews.
          </KnowledgeLead>
          <P>
            The product tagline is deliberate: deterministic correlation, prioritization, and
            investigation generation — AI explains engine conclusions only. That sentence is not
            marketing garnish; it is the acceptance test for features. If a change lets chat invent
            a score, it is not VAYNE-shaped work.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="not">
        <KnowledgeSection id="not-body" title="What It Is Not">
          <P>
            VAYNE is not a vulnerability scanner. It will not replace Nmap or Nuclei; it consumes
            them. It is not a generic chatbot over PDFs or a ticket UI that sorts by severity
            forever. It is not an LLM agent that “decides” retain versus false positive in place of
            validation. It is not a dashboard that hides ignores — Why We Ignored the Rest is part
            of the product surface precisely so silence cannot masquerade as safety.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="version">
        <KnowledgeSection id="version-body" title="Version & Credit">
          <P>
            The engine package declares version 0.2.0. The Investigation Engine chrome surfaces that
            same Version field alongside Created By Nemzyi on idle and live runs, because operators
            should always know which scoring generation produced the Trace they are reading. When
            documentation and chrome disagree, treat that as a defect.
          </P>
          <TerminalBlock>{`Product:     VAYNE
Version:     0.2.0
Created By:  Nemzyi
UI package:  product/frontend
API package: product/backend
Engine:      vayne/`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="architecture">
        <KnowledgeSection id="architecture-body" title="Architecture">
          <P>
            The Python engine owns parsers, correlator, validator, confidence, attack paths,
            priority, investigation export, and engine_trace instrumentation. FastAPI exposes analyze
            and investigation APIs, chat quota, and persistence against PostgreSQL plus filesystem
            storage. The Next.js workstation streams analyze events, renders the three-panel dock,
            restores sessions, and hosts these knowledge pages.
          </P>
          <P>
            Streaming analyze is preferred so Trace stays honest; classic analyze remains a fallback
            when streaming is unavailable. Either path must still respect AI Boundary semantics once
            deterministic stages complete.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ui">
        <KnowledgeSection id="ui-body" title="The Workstation Promise">
          <P>
            Desktop users get sidebar plus Investigation Engine, Engine Trace, and VAYNE Analyst at
            39 / 29 / 31 identity widths with draggable tabs. Logo resume returns you to the active
            investigation without wiping it. New Investigation is the explicit clean break. Free-tier
            Ask VAYNE defaults to four messages. Knowledge navigation teaches the same UI you operate
            — Tutorial, Playbooks, Methodology, Engine Documentation, Research, Roadmap, and this
            About page.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="opensource">
        <KnowledgeSection id="opensource-body" title="Open Source Expectations">
          <P>
            Treat formulas, Trace stage names, and UI contracts as public API. Prefer fixtures and
            reproducible exports over demo theater. Document weight changes beside code. Keep LLM
            features behind AI Boundary. If you fork scoring, say which 0.2.0 baselines you left
            behind so operators are not gaslit by familiar chrome with unfamiliar math.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
