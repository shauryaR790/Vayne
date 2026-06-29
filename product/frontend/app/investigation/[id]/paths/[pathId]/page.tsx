import { redirect } from "next/navigation";

export default function InvestigationPathRedirect({
  params,
}: {
  params: { id: string; pathId: string };
}) {
  redirect(`/investigation/${params.id}#technical-workspace`);
}
