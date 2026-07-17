"use client";

import { KnowledgeLead, KnowledgeSection, KnowledgeSeeAlso, ManifestoBlock, TerminalBlock } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "why", label: "Why VAYNE Exists" },
  { id: "belief", label: "Our Belief" },
  { id: "manifesto", label: "Manifesto" },
];

export function AboutContent() {
  return (
    <KnowledgeShell
      title="About"
      subtitle="The VAYNE manifesto — why attack reasoning exists and what the future of cybersecurity intelligence looks like."
      classification="MANIFESTO // FOUNDING DOCTRINE"
      sections={TOC}
    >
      <div className="mb-10">
        <KnowledgeSeeAlso />
      </div>
      <KnowledgeSectionWrap id="why">
        <KnowledgeSection id="why-exists" title="Why VAYNE Exists">
          <KnowledgeLead>
            Traditional cybersecurity tools answer one question. VAYNE answers the question that
            actually matters.
          </KnowledgeLead>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-white/20 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Traditional Tools
              </p>
              <p className="mt-2 font-mono text-[14px] font-black text-white">
                &quot;What exists?&quot;
              </p>
            </div>
            <div className="border border-white px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">VAYNE</p>
              <p className="mt-2 font-mono text-[14px] font-black text-white">
                &quot;What matters?&quot;
              </p>
            </div>
          </div>
          <p>
            Security analysts spend most of their time correlating evidence, validating findings,
            rejecting false positives, building attack chains, and writing reports. VAYNE exists to
            automate attack reasoning — not detection alone.
          </p>
          <BulletList />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="belief">
        <KnowledgeSection id="our-belief" title="Our Belief">
          <ManifestoBlock>
            The future of cybersecurity is not more scanners, more alerts, or more dashboards.
          </ManifestoBlock>
          <p className="pt-4 text-[15px] font-black uppercase tracking-wider text-white">
            The future of cybersecurity is reasoning.
          </p>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="manifesto">
        <KnowledgeSection id="closing" title="Manifesto">
          <TerminalBlock>{`VAYNE

Attack Reasoning Engine

Built to think.
Not just detect.`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}

function BulletList() {
  const items = [
    "Correlating evidence",
    "Validating findings",
    "Rejecting false positives",
    "Building attack chains",
    "Writing reports",
  ];
  return (
    <ul className="space-y-2 border border-white/15 px-5 py-4">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-3 text-[13px] text-white/65">
          <span className="text-white/30">—</span>
          {item}
        </li>
      ))}
    </ul>
  );
}
