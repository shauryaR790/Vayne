"use client";

import {
  BulletGrid,
  CaseStudy,
  FlowDiagram,
  KnowledgeLead,
  KnowledgeSection,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "threat-research", label: "Threat Research" },
  { id: "case-studies", label: "Case Studies" },
  { id: "graph-examples", label: "Graph Examples" },
  { id: "false-positives", label: "False Positives" },
];

export function ResearchContent() {
  return (
    <KnowledgeShell
      title="Research"
      subtitle="Threat intelligence, historical attack chain analysis, and reference models demonstrating how real-world compromises map to VAYNE reasoning."
      classification="INTEL // THREAT RESEARCH"
      sections={TOC}
    >
      <KnowledgeSectionWrap id="threat-research">
        <KnowledgeSection id="threat-intel" title="Threat Research">
          <KnowledgeLead>
            VAYNE research tracks active threat patterns to inform attack graph construction and
            validation thresholds.
          </KnowledgeLead>
          <BulletGrid
            items={[
              "Recent CVE weaponization",
              "Ransomware initial access trends",
              "Lateral movement techniques",
              "Credential theft patterns",
              "Cloud identity abuse",
              "Supply chain exploitation",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="case-studies">
        <KnowledgeSection id="attack-studies" title="Attack Chain Case Studies">
          <KnowledgeLead>
            Historical compromises decomposed into VAYNE reasoning phases — initial access,
            exploitation, lateral movement, impact.
          </KnowledgeLead>
          <div className="space-y-4">
            <CaseStudy
              name="Log4Shell"
              stages={[
                { phase: "Initial Access", detail: "JNDI injection via exposed Java services" },
                { phase: "Exploitation", detail: "Remote code execution via Log4j lookup" },
                { phase: "Lateral Movement", detail: "Credential harvesting, cloud metadata abuse" },
                { phase: "Impact", detail: "Ransomware deployment, data exfiltration" },
              ]}
            />
            <CaseStudy
              name="SolarWinds"
              stages={[
                { phase: "Initial Access", detail: "Supply chain trojanized update" },
                { phase: "Exploitation", detail: "Backdoor activation in trusted software" },
                { phase: "Lateral Movement", detail: "SAML token forgery, AD compromise" },
                { phase: "Impact", detail: "Long-term espionage across enterprise" },
              ]}
            />
            <CaseStudy
              name="MOVEit"
              stages={[
                { phase: "Initial Access", detail: "SQL injection in file transfer appliance" },
                { phase: "Exploitation", detail: "Webshell deployment, data staging" },
                { phase: "Lateral Movement", detail: "Limited — appliance-focused blast radius" },
                { phase: "Impact", detail: "Mass data theft via managed file transfer" },
              ]}
            />
            <CaseStudy
              name="Colonial Pipeline"
              stages={[
                { phase: "Initial Access", detail: "Compromised VPN credentials" },
                { phase: "Exploitation", detail: "Legacy VPN without MFA" },
                { phase: "Lateral Movement", detail: "OT network segmentation failure" },
                { phase: "Impact", detail: "Critical infrastructure operational shutdown" },
              ]}
            />
            <CaseStudy
              name="NotPetya / WannaCry"
              stages={[
                { phase: "Initial Access", detail: "EternalBlue / supply chain vectors" },
                { phase: "Exploitation", detail: "SMB wormable RCE" },
                { phase: "Lateral Movement", detail: "Self-propagating network traversal" },
                { phase: "Impact", detail: "Global operational disruption" },
              ]}
            />
          </div>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="graph-examples">
        <KnowledgeSection id="reference-graphs" title="Attack Graph Examples">
          <KnowledgeLead>
            Reference attack models used to calibrate VAYNE graph construction across common
            enterprise architectures.
          </KnowledgeLead>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
                Enterprise Compromise
              </p>
              <FlowDiagram
                lines={[
                  "Internet → Perimeter → Web App → RCE → Credentials → AD → Domain Admin",
                ]}
              />
            </div>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
                Cloud Compromise
              </p>
              <FlowDiagram
                lines={[
                  "Internet → API Gateway → IAM Misconfig → S3 → Lambda → Data Exfil",
                ]}
              />
            </div>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
                Active Directory
              </p>
              <FlowDiagram
                lines={[
                  "Workstation → Kerberoasting → Service Account → DCSync → Domain Controller",
                ]}
              />
            </div>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
                Web Compromise
              </p>
              <FlowDiagram
                lines={[
                  "Internet → CDN → Origin Server → Path Traversal → RCE → Database",
                ]}
              />
            </div>
          </div>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="false-positives">
        <KnowledgeSection id="fp-analysis" title="False Positive Analysis">
          <KnowledgeLead>
            VAYNE research informs rejection heuristics — distinguishing scanner noise from
            actionable attack paths.
          </KnowledgeLead>
          <TerminalBlock>{`rejected: scanner noise (unreachable service)
rejected: low confidence exploit (no PoC)
rejected: incomplete chain (no credential pivot)
rejected: version mismatch (banner-only detection)`}</TerminalBlock>
          <BulletGrid
            items={[
              "Scanner noise filtering",
              "Low confidence exploit rejection",
              "Incomplete chain termination",
              "Evidence tier validation",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
