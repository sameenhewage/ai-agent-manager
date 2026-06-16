import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small inline loading spinner (Slice 12C). Purely decorative (`aria-hidden`) — the
 * accessible "Updating…" announcement lives on the surrounding status region. Respects
 * `prefers-reduced-motion` (animation is disabled for users who opt out).
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 animate-spin motion-reduce:animate-none", className)}
    />
  );
}
