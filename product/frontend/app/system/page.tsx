import { AppShell } from "@/components/layout/AppShell";
import { SystemContent } from "@/components/knowledge/SystemContent";

export default function SystemPage() {
  return (
    <AppShell activeNav="system">
      <SystemContent />
    </AppShell>
  );
}
