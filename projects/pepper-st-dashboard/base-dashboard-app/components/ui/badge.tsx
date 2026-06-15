import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-[9px] py-[3px] font-mono text-[10.5px] font-bold whitespace-nowrap [&_svg]:size-[11px]",
  {
    variants: {
      variant: {
        default: "bg-hover text-muted",
        accent: "bg-accent-weak text-accent",
        ai: "bg-ai-weak text-ai",
        wa: "bg-wa-weak text-wa-deep",
        good: "bg-good-weak text-good",
        warn: "bg-warn-weak text-warn",
        bad: "bg-bad-weak text-bad",
        info: "bg-info-weak text-info",
        teal: "bg-teal-weak text-teal",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
