import { AppShell } from "@/components/layout/AppShell";
import { AttackPathsContent } from "@/components/attack-paths/attack-paths-content";

export default function AttackPathsPage() {
  return (
    <AppShell activeNav="attack-paths">
      <AttackPathsContent />
    </AppShell>
  );
}
