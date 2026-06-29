import { AppShell } from "@/components/layout/AppShell";
import { InvestigationsList } from "@/components/investigations/investigations-list";

export default function InvestigationsRoute() {
  return (
    <AppShell activeNav="investigations">
      <InvestigationsList />
    </AppShell>
  );
}
