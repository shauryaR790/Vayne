import { getInvestigation, getReport } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageTransition } from "@/components/ui/PageTransition";

export default async function InvestigationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  let name: string | undefined;
  let status: string | undefined;
  let durationSeconds: number | undefined;

  try {
    const [detail, report] = await Promise.all([
      getInvestigation(params.id),
      getReport(params.id),
    ]);
    name = detail.summary.name;
    status = detail.summary.status;
    durationSeconds = report.duration_seconds;
  } catch {
    name = undefined;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        investigationId={params.id}
        investigationName={name}
        status={status}
        durationSeconds={durationSeconds}
      />
      <main className="flex-1 min-w-0 p-6 lg:p-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
