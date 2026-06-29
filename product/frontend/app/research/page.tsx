import { AppShell } from "@/components/layout/AppShell";
import { ResearchContent } from "@/components/knowledge/ResearchContent";

export default function ResearchPage() {
  return (
    <AppShell activeNav="research">
      <ResearchContent />
    </AppShell>
  );
}
