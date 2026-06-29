import { redirect } from "next/navigation";

export default function InvestigationSubRedirect({ params }: { params: { id: string } }) {
  redirect(`/investigation/${params.id}#technical-workspace`);
}
