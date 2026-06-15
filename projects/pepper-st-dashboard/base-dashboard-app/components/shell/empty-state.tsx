import * as React from "react";
import { type LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-panel2 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-accent-weak text-accent">
        <Icon className="size-6" strokeWidth={1.9} />
      </div>
      <div className="text-[15px] font-bold">{title}</div>
      {children ? (
        <p className="max-w-[460px] text-[13px] leading-relaxed text-muted">
          {children}
        </p>
      ) : null}
    </div>
  );
}
