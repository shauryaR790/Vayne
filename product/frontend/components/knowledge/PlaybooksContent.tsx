"use client";

import {
  BulletGrid,
  CompareBlock,
  ConfidenceScale,
  FlowDiagram,
  ImpactTier,
  KnowledgeLead,
  KnowledgeSection,
  PromptList,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "intro", label: "Introduction" },
  { id: "attack-graph", label: "Attack Graph" },
  { id: "confidence", label: "Confidence" },
  { id: "rejected", label: "Rejected Paths" },
  { id: "impact", label: "Business Impact" },
  { id: "analyst-chat", label: "Talk to VAYNE" },
];

export function PlaybooksContent() {
  return (
    <KnowledgeShell
      title="Playbooks"
      subtitle="Operational guidance for reading VAYNE output, interpreting attack reasoning, and communicating findings to technical and executive audiences."
      classification="PLAYBOOK // ANALYST TRAINING"
      sections={TOC}
    >
      <KnowledgeSectionWrap id="intro">
        <KnowledgeSection id="intro-analysis" title="Introduction to VAYNE Analysis">
          <KnowledgeLead>
            Attack reasoning is the discipline of determining whether a vulnerability can become a
            business compromise — not merely whether it exists on a host.
          </KnowledgeLead>
          <p>
            Traditional scanners enumerate exposure. VAYNE constructs exploit chains, validates
            evidence, rejects false positives, and scores business impact. Vulnerabilities alone are
            insufficient because detection without context produces alert fatigue and misallocated
            remediation effort.
          </p>
          <CompareBlock
            left={{ label: "Scanner", body: '"CVE detected"' }}
            right={{ label: "VAYNE", body: '"Can this CVE actually compromise your business?"' }}
          />
          <BulletGrid
            items={[
              "Attack paths matter",
              "Evidence over alerts",
              "Validation before reporting",
              "Rejection is intelligence",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="attack-graph">
        <KnowledgeSection id="read-graph" title="How to Read an Attack Graph">
          <KnowledgeLead>
            The attack graph is a directed reasoning model — nodes represent entities, edges
            represent validated or candidate transitions.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Nodes — assets, services, software, vulnerabilities, credentials",
              "Edges — exploit, access, lateral movement, escalation",
              "Attack chains — validated paths from entry to impact",
              "Rejected chains — explored but insufficiently evidenced",
              "Confidence — probability of successful exploitation",
              "Blast radius — downstream assets at risk",
              "Attack depth — hops from initial access",
              "Lateral movement — privilege or network traversal",
            ]}
          />
          <FlowDiagram
            lines={[
              "Internet",
              "↓",
              "Web Server",
              "↓",
              "RCE",
              "↓",
              "Credential Access",
              "↓",
              "Domain Controller",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="confidence">
        <KnowledgeSection id="understand-confidence" title="Understanding Confidence">
          <KnowledgeLead>
            Confidence reflects accumulated evidence — not scanner severity alone. VAYNE calibrates
            scores across observation, correlation, and validated exploitation.
          </KnowledgeLead>
          <ConfidenceScale
            levels={[
              { pct: "20%", label: "Observation" },
              { pct: "50%", label: "Possible" },
              { pct: "75%", label: "Probable" },
              { pct: "90%", label: "Validated" },
            ]}
          />
          <p>
            Low confidence findings may warrant monitoring. Medium confidence requires analyst
            review. High confidence demands prioritization. Validated exploitation indicates
            proof-grade evidence suitable for executive escalation.
          </p>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="rejected">
        <KnowledgeSection id="rejected-paths" title="Rejected Attack Paths">
          <KnowledgeLead>
            Rejected paths are a core VAYNE differentiator. Most tools report everything; VAYNE
            explicitly documents what was explored and why it failed validation.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Insufficient evidence",
              "Credential absence",
              "Missing exploit chain",
              "False positive correlation",
              "Dead-end lateral movement",
              "Below confidence threshold",
            ]}
          />
          <TerminalBlock>{`rejected: missing credentials
rejected: no exploit intelligence
rejected: confidence below threshold
rejected: no downstream target`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="impact">
        <KnowledgeSection id="business-impact" title="Business Impact">
          <KnowledgeLead>
            Impact scoring translates technical compromise into organizational risk — enabling
            prioritization beyond CVSS.
          </KnowledgeLead>
          <ImpactTier
            tiers={[
              { level: "Low", example: "internal service exposure" },
              { level: "Medium", example: "application data access" },
              { level: "High", example: "domain compromise" },
              { level: "Critical", example: "production infrastructure takeover" },
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="analyst-chat">
        <KnowledgeSection id="talk-to-vayne" title="How to Talk to VAYNE">
          <KnowledgeLead>
            Ask VAYNE translates investigation artifacts into analyst-ready narratives. Use precise,
            context-rich prompts.
          </KnowledgeLead>
          <PromptList
            prompts={[
              "explain this finding",
              "explain this graph",
              "explain the attack chain",
              "explain for management",
              "explain for SOC",
              "create remediation plan",
              "estimate business risk",
              "estimate analyst hours saved",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
