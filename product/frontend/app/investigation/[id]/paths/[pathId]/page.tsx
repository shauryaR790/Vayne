import Link from "next/link";
import { getPath } from "@/lib/api";
import { formatCategory, riskTone } from "@/lib/format";
import { AttackStoryPanel } from "@/components/investigation/AttackStoryPanel";
import { PathChainHorizontal } from "@/components/investigation/PathChain";
import { ProofFactors } from "@/components/investigation/ProofFactors";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { WorkstationLayout, SidePanel, StatRow } from "@/components/ui/Workstation";

export default async function PathDetailPage({
  params,
}: {
  params: { id: string; pathId: string };
}) {
  const path = await getPath(params.pathId);
  const riskClass =
    riskTone(path.risk.score) === "danger"
      ? "text-vercel-danger"
      : riskTone(path.risk.score) === "warning"
        ? "text-vercel-warning"
        : "text-vercel-success";

  const accepted = path.proof.accepted as Record<string, unknown>;
  const categoryProof = path.proof.category as Record<string, unknown>;

  const side = (
    <>
      <SidePanel title="Path Metrics">
        <StatRow label="Confidence" value={`${path.confidence.score}%`} />
        <StatRow label="Risk" value={path.risk.score.toFixed(1)} />
        <StatRow label="Blast radius" value={path.blast_radius} />
        {path.attacker_effort && (
          <StatRow label="Attacker effort" value={path.attacker_effort} />
        )}
      </SidePanel>

      <SidePanel title="MITRE ATT&CK">
        {path.mitre_tactics.length > 0 && (
          <div className="mb-3">
            <p className="vx-label mb-2">Tactics</p>
            <ul className="text-body space-y-1">
              {path.mitre_tactics.map((t) => (
                <li key={t} className="text-vercel-info">{t}</li>
              ))}
            </ul>
          </div>
        )}
        {path.mitre_techniques.length > 0 && (
          <div>
            <p className="vx-label mb-2">Techniques</p>
            <ul className="text-label font-mono text-vercel-muted space-y-1">
              {path.mitre_techniques.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </SidePanel>

      {path.capability_chain.length > 0 && (
        <SidePanel title="Capability Chain">
          <div className="flex flex-wrap gap-2 text-label font-mono">
            {path.capability_chain.map((c, i) => (
              <span key={c}>
                {i > 0 && <span className="text-vercel-muted mx-1">→</span>}
                <span className="border border-vercel-border px-2 py-0.5">{c}</span>
              </span>
            ))}
          </div>
        </SidePanel>
      )}
    </>
  );

  return (
    <div className="space-y-6 max-w-[1400px]">
      <header className="border-b border-vercel-border pb-4">
        <Link
          href={`/investigation/${params.id}/paths`}
          className="text-label text-vercel-muted hover:text-white transition-colors duration-150"
        >
          ← Attack Paths
        </Link>
        <div className="text-center mt-3">
          <span className="vx-badge-danger">{formatCategory(path.category)}</span>
          <h1 className="vx-section-title mt-2">{path.title || path.stable_id}</h1>
          <p className="text-label font-mono text-vercel-muted mt-1">{path.stable_id}</p>
          <div className="flex gap-8 justify-center mt-4">
            <div>
              <p className="vx-label">Confidence</p>
              <p className="text-section text-vercel-success tabular-nums">{path.confidence.score}%</p>
            </div>
            <div>
              <p className="vx-label">Risk</p>
              <p className={`text-section tabular-nums ${riskClass}`}>
                {path.risk.score.toFixed(1)}
              </p>
            </div>
            <div>
              <p className="vx-label">Blast Radius</p>
              <p className="text-section tabular-nums">{path.blast_radius}</p>
            </div>
          </div>
        </div>
      </header>

      <WorkstationLayout
        main={
          <>
            <PathChainHorizontal path={path} />
            <AttackStoryPanel story={path.story} />

            <CollapsiblePanel title="Confidence Engine" badge={`${path.confidence.score}%`} defaultOpen>
              <ProofFactors proof={path.confidence.proof} />
            </CollapsiblePanel>

            <CollapsiblePanel title="Risk Engine" badge={path.risk.score.toFixed(1)}>
              <ProofFactors proof={path.risk.proof} />
            </CollapsiblePanel>

            <CollapsiblePanel title="Category Proof">
              <pre className="text-label text-vercel-muted whitespace-pre-wrap font-mono">
                {JSON.stringify(categoryProof, null, 2)}
              </pre>
            </CollapsiblePanel>

            <CollapsiblePanel title="Why Accepted">
              {(accepted.why_accepted as string[])?.length ? (
                <ul className="text-body space-y-2">
                  {(accepted.why_accepted as string[]).map((line) => (
                    <li key={line} className="text-vercel-success">✓ {line}</li>
                  ))}
                </ul>
              ) : (
                <pre className="text-label whitespace-pre-wrap font-mono text-vercel-muted">
                  {JSON.stringify(accepted, null, 2)}
                </pre>
              )}
            </CollapsiblePanel>
          </>
        }
        side={side}
      />
    </div>
  );
}
