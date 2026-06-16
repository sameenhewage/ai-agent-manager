"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { RANGE_BUTTONS, rangeButtonState } from "@/lib/dashboard/range-toolbar";

/**
 * Shared range toolbar (Slice 12C) for the Dashboard + Analytics surfaces. Renders the
 * six standard ranges as a segmented control with a CONSISTENT active / pending /
 * soft-disabled treatment (pure logic in `lib/dashboard/range-toolbar.ts`) plus an
 * accessible "Updating…" status. Purely presentational: the parent owns the
 * `useTransition` + `router.push("?range=…")` and passes `pending`/`pendingKey` down, so
 * the same pending state can also dim the page's data regions. No client data access; it
 * only changes the URL query param — the Server Component re-computes every real metric.
 */

export function SegButton({
  active,
  pending,
  disabled,
  onClick,
  children,
  title,
}: {
  active: boolean;
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      aria-busy={pending || undefined}
      onClick={() => {
        if (!disabled) onClick();
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
        active
          ? "bg-accent text-[var(--on-accent,#fff)] shadow-sm"
          : "text-muted hover:bg-hover hover:text-text",
        disabled && "cursor-default",
        // Soft-dim the OTHER buttons while a refresh is pending; the clicked button keeps
        // full opacity as a subtle "this one" pending cue (no spinner — see UpdatingBadge).
        disabled && !active && !pending && "opacity-70"
      )}
    >
      {children}
    </button>
  );
}

/** Accessible, polite "Updating…" status. Always mounted so it announces on change. */
export function UpdatingBadge({ show, className }: { show: boolean; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-accent transition-opacity duration-150",
        show ? "opacity-100" : "pointer-events-none opacity-0",
        className
      )}
    >
      {show ? (
        <>
          <Spinner /> Updating&hellip;
        </>
      ) : null}
    </span>
  );
}

export function RangeToolbar({
  currentKey,
  pending,
  pendingKey,
  onSelect,
  customActive = false,
  trailing,
  className,
}: {
  currentKey: string;
  pending: boolean;
  pendingKey: string | null;
  onSelect: (key: string) => void;
  customActive?: boolean;
  /** Optional extra controls (e.g. Analytics' Custom toggle + date inputs). */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="inline-flex flex-wrap items-center gap-1 rounded-[10px] border border-line bg-panel p-[3px]">
        {RANGE_BUTTONS.map((r) => {
          const s = rangeButtonState({
            optionKey: r.key,
            currentKey,
            customActive,
            pending,
            pendingKey,
          });
          return (
            <SegButton
              key={r.key}
              active={s.isActive}
              pending={s.isPending}
              disabled={s.isDisabled}
              onClick={() => onSelect(r.key)}
            >
              {r.label}
            </SegButton>
          );
        })}
      </div>
      {trailing}
      <UpdatingBadge show={pending} />
    </div>
  );
}
