import { Button } from "@/components/ui/button";

export function AskVayneButton({ className }: { className?: string }) {
  return (
    <Button variant="secondary" size="sm" className={className}>
      Ask VAYNE
    </Button>
  );
}
