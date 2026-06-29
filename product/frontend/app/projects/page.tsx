import { AppShell } from "@/components/layout/AppShell";

export default function ProjectsPage() {
  return (
    <AppShell activeNav="projects">
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
        <h1 className="text-brutal text-2xl font-black uppercase tracking-[0.06em] sm:text-3xl">
          Projects
        </h1>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-white/50">
          Coming soon
        </p>
      </div>
    </AppShell>
  );
}
