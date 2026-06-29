import { AppShell } from "@/components/layout/AppShell";
import { PlaybooksContent } from "@/components/knowledge/PlaybooksContent";

export default function PlaybooksPage() {
  return (
    <AppShell activeNav="playbooks">
      <PlaybooksContent />
    </AppShell>
  );
}
