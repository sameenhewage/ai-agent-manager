"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

/**
 * Slice 12C (ADR-0013) — a small, NON-destructive refresh-error banner. Shown when a
 * range refetch fails: the previous real data stays on screen (handled by the data hook),
 * and this strip offers a user-safe message + Retry. It never renders raw/internal errors.
 */
export function RefreshError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn bg-warn-weak px-4 py-2.5 text-[12.5px] text-text"
    >
      <span className="inline-flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0 text-warn" /> {error}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-semibold text-text transition-colors hover:bg-hover"
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}
