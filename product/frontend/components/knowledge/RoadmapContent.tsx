"use client";

import { KnowledgeLead, KnowledgeSection, KnowledgeSeeAlso, RoadmapColumn } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "shipped", label: "Shipped" },
  { id: "building", label: "Building" },
  { id: "next", label: "Next" },
  { id: "future", label: "Future" },
];

export function RoadmapContent() {
  return (
    <KnowledgeShell
      title="Roadmap"
      subtitle="Development trajectory for the VAYNE attack reasoning platform — shipped capabilities, active engineering, and strategic horizon."
      classification="ROADMAP // STRATEGIC"
      sections={TOC}
    >
      <div className="mb-10">
        <KnowledgeSeeAlso />
      </div>
      <KnowledgeSectionWrap id="shipped">
        <KnowledgeSection id="shipped-capabilities" title="Shipped">
          <KnowledgeLead>
            Production-ready capabilities currently operational in the VAYNE platform.
          </KnowledgeLead>
          <RoadmapColumn
            title="Production"
            variant="shipped"
            items={[
              "Attack Reasoning Engine",
              "Graph Engine",
              "Confidence Engine",
              "Proof Mode",
              "Investigation Reports",
              "Analyst Workspace",
              "Investigation Tutorial",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="building">
        <KnowledgeSection id="in-progress" title="Currently Building">
          <KnowledgeLead>Active engineering priorities in current development cycles.</KnowledgeLead>
          <RoadmapColumn
            title="In Progress"
            variant="building"
            items={[
              "VAYNE Analyst LLM",
              "Memory",
              "Conversation Engine",
              "Executive Reports",
              "Technical Reports",
              "SOC Reports",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="next">
        <KnowledgeSection id="next-phase" title="Next">
          <KnowledgeLead>Queued capabilities for upcoming release phases.</KnowledgeLead>
          <RoadmapColumn
            title="Queued"
            variant="next"
            items={[
              "Active Directory reasoning",
              "Cloud attack paths",
              "Kubernetes reasoning",
              "Identity attack graphs",
              "Threat intelligence fusion",
              "Multi-agent analysis",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="future">
        <KnowledgeSection id="strategic-horizon" title="Future">
          <KnowledgeLead>
            Long-horizon vision — autonomous security reasoning at organizational scale.
          </KnowledgeLead>
          <RoadmapColumn
            title="Horizon"
            variant="future"
            items={[
              "Autonomous pentesting",
              "Autonomous investigation",
              "Autonomous remediation",
              "Continuous attack simulation",
              "Enterprise security memory",
              "Organizational knowledge graph",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
