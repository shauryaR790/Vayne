import { AppShell } from "@/components/layout/AppShell";
import { ProjectsGrid } from "@/components/projects/ProjectsGrid";

export default function ProjectsPage() {
  return (
    <AppShell activeNav="projects">
      <ProjectsGrid />
    </AppShell>
  );
}
