import { AppShell } from "@/components/layout/AppShell";
import { AboutContent } from "@/components/knowledge/AboutContent";

export default function AboutPage() {
  return (
    <AppShell activeNav="about">
      <AboutContent />
    </AppShell>
  );
}
