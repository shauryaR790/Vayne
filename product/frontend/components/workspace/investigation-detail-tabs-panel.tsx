"use client";

import { GraphExplorer } from "@/components/graph/GraphExplorer";
import type { ReasoningCheck } from "@/components/graph/GraphEmptyState";
import {
  BusinessImpactSection,
  ConfirmedFindingsSection,
  DeveloperDetailsSection,
  EngineFileDetailsSection,
  EvidenceSection,
  EvidenceTimelineSection,
  ExecutiveSummarySection,
  ExpertModeProvider,
  InvestigationFlowSection,
  InvestigationTimelineSection,
  MissingEvidenceSection,
  RecommendationsSection,
  RiskOverviewSection,
} from "@/components/workspace/investigation-workbench-sections";
import { SectionAskAside } from "@/components/workspace/investigation-report-ask";
import { WorkstationSection } from "@/components/workspace/workstation-primitives";
import { WorkstationTabBar } from "@/components/workspace/workstation-tab-bar";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import type { InvestigationPresentation } from "@/lib/investigation-presentation";
import { sectionContextAttackGraph } from "@/lib/section-ask-context";
import type { WorkbenchData } from "@/lib/types";

export const INVESTIGATION_DETAIL_TABS = [
  { id: "attack-graph", label: "Attack Graph" },
  { id: "findings", label: "Findings" },
  { id: "business-impact", label: "Impact" },
  { id: "confidence", label: "Confidence" },
  { id: "evidence", label: "Evidence" },
  { id: "recommendations", label: "Workflows" },
  { id: "timeline", label: "Timeline" },
  { id: "reasoning", label: "Reasoning" },
  { id: "executive-detail", label: "Conclusions" },
  { id: "missing-evidence", label: "Missing Evidence" },
  { id: "evidence-timeline", label: "Evidence Timeline" },
  { id: "evidence-files", label: "Evidence Files" },
  { id: "investigation-notes", label: "Notes" },
] as const;

export type InvestigationDetailTabId = (typeof INVESTIGATION_DETAIL_TABS)[number]["id"];

export function isInvestigationDetailTabId(id: string): id is InvestigationDetailTabId {
  return INVESTIGATION_DETAIL_TABS.some((tab) => tab.id === id);
}

export function InvestigationDetailTabsPanel({
  workbench,
  bundle,
  presentation,
  uploadedFilenames,
  sourceLabel,
  emptyGraphChecks,
  activeTab,
  onTabChange,
}: {
  workbench: WorkbenchData;
  bundle: InvestigationBundle;
  presentation: InvestigationPresentation;
  uploadedFilenames: string[];
  sourceLabel?: string;
  emptyGraphChecks: ReasoningCheck[];
  activeTab: InvestigationDetailTabId;
  onTabChange: (id: InvestigationDetailTabId) => void;
}) {
  const { executive } = presentation;

  return (
    <ExpertModeProvider expert={false}>
      <WorkstationTabBar
        tabs={[...INVESTIGATION_DETAIL_TABS]}
        active={activeTab}
        onSelect={(id) => {
          if (isInvestigationDetailTabId(id)) onTabChange(id);
        }}
      />

      <div id={`investigation-detail-${activeTab}`}>
        {activeTab === "attack-graph" ? (
          <WorkstationSection
            title="Attack Graph"
            bodyClassName="p-0 min-h-[400px]"
            reveal={0}
            embedded
            large
            aside={
              <SectionAskAside
                sectionTitle="Attack Graph"
                engineContext={sectionContextAttackGraph(workbench)}
              />
            }
          >
            <GraphExplorer
              key={`${bundle.detail.summary.id}-${presentation.graph.nodes.length}-${presentation.graph.edges.length}`}
              embedded
              layout="workstation"
              graph={presentation.graph}
              workbench={workbench}
              investigationId={bundle.detail.summary.id}
              context={{
                hasPaths: presentation.hasPaths,
                attackPaths: executive.attackPaths,
                rejectedPaths: presentation.rejectedPathCount,
                confidence: presentation.graphConfidence,
                summary: "",
                emptyChecks: emptyGraphChecks,
              }}
            />
          </WorkstationSection>
        ) : null}

        {activeTab === "findings" ? (
          <ConfirmedFindingsSection
            workbench={workbench}
            sourceFilenames={uploadedFilenames}
            reveal={0}
            embedded
          />
        ) : null}

        {activeTab === "business-impact" ? (
          <BusinessImpactSection workbench={workbench} reveal={0} embedded />
        ) : null}

        {activeTab === "confidence" ? (
          <RiskOverviewSection
            workbench={workbench}
            risk={executive.risk}
            confidence={presentation.graphConfidence}
            reveal={0}
            embedded
          />
        ) : null}

        {activeTab === "evidence" ? (
          <EvidenceSection workbench={workbench} reveal={0} embedded />
        ) : null}

        {activeTab === "recommendations" ? (
          <RecommendationsSection workbench={workbench} reveal={0} embedded />
        ) : null}

        {activeTab === "timeline" ? (
          <InvestigationTimelineSection workbench={workbench} reveal={0} embedded />
        ) : null}

        {activeTab === "reasoning" ? (
          <InvestigationFlowSection workbench={workbench} reveal={0} embedded />
        ) : null}

        {activeTab === "executive-detail" ? (
          <ExecutiveSummarySection
            workbench={workbench}
            risk={executive.risk}
            confidence={presentation.graphConfidence}
            reveal={0}
            embedded
          />
        ) : null}

        {activeTab === "missing-evidence" ? (
          <MissingEvidenceSection workbench={workbench} reveal={0} embedded />
        ) : null}

        {activeTab === "evidence-timeline" ? (
          <EvidenceTimelineSection workbench={workbench} reveal={0} embedded />
        ) : null}

        {activeTab === "evidence-files" ? (
          <EngineFileDetailsSection
            workbench={workbench}
            bundle={bundle}
            sourceLabel={sourceLabel}
            reveal={0}
            embedded
          />
        ) : null}

        {activeTab === "investigation-notes" ? (
          <DeveloperDetailsSection workbench={workbench} reveal={0} embedded />
        ) : null}
      </div>
    </ExpertModeProvider>
  );
}
