import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AskVayneButton({ className }: { className?: string }) {
  return (
    <Button variant="secondary" size="sm" className={className}>
      <Sparkles className="size-3.5" />
      Ask VAYNE
    </Button>
  );
}
