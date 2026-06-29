import { AppShell } from "@/components/layout/AppShell";
import { RoadmapContent } from "@/components/knowledge/RoadmapContent";

export default function RoadmapPage() {
  return (
    <AppShell activeNav="roadmap">
      <RoadmapContent />
    </AppShell>
  );
}
