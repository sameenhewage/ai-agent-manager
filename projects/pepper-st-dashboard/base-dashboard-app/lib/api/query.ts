import { RANGE_OPTIONS, type RangeKey } from "../analytics/ranges";

/**
 * Slice 12C (ADR-0013) — pure, dependency-free validation of the ONLY safe client
 * filter inputs (`range`/`from`/`to`) for the internal Dashboard/Analytics API routes,
 * plus the matching query-string builder used by the client widgets. Tenant/channel are
 * NEVER taken from the client (resolved server-side), so any other param is ignored here.
 * No DB, no DOM — safe to import from both route handlers and client components.
 */

export { DEFAULT_RANGE_KEY } from "../analytics/ranges";
import { DEFAULT_RANGE_KEY } from "../analytics/ranges";

export interface ValidatedRange {
  key: RangeKey;
  customFrom: string | null;
  customTo: string | null;
}

export type AnalyticsQueryResult =
  | { ok: true; value: ValidatedRange }
  | { ok: false; error: string };

const VALID_KEYS = new Set<RangeKey>(RANGE_OPTIONS.map((o) => o.key));
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const trimmed = (v: string | null | undefined): string => (v ?? "").trim();

/**
 * Pure check shared by the API route guard and the Analytics custom-range UI: a custom
 * range is valid only when both ends are real `YYYY-MM-DD` dates and `from <= to`. Keeps
 * an invalid/incomplete custom range from firing a confusing request (client OR server).
 */
export function isCustomRangeValid(
  from: string | null | undefined,
  to: string | null | undefined
): boolean {
  const f = trimmed(from);
  const t = trimmed(to);
  return DAY_RE.test(f) && DAY_RE.test(t) && f <= t;
}

/**
 * Validate the safe filter inputs. Returns `{ ok:false }` (never throws) on an unknown
 * range or an invalid/incomplete custom range so the route can answer a clean 400. An
 * absent `range` defaults to the standard default range (used for initial loads).
 */
export function parseAnalyticsQuery(params: URLSearchParams): AnalyticsQueryResult {
  const raw = trimmed(params.get("range"));
  const key = (raw === "" ? DEFAULT_RANGE_KEY : raw) as RangeKey;

  if (!VALID_KEYS.has(key)) {
    return { ok: false, error: "Invalid range." };
  }

  if (key === "custom") {
    const from = trimmed(params.get("from"));
    const to = trimmed(params.get("to"));
    if (!isCustomRangeValid(from, to)) {
      return { ok: false, error: "Custom range requires valid from/to dates (from \u2264 to)." };
    }
    return { ok: true, value: { key: "custom", customFrom: from, customTo: to } };
  }

  return { ok: true, value: { key, customFrom: null, customTo: null } };
}

export interface RangeSelection {
  key: string;
  customFrom?: string | null;
  customTo?: string | null;
}

/** Build the canonical `?range=…[&from=&to=]` query string (client fetch URL + URL sync). */
export function buildRangeQuery(sel: RangeSelection): string {
  const sp = new URLSearchParams();
  sp.set("range", sel.key);
  if (sel.key === "custom" && sel.customFrom && sel.customTo) {
    sp.set("from", sel.customFrom);
    sp.set("to", sel.customTo);
  }
  return sp.toString();
}
