"use client";

import { useState } from "react";
import type { Finding } from "@/lib/types";
import { findingBadgeClass } from "@/lib/format";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";

type Tab = "validated" | "rejected";

function statusLabel(finding: Finding, bucket: Tab): string {
  const c = (finding.classification || "").toUpperCase();
  if (c.includes("REJECT")) return "REJECTED";
  if (c.includes("VALID") || c.includes("CONFIRM")) return "VALIDATED";
  if (c.includes("OBSERV")) return "OBSERVED";
  if (c.includes("LIKELY")) return "LIKELY";
  return bucket === "rejected" ? "REJECTED" : "VALIDATED";
}

function FindingCard({ finding, bucket }: { finding: Finding; bucket: Tab }) {
  const proofCount =
    (finding.evidence?.length ?? 0) + (finding.reasoning?.length ?? 0);
  const badge = statusLabel(finding, bucket);

  return (
    <article className="vx-panel-hover border border-vercel-border bg-vercel-panel relative">
      <div className="absolute top-3 right-3">
        <span className={findingBadgeClass(finding.classification, bucket)}>{badge}</span>
      </div>

      <div className="px-4 py-3 border-b border-vercel-border pr-28">
        <h3 className="text-body font-bold text-white truncate">
          {finding.title || finding.id || "Finding"}
        </h3>
        {finding.host && (
          <p className="text-metadata font-mono text-vercel-muted mt-1">{finding.host}</p>
        )}
      </div>

      <div className="px-4 py-4 space-y-4 border-b border-vercel-border">
        {finding.confidence != null && <ConfidenceBar value={finding.confidence} />}
        <div className="grid grid-cols-2 gap-4">
          {finding.cve && (
            <div>
              <p className="vx-card-title mb-1">CVE</p>
              <p className="text-metadata font-mono text-vercel-danger font-bold">{finding.cve}</p>
            </div>
          )}
          <div>
            <p className="vx-card-title mb-1">Proof</p>
            <p className="text-body font-bold tabular-nums">{proofCount}</p>
          </div>
        </div>
      </div>

      {finding.evidence?.length ? (
        <div className="px-4 py-3 border-b border-vercel-border">
          <p className="vx-card-title mb-2">Evidence</p>
          <ul className="text-metadata text-vercel-muted space-y-1 font-mono">
            {finding.evidence.slice(0, 4).map((e) => (
              <li key={e}>— {e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {finding.reasoning?.length ? (
        <div className="px-4 py-3">
          <p className="vx-card-title mb-2">Reasoning</p>
          <ul className="text-body text-zinc-300 space-y-1 font-semibold">
            {finding.reasoning.slice(0, 3).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function FindingsExplorer({
  validated,
  rejected,
}: {
  validated: Finding[];
  rejected: Finding[];
}) {
  const [tab, setTab] = useState<Tab>("validated");
  const items = tab === "validated" ? validated : rejected;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-vercel-bg border-b border-vercel-border flex">
        {(["validated", "rejected"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={tab === t ? "vx-tab-active uppercase" : "vx-tab uppercase"}
          >
            {t} ({t === "validated" ? validated.length : rejected.length})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((f, i) => (
          <FindingCard key={f.id || f.title || i} finding={f} bucket={tab} />
        ))}
      </div>

      {!items.length && (
        <p className="text-body text-vercel-muted px-1">No {tab} findings.</p>
      )}
    </div>
  );
}
