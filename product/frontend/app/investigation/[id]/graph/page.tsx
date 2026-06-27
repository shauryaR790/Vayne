import { getGraph } from "@/lib/api";
import { GraphExplorer } from "@/components/graph/GraphExplorer";

export default async function GraphPage({ params }: { params: { id: string } }) {
  const graph = await getGraph(params.id);

  return (
    <div className="space-y-4 max-w-[1400px]">
      <header className="text-center border-b border-vercel-border pb-6">
        <h1 className="vx-section-title">Attack Graph</h1>
        <p className="vx-card-title mt-2">Graph Explorer</p>
      </header>
      <GraphExplorer graph={graph} />
    </div>
  );
}
