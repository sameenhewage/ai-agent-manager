/**
 * Pure range-toolbar state (Slice 12C). Shared by the Dashboard + Analytics range
 * switchers so the active / pending / soft-disabled treatment is IDENTICAL across both
 * surfaces and unit-testable without a DOM. No data access and no metric definitions
 * live here — this only decides how a toolbar button should look.
 */

export interface RangeButtonDef {
  key: string;
  label: string;
}

/** The six standard ranges shown on BOTH the Dashboard and Analytics toolbars. */
export const RANGE_BUTTONS: RangeButtonDef[] = [
  { key: "today", label: "Today" },
  { key: "3d", label: "3D" },
  { key: "7d", label: "7D" },
  { key: "14d", label: "14D" },
  { key: "30d", label: "30D" },
  { key: "this_month", label: "Month" },
];

export interface RangeButtonStateInput {
  optionKey: string;
  currentKey: string;
  /** Analytics-only: the Custom panel is open / the resolved range is custom. */
  customActive?: boolean;
  /** A range navigation is in flight (React transition pending). */
  pending?: boolean;
  /** The specific range the user just clicked (marked pending; no spinner — see UpdatingBadge). */
  pendingKey?: string | null;
}

export interface RangeButtonState {
  isActive: boolean;
  isPending: boolean;
  isDisabled: boolean;
}

/**
 * Decide how one toolbar button should render. `custom` is active when the custom panel
 * is open or the resolved range is custom; the standard buttons are never active while a
 * custom range is in effect. Every button is soft-disabled during a transition (prevents
 * double-navigation); only the clicked button (`pendingKey`) is marked pending (`aria-busy`,
 * full opacity) — there is no per-button spinner; the single “Updating…” cue is the toolbar badge.
 */
export function rangeButtonState({
  optionKey,
  currentKey,
  customActive = false,
  pending = false,
  pendingKey = null,
}: RangeButtonStateInput): RangeButtonState {
  const isActive =
    optionKey === "custom"
      ? customActive || currentKey === "custom"
      : optionKey === currentKey && !customActive;
  return {
    isActive,
    isPending: pending && pendingKey === optionKey,
    isDisabled: pending,
  };
}
