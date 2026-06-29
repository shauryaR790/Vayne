import { AppShell } from "@/components/layout/AppShell";
import { MethodologyContent } from "@/components/knowledge/MethodologyContent";

export default function MethodologyPage() {
  return (
    <AppShell activeNav="methodology">
      <MethodologyContent />
    </AppShell>
  );
}
