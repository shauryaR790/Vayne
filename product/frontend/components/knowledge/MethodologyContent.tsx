"use client";

import {
  BulletGrid,
  FlowDiagram,
  KnowledgeLead,
  KnowledgeSection,
  KnowledgeSeeAlso,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "reasoning-model", label: "Reasoning Model" },
  { id: "discovery", label: "Discovery" },
  { id: "fingerprinting", label: "Fingerprinting" },
  { id: "vuln-mapping", label: "Vuln Mapping" },
  { id: "attack-graph", label: "Attack Graph" },
  { id: "validation", label: "Validation" },
  { id: "confidence", label: "Confidence" },
  { id: "reports", label: "Reports" },
];

export function MethodologyContent() {
  return (
    <KnowledgeShell
      title="Methodology"
      subtitle="Classified operational doctrine describing how VAYNE discovers, correlates, validates, and rejects attack paths before they become false-positive noise."
      classification="METHOD // ATTACK REASONING DOCTRINE"
      sections={TOC}
    >
      <div className="mb-10">
        <KnowledgeSeeAlso />
      </div>
      <KnowledgeSectionWrap id="reasoning-model">
        <KnowledgeSection id="attack-reasoning" title="VAYNE Attack Reasoning Model">
          <KnowledgeLead>
            VAYNE replaces linear scan-to-alert pipelines with a multi-stage reasoning engine that
            terminates in validated attack paths or explicit rejection.
          </KnowledgeLead>
          <p>Traditional tools:</p>
          <FlowDiagram lines={["Scan", "↓", "Detect", "↓", "Alert"]} />
          <p className="pt-2">VAYNE:</p>
          <FlowDiagram
            lines={[
              "Discover",
              "↓",
              "Fingerprint",
              "↓",
              "Correlate",
              "↓",
              "Map",
              "↓",
              "Validate",
              "↓",
              "Reason",
              "↓",
              "Reject",
              "↓",
              "Score",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="discovery">
        <KnowledgeSection id="discovery-engine" title="Discovery Engine">
          <KnowledgeLead>
            The discovery engine enumerates the attack surface — identifying assets, exposed
            services, and reachable entry points before any vulnerability correlation begins.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Asset discovery",
              "Service discovery",
              "Software identification",
              "Attack surface enumeration",
              "Network boundary mapping",
              "Exposure classification",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="fingerprinting">
        <KnowledgeSection id="fingerprinting-engine" title="Fingerprinting Engine">
          <KnowledgeLead>
            Fingerprinting binds services to specific software versions — the prerequisite for
            accurate CVE mapping and exploit intelligence correlation.
          </KnowledgeLead>
          <TerminalBlock>{`Apache 2.4.49
OpenSSH 7.2
SMBv1
Kerberos
nginx/1.18.0
Microsoft-IIS/10.0`}</TerminalBlock>
          <BulletGrid
            items={[
              "Service fingerprinting",
              "Software identification",
              "Version detection",
              "Exposure analysis",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="vuln-mapping">
        <KnowledgeSection id="vuln-engine" title="Vulnerability Mapping Engine">
          <KnowledgeLead>
            CVE mapping alone is insufficient. VAYNE enriches vulnerabilities with exploit
            intelligence, weaponization status, and chain feasibility.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "CVE mapping",
              "Exploit intelligence",
              "Exploit database correlation",
              "Attack enrichment",
              "Weaponization scoring",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="attack-graph">
        <KnowledgeSection id="graph-engine" title="Attack Graph Engine">
          <KnowledgeLead>
            The graph engine constructs directed attack models linking internet exposure to business
            impact through validated transitions.
          </KnowledgeLead>
          <FlowDiagram
            lines={[
              "internet",
              "↓",
              "asset",
              "↓",
              "service",
              "↓",
              "software",
              "↓",
              "vulnerability",
              "↓",
              "credential",
              "↓",
              "privilege escalation",
              "↓",
              "domain compromise",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="validation">
        <KnowledgeSection id="validation-engine" title="Attack Validation Engine">
          <KnowledgeLead>
            Validation is where VAYNE diverges from scanners. Paths without sufficient evidence are
            rejected — not suppressed, but documented as intelligence.
          </KnowledgeLead>
          <TerminalBlock>{`rejected: missing credentials
rejected: no exploit intelligence
rejected: confidence below threshold
rejected: missing privilege escalation
rejected: missing business target`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="confidence">
        <KnowledgeSection id="confidence-engine" title="Confidence Engine">
          <KnowledgeLead>
            Multi-factor scoring aggregates evidence quality, exploit feasibility, path depth, and
            business impact into calibrated confidence values.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Evidence scoring",
              "Exploit scoring",
              "Path scoring",
              "Business impact scoring",
              "Cross-path calibration",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="reports">
        <KnowledgeSection id="report-engine" title="Report Generation">
          <KnowledgeLead>
            Investigation artifacts are synthesized into audience-specific reports — executive,
            technical, SOC, and remediation formats.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Executive reports",
              "Technical reports",
              "SOC reports",
              "Remediation reports",
              "Proof timelines",
              "Attack chain summaries",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
