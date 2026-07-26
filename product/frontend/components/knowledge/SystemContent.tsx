"use client";

import { KnowledgeLead, KnowledgeSection, TerminalBlock } from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "role", label: "Role of This Page" },
  { id: "versions", label: "Versions" },
  { id: "runtime", label: "Runtime Services" },
  { id: "storage", label: "Storage & Persistence" },
  { id: "quota", label: "Chat Quota" },
  { id: "layout", label: "Layout Persistence" },
  { id: "checks", label: "Operator Checklist" },
];

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[1.75] text-white/90">{children}</p>;
}

export function SystemContent() {
  return (
    <KnowledgeShell title="System" sections={TOC}>
      <KnowledgeSectionWrap id="role">
        <KnowledgeSection id="role-body" title="Role of This Page">
          <KnowledgeLead>
            System is the operational companion to Engine Documentation. Where Engine Documentation
            explains formulas, System explains the living product shell around engine 0.2.0 —
            connectivity, quota, persistence keys, and the checks you run when the workstation feels
            wrong after a deploy.
          </KnowledgeLead>
          <P>
            It will not replace Engine Trace for a specific investigation. If priority looks wrong,
            read Trace. If Trace is empty after resume, read storage and API health here, then
            refetch or re-ingest.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="versions">
        <KnowledgeSection id="versions-body" title="Versions">
          <P>
            Expect Investigation Engine chrome and <code className="text-white/70">vayne/__init__.py</code>{" "}
            to agree on 0.2.0 with Created By Nemzyi. The frontend is Next.js 14 with React 18 in
            product/frontend. The product API is FastAPI under product/backend. Drift between those
            layers is a release bug, not an operator skill issue.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="runtime">
        <KnowledgeSection id="runtime-body" title="Runtime Services">
          <P>
            The workstation polls backend health on a short interval and separately checks whether
            the analyst model endpoint reports online. Ingest prefers{" "}
            <code className="text-white/70">/api/analyze/stream</code> and can fall back to{" "}
            <code className="text-white/70">/api/analyze</code>. Resume loads investigation bundles
            and calls <code className="text-white/70">/api/investigation/:id/engine-trace</code> so
            Trace can repopulate after documentation browsing.
          </P>
          <P>
            If health is down, stop blaming the UI chrome — restore the API. If health is up but
            analyst is offline, ingest and Trace can still work while Ask VAYNE fails. That split is
            intentional under AI Boundary thinking.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="storage">
        <KnowledgeSection id="storage-body" title="Storage & Persistence">
          <P>
            Browser persistence includes panel order (
            <code className="text-white/70">vayne-workspace-panel-order-v3</code>), active
            investigation id for logo resume, investigation session index, and conversation blobs.
            Server persistence uses PostgreSQL for investigations and filesystem storage under the
            product storage tree for artifacts. Clearing site data will drop resume targets even when
            server investigations remain.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="quota">
        <KnowledgeSection id="quota-body" title="Chat Quota">
          <P>
            Free Ask VAYNE messages default to four via{" "}
            <code className="text-white/70">VAYNE_FREE_CHAT_LIMIT</code>, enforced in
            product/backend/services/chat_quota.py and shown in the Analyst dock. Section asks spend
            the same counter. Exhaustion should hard-stop sends rather than silently degrading into
            hallucinated “unlimited” local chat.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="layout">
        <KnowledgeSection id="layout-body" title="Layout Persistence">
          <P>
            Desktop dock fractions remain Engine 39, Trace 29, Analyst 31 by panel identity after
            drag-swap. Mobile does not attempt the three-column dock; it stacks Engine over Trace and
            opens Analyst fullscreen. If panels look crushed, confirm you are at lg width and hard
            refresh before resetting localStorage order.
          </P>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="checks">
        <KnowledgeSection id="checks-body" title="Operator Checklist">
          <TerminalBlock>{`After deploy or “something feels off”
  [ ] Engine chrome shows Version 0.2.0 / Created By Nemzyi
  [ ] Backend health green
  [ ] Analyst online only if you need Ask VAYNE
  [ ] Ingest sample → Trace stages stream
  [ ] Complete → ≤6 priority cards with reasons
  [ ] View full report → Brief renders
  [ ] Open /tutorial → logo returns with Trace restored when telemetry exists
  [ ] New Investigation clears active id and returns idle home`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
