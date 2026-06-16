"use client";

import * as React from "react";

/**
 * Calm data-region wrapper (Slice 12C-UX). During a range/filter refresh it keeps the
 * PREVIOUS real data FULLY visible — no dimming, no blanking, no per-card spinners, no
 * layout shift — and only sets `aria-busy` so assistive tech knows the region is updating.
 * The single visible "Updating…" cue lives in the toolbar (see `UpdatingBadge`), per the
 * loader policy "one indicator, not many".
 */
export function PendingSection({
  pending,
  children,
  className,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className} aria-busy={pending || undefined}>
      {children}
    </div>
  );
}
