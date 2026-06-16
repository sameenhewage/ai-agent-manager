/**
 * Slice 12C (ADR-0013) — pure client data-fetch state machine for the Dashboard and
 * Analytics range widgets. It guarantees the agreed UX without a DOM: the PREVIOUS real
 * data stays visible while a new range is fetched ("keep-previous-data"), the toolbar
 * shows an immediate pending state, and a failed fetch keeps the old data while exposing
 * a user-safe error so the widget can offer Retry. No data access, no metric definitions.
 */

export type AsyncStatus = "idle" | "refreshing" | "error";

export interface AsyncDataState<T> {
  /** Always holds the last GOOD data — never cleared on refresh or error. */
  data: T;
  status: AsyncStatus;
  /** The range key the user just clicked (drives the clicked-button pending cue). */
  pendingKey: string | null;
  /** A user-safe error message (never raw/internal); null unless status === "error". */
  error: string | null;
}

export type AsyncDataAction<T> =
  | { type: "REQUEST"; key: string }
  | { type: "SUCCESS"; data: T }
  | { type: "FAILURE"; message: string };

export function initAsyncData<T>(data: T): AsyncDataState<T> {
  return { data, status: "idle", pendingKey: null, error: null };
}

export function asyncDataReducer<T>(
  state: AsyncDataState<T>,
  action: AsyncDataAction<T>
): AsyncDataState<T> {
  switch (action.type) {
    case "REQUEST":
      // Keep the previous data mounted; mark refreshing; remember the clicked key; drop any stale error.
      return { ...state, status: "refreshing", pendingKey: action.key, error: null };
    case "SUCCESS":
      return { data: action.data, status: "idle", pendingKey: null, error: null };
    case "FAILURE":
      // Keep the previous data visible; surface a safe error so the user can retry.
      return { ...state, status: "error", pendingKey: null, error: action.message };
    default:
      return state;
  }
}
