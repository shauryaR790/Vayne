import { AppShell } from "@/components/layout/AppShell";
import { AssetsContent } from "@/components/assets/assets-content";

export default function AssetsPage() {
  return (
    <AppShell activeNav="assets">
      <AssetsContent />
    </AppShell>
  );
}
