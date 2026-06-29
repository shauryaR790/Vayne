import { cn } from "@/lib/utils";

export type ScanStatus = "completed" | "running" | "queued" | "failed";

const map: Record<ScanStatus, { label: string }> = {
  completed: { label: "Completed" },
  running: { label: "Running" },
  queued: { label: "Queued" },
  failed: { label: "Failed" },
};

export function StatusPill({ status }: { status: ScanStatus }) {
  const s = map[status];
  const inverted = status === "running" || status === "completed";

  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        inverted
          ? "border-white bg-white text-black"
          : "border-white/40 text-white/60",
      )}
    >
      {s.label}
    </span>
  );
}

export function mapInvestigationStatus(status: string): ScanStatus {
  if (status === "complete" || status === "completed") return "completed";
  if (status === "running" || status === "analyzing") return "running";
  if (status === "failed" || status === "error") return "failed";
  return "queued";
}
