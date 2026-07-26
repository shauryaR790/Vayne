"use client";

import { KnowledgeLead, KnowledgeSection, TerminalBlock } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "now", label: "Where 0.2.0 Stands" },
  { id: "ui", label: "Workstation Surface" },
  { id: "engine", label: "Engine Surface" },
  { id: "building", label: "Actively Building" },
  { id: "next", label: "Next Up" },
  { id: "horizon", label: "Horizon" },
];

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[1.75] text-white/90">{children}</p>;
}

export function RoadmapContent() {
  return (
    <KnowledgeShell title="Roadmap" sections={TOC}>
      <KnowledgeSectionWrap id="now">
        <KnowledgeSection id="now-body" title="Where 0.2.0 Stands">
          <KnowledgeLead>
            VAYNE 0.2.0 (Created By Nemzyi) is the current shipped line for both the Python engine
            and the product workstation. The roadmap below is written against that reality — what
            operators can touch today — rather than against aspirational mockups.
          </KnowledgeLead>
          <P>
            Today you can ingest multi-scanner evidence, watch deterministic stages in Engine Trace,
            receive at most six priority cards with human reasons, open a Brief that admits what was
            ignored, explore Optional Details including the attack graph, and spend a small free-tier
            Ask VAYNE budget on explanation. Panel layout is swappable with stable 39/29/31 identity
            widths, and logo navigation resumes the active investigation including Trace rehydrate
            when telemetry exists.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ui">
        <KnowledgeSection id="ui-body" title="Workstation Surface">
          <P>
            Shipped UI includes the sidebar resource set (Tutorial through About), Investigation
            History, mobile stacking behavior, ingest file/folder/drag-drop, combined versus separate
            modes, View full report handoff, section-scoped Ask buttons, and persistent panel order.
            Knowledge pages no longer carry classification banners or marketing subtitles above the
            ASCII titles — documentation chrome stays out of the way of the wordmark.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="engine">
        <KnowledgeSection id="engine-body" title="Engine Surface">
          <P>
            Shipped engine capability includes the parser roster (nmap, nuclei, burp, nessus,
            openvas, httpx, naabu, katana, qualys, rapid7-family, sarif, and generics), full
            judgment pipeline through priority and export, finding_confidence and priority_score
            composites, attack graph thresholds, risk scoring, analyst_reasons, and engine_trace
            instrumentation culminating in AI Boundary.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="building">
        <KnowledgeSection id="building-body" title="Actively Building">
          <P>
            Near-term engineering concentrates on parser fidelity for awkward real-world exports,
            richer Trace readability without losing CLI faithfulness, more reliable resume of long
            sessions after docs navigation, and Analyst flows that spend scarce free-tier asks on
            section-grounded questions. Change detection across reruns is being hardened so Brief
            comparisons feel less sparse on first-time estates.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="next">
        <KnowledgeSection id="next-body" title="Next Up">
          <P>
            Queued work includes additional scanner families with fixtures, export packs that mirror
            Trace proof more literally, collaborative sharing of investigations inside the product
            API, and operator controls for quota and retention that remain honest about the AI
            Boundary. Scoring changes will continue to require documentation updates beside code.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="horizon">
        <KnowledgeSection id="horizon-body" title="Horizon">
          <P>
            The long horizon keeps the doctrine stable: scanners observe, VAYNE judges, humans
            decide, LLMs explain. Scale ambitions — async workers, larger estates, deeper graph
            semantics — should not smuggle LLM ownership of retain/reject. If a future version
            blurs that line, it should bump the version story and say so explicitly here.
          </P>
          <TerminalBlock>{`North star metrics for roadmap reviews
  • Attention set quality (≤6 cards, fewer false crises)
  • Trace explainability (rejects understandable without chat)
  • Resume integrity (docs round-trip keeps proof)
  • AI Boundary integrity (zero score mutation by LLM)`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
