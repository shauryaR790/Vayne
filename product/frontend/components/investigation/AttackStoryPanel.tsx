import type { AttackStory } from "@/lib/types";

const STORY_FIELDS: Array<{ key: keyof AttackStory; label: string }> = [
  { key: "initial_foothold", label: "Initial Foothold" },
  { key: "exploitation_step", label: "Exploitation" },
  { key: "privilege_gained", label: "Privilege Gained" },
  { key: "lateral_movement", label: "Lateral Movement" },
  { key: "target_reached", label: "Target Reached" },
  { key: "business_impact", label: "Business Impact" },
  { key: "narrative", label: "Narrative" },
];

export function AttackStoryPanel({ story }: { story: AttackStory }) {
  return (
    <div className="vx-panel border border-vercel-border p-4 space-y-4">
      <h2 className="text-body font-medium text-white">Attack Story</h2>
      <div className="space-y-4">
        {STORY_FIELDS.map(({ key, label }) => {
          const value = story[key];
          if (!value) return null;
          return (
            <div key={key} className="space-y-1">
              <p className="vx-label">{label}</p>
              <p className="text-body leading-relaxed text-zinc-300">{value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
