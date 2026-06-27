import { getProof, getReport } from "@/lib/api";
import { proofTimelineSteps } from "@/lib/report-helpers";
import { ProofTimeline } from "@/components/investigation/ProofTimeline";

export default async function ProofPage({ params }: { params: { id: string } }) {
  const [proofText, report] = await Promise.all([
    getProof(params.id),
    getReport(params.id),
  ]);

  const steps = proofTimelineSteps(report);

  return <ProofTimeline steps={steps} rawProof={proofText} />;
}
