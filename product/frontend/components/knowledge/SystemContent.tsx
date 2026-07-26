"use client";

import {
  BulletGrid,
  KnowledgeLead,
  KnowledgeSection,
  TerminalBlock,
} from "./primitives";
import { KnowledgeSectionWrap, KnowledgeShell } from "./KnowledgeShell";

const TOC = [
  { id: "status", label: "Status" },
  { id: "versions", label: "Versions" },
  { id: "services", label: "Services" },
  { id: "storage", label: "Storage" },
  { id: "quota", label: "Chat Quota" },
  { id: "panels", label: "Panel State" },
  { id: "ops", label: "Operator Checks" },
];

export function SystemContent() {
  return (
    <KnowledgeShell title="System" sections={TOC}>
      <KnowledgeSectionWrap id="status">
        <KnowledgeSection id="status-body" title="Status">
          <KnowledgeLead>
            Operational reference for the VAYNE product shell running against engine v0.2.0
            (Nemzyi). Use this page when debugging connectivity, quota, or workstation persistence —
            not as a substitute for Engine Trace proof on a specific investigation.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="versions">
        <KnowledgeSection id="versions-body" title="Versions">
          <TerminalBlock>{`VAYNE engine:     0.2.0
Created By:       Nemzyi
Frontend:         product/frontend (Next.js 14)
Backend API:      product/backend (FastAPI, product API 1.0.0 labeling)
Python package:   vayne/`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="services">
        <KnowledgeSection id="services-body" title="Services">
          <BulletGrid
            items={[
              "Backend health polled from the workstation (~4s)",
              "Analyst online status from fetchAnalystStatus",
              "Analyze stream: /api/analyze/stream (fallback /api/analyze)",
              "Engine trace fetch: /api/investigation/:id/engine-trace",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="storage">
        <KnowledgeSection id="storage-body" title="Storage">
          <TerminalBlock>{`Browser localStorage (selected keys):
  vayne-workspace-panel-order-v3   panel order
  vayne-active-investigation-id    logo resume target
  vayne-investigation-sessions     session index
  vayne-active-conversation        legacy/active conversation blob

Server:
  PostgreSQL investigations + product/storage filesystem artifacts`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="quota">
        <KnowledgeSection id="quota-body" title="Chat Quota">
          <KnowledgeLead>
            Free Ask VAYNE messages default to 4 (VAYNE_FREE_CHAT_LIMIT), enforced in
            product/backend/services/chat_quota.py and mirrored in the Analyst dock. Section asks
            consume the same budget.
          </KnowledgeLead>
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="panels">
        <KnowledgeSection id="panels-body" title="Panel State">
          <BulletGrid
            items={[
              "Engine 39 · Trace 29 · Analyst 31 (fr)",
              "Widths follow panel identity after drag-swap",
              "Desktop only for three-column dock (lg+)",
              "Resume refetches Trace events for active id",
            ]}
          />
        </KnowledgeSection>
      </KnowledgeSectionWrap>

      <KnowledgeSectionWrap id="ops">
        <KnowledgeSection id="ops-body" title="Operator Checks">
          <TerminalBlock>{`[ ] Backend health green in UI
[ ] Analyst online if you need Ask VAYNE
[ ] Ingest test file → Trace stages appear
[ ] Complete run → priority cards ≤6
[ ] View full report → Brief renders
[ ] Visit /tutorial → logo returns with Trace restored
[ ] New Investigation clears active id`}</TerminalBlock>
        </KnowledgeSection>
      </KnowledgeSectionWrap>
    </KnowledgeShell>
  );
}
