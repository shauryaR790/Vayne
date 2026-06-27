import { getFindings } from "@/lib/api";
import { FindingsExplorer } from "@/components/investigation/FindingsExplorer";

export default async function FindingsPage({ params }: { params: { id: string } }) {
  const findings = await getFindings(params.id);

  return (
    <div className="space-y-6 max-w-[1200px]">
      <header className="text-center border-b border-vercel-border pb-6">
        <h1 className="vx-section-title">Findings</h1>
        <p className="text-body text-vercel-muted mt-2">
          {findings.validated.length + findings.rejected.length} total ·{" "}
          {findings.validated.length} validated · {findings.rejected.length} rejected
        </p>
      </header>
      <FindingsExplorer validated={findings.validated} rejected={findings.rejected} />
    </div>
  );
}
