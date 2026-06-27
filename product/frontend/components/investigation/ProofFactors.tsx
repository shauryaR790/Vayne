import type { ProofFactor, ProofBundle } from "@/lib/types";

export function ProofFactors({ proof }: { proof: ProofBundle }) {
  if (!proof.factors?.length) {
    return <p className="text-body text-vercel-muted">No proof factors available.</p>;
  }
  return (
    <div className="space-y-3">
      {proof.formula && (
        <p className="text-label text-vercel-muted font-mono break-all">{proof.formula}</p>
      )}
      <div className="space-y-2">
        {proof.factors.map((f: ProofFactor) => (
          <div
            key={f.name}
            className="flex items-start justify-between gap-4 py-2 border-b border-vercel-border last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-body text-white">{f.name.replace(/_/g, " ")}</p>
              {f.evidence?.map((e) => (
                <p key={e} className="text-label text-vercel-muted mt-0.5 truncate font-mono">
                  {e}
                </p>
              ))}
            </div>
            {f.contribution != null && (
              <span className="text-body text-vercel-success shrink-0 tabular-nums">
                +{Number(f.contribution).toFixed(f.contribution % 1 ? 1 : 0)}
              </span>
            )}
          </div>
        ))}
      </div>
      {proof.explanation?.map((line) => (
        <p key={line} className="text-label text-vercel-muted font-mono">
          {line}
        </p>
      ))}
    </div>
  );
}
