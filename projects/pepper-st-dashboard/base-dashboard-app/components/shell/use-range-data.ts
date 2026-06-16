"use client";

import * as React from "react";
import { asyncDataReducer, initAsyncData } from "@/lib/dashboard/async-data";
import { buildRangeQuery, type RangeSelection } from "@/lib/api/query";

/**
 * Slice 12C (ADR-0013) — client fetch engine shared by the Dashboard + Analytics range
 * widgets. Wraps the pure `asyncDataReducer` with `fetch`:
 *  - keeps the PREVIOUS real data mounted while a new range loads (no blank, no jump);
 *  - shows an immediate pending state (the clicked range key is tracked for its pending cue);
 *  - ignores stale, out-of-order responses (latest request wins);
 *  - on failure keeps the old data and exposes a user-safe error for Retry;
 *  - syncs the URL via `history.replaceState` (shareable range, NO server round-trip).
 * No DB access and no metric logic live here — only `fetch` + state.
 */
export function useRangeData<T>(opts: {
  endpoint: string;
  initialData: T;
  initialSelection: RangeSelection;
  /** Keep `?range=…` in the address bar in sync (default true). */
  syncUrl?: boolean;
}) {
  const { endpoint, initialData, initialSelection, syncUrl = true } = opts;
  const [state, dispatch] = React.useReducer(asyncDataReducer<T>, initAsyncData(initialData));
  const [selection, setSelection] = React.useState<RangeSelection>(initialSelection);
  const reqId = React.useRef(0);

  const select = React.useCallback(
    async (sel: RangeSelection) => {
      const id = ++reqId.current;
      setSelection(sel);
      dispatch({ type: "REQUEST", key: sel.key });
      const qs = buildRangeQuery(sel);
      try {
        const res = await fetch(`${endpoint}?${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as T;
        if (id !== reqId.current) return; // superseded by a newer click
        dispatch({ type: "SUCCESS", data });
        if (syncUrl && typeof window !== "undefined") {
          window.history.replaceState(null, "", `${window.location.pathname}?${qs}`);
        }
      } catch {
        if (id !== reqId.current) return;
        dispatch({
          type: "FAILURE",
          message: "Couldn\u2019t update \u2014 showing the previous data.",
        });
      }
    },
    [endpoint, syncUrl]
  );

  const retry = React.useCallback(() => {
    void select(selection);
  }, [select, selection]);

  return {
    data: state.data,
    status: state.status,
    pending: state.status === "refreshing",
    pendingKey: state.pendingKey,
    error: state.error,
    selection,
    select,
    retry,
  };
}
