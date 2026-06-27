import Link from "next/link";
import type { AttackPathSummary } from "@/lib/types";
import { formatCategory } from "@/lib/format";
import { PathChain } from "./PathChain";
import type { PathDetail } from "@/lib/types";

export function DeploymentPathCard({
  path,
  index,
  investigationId,
  fullPath,
}: {
  path: AttackPathSummary;
  index: number;
  investigationId: string;
  fullPath?: PathDetail | null;
}) {
  return (
    <Link
      href={`/investigation/${investigationId}/paths/${path.id}`}
      className="block vx-panel-hover border border-vercel-border"
    >
      <div className="px-4 py-3 border-b border-vercel-border flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-body font-medium text-white">
            Attack Path #{index + 1}
          </p>
          <p className="text-label text-vercel-muted font-mono truncate">
            {path.stable_id}
          </p>
        </div>
        <span className="vx-badge-success shrink-0">VERIFIED</span>
      </div>

      <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-vercel-border text-body">
        <div>
          <p className="vx-label">Category</p>
          <p className="text-white mt-1">{formatCategory(path.category)}</p>
        </div>
        <div>
          <p className="vx-label">Confidence</p>
          <p className="text-vercel-success mt-1 tabular-nums">{path.confidence}%</p>
        </div>
        <div>
          <p className="vx-label">Risk</p>
          <p className="text-white mt-1 tabular-nums">{path.risk.toFixed(1)}</p>
        </div>
        <div>
          <p className="vx-label">Blast Radius</p>
          <p className="text-white mt-1 tabular-nums">{path.blast_radius}</p>
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col md:flex-row gap-6">
        {fullPath ? (
          <div className="shrink-0">
            <PathChain path={fullPath} />
          </div>
        ) : null}
        <p className="text-body text-vercel-muted line-clamp-3 flex-1">{path.title}</p>
      </div>

      {path.mitre_tactics?.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {path.mitre_tactics.map((t) => (
            <span key={t} className="vx-badge-neutral font-mono text-label">
              {t.split(" ")[0]}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

/** @deprecated use DeploymentPathCard */
export function AttackPathCard(props: {
  path: AttackPathSummary;
  index: number;
  investigationId: string;
}) {
  return <DeploymentPathCard {...props} />;
}
