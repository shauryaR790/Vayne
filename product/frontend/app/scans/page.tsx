import { AppShell } from "@/components/layout/AppShell";
import { ScansPage } from "@/components/dashboard/scans-page";

export default function ScansRoute() {
  return (
    <AppShell activeNav="scans">
      <ScansPage />
    </AppShell>
  );
}
