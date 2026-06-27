import type { PathDetail } from "@/lib/types";
import { formatCategory } from "@/lib/format";

export function PathChain({ path }: { path: PathDetail }) {
  const nodes = path.nodes || [];
  if (!nodes.length) {
    return (
      <p className="text-body text-vercel-muted font-mono">{path.title}</p>
    );
  }

  return (
    <div className="font-mono text-label space-y-1 py-2">
      {nodes.map((n, i) => (
        <div key={String(n.id)} className="flex flex-col items-center">
          <span
            className={`px-2 py-1 border ${
              n.node_type === "vulnerability"
                ? "border-vercel-danger text-vercel-danger"
                : n.node_type === "endpoint"
                  ? "border-vercel-muted text-vercel-muted"
                  : "border-vercel-border text-white"
            }`}
          >
            {String(n.label || n.id).split("/").pop()?.split("@")[0]}
          </span>
          {i < nodes.length - 1 && (
            <span className="text-vercel-muted py-0.5">↓</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function PathChainHorizontal({ path }: { path: PathDetail }) {
  return (
    <div className="vx-panel border border-vercel-border p-4">
      <p className="vx-label mb-3">{formatCategory(path.category)} Chain</p>
      <PathChain path={path} />
    </div>
  );
}
