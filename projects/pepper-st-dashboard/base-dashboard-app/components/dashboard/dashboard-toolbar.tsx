"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Dashboard range filter (Slice 7C) — a segmented control mirroring the demo's `.seg`.
 * It only changes the `?range=` query param; the Server Component re-computes every real
 * metric for the new range (timezone-aware, retention-clamped). No client data access.
 */

const RANGES: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "3d", label: "3D" },
  { key: "7d", label: "7D" },
  { key: "14d", label: "14D" },
  { key: "30d", label: "30D" },
  { key: "this_month", label: "Month" },
];

export function DashboardToolbar({ currentRange }: { currentRange: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();

  function go(key: string) {
    const sp = new URLSearchParams();
    sp.set("range", key);
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-[10px] border border-line bg-panel p-[3px]",
        pending && "opacity-60"
      )}
    >
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => go(r.key)}
          aria-pressed={currentRange === r.key}
          className={cn(
            "rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
            currentRange === r.key
              ? "bg-accent text-[var(--on-accent,#fff)] shadow-sm"
              : "text-muted hover:bg-hover hover:text-text"
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
