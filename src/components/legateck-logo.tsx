import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";

export function LegateckLogo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-gradient-gold shadow-glow">
        <Scale className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
      </div>
      {withText && (
        <div className="flex flex-col leading-none">
          <span className="text-lg font-semibold tracking-tight text-foreground">Legateck</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Panamá · Legal AI</span>
        </div>
      )}
    </div>
  );
}
