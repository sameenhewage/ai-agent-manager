/**
 * Pure, timezone-aware analytics ranges (Slice 6, Workflow 05). Day/month boundaries
 * are computed in the TENANT timezone (`app_tenants.timezone`, default Asia/Colombo)
 * so future tenants in other regions get correct local bounds with no code change.
 * No DB, no Date.now() side effects (injectable `now`) — fully testable.
 */

// Canonical tenant zone lives in lib/format/time.ts (single source of truth). Re-exported
// here so existing analytics callers keep their `./ranges` import unchanged.
import { DEFAULT_TIME_ZONE } from "../format/time";
export { DEFAULT_TIME_ZONE };
const DAY_MS = 86_400_000;

export type RangeKey = "today" | "3d" | "7d" | "14d" | "30d" | "this_month" | "custom";

export interface ResolvedRange {
  key: RangeKey;
  from: Date; // inclusive lower bound (UTC instant)
  to: Date; // exclusive upper bound (UTC instant)
  label: string;
}

export interface ResolveRangeOptions {
  now?: Date;
  timeZone?: string; // IANA tz id
  customFrom?: string | null; // 'YYYY-MM-DD' in tenant-local time
  customTo?: string | null; // 'YYYY-MM-DD' in tenant-local time
}

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "3d", label: "Last 3 days" },
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "custom", label: "Custom" },
];

const LAST_N: Partial<Record<RangeKey, number>> = { "3d": 3, "7d": 7, "14d": 14, "30d": 30 };

interface TzParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function tzParts(date: Date, timeZone: string): TzParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

/** Offset (ms) where wallClockAsUTC - actualInstant. +5:30 → +19_800_000. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = tzParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const actual = Math.floor(date.getTime() / 1000) * 1000;
  return asUTC - actual;
}

/** UTC instant of local midnight (y, m, d 00:00:00) in `timeZone`. */
function zonedDayStartInstant(y: number, m: number, d: number, timeZone: string): Date {
  // Sample the offset at local noon to avoid the midnight DST transition edge.
  const noonGuess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offset = tzOffsetMs(noonGuess, timeZone);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offset);
}

/** Start of the local day containing `date`, in `timeZone`. */
export function startOfDay(date: Date, timeZone: string): Date {
  const p = tzParts(date, timeZone);
  return zonedDayStartInstant(p.year, p.month, p.day, timeZone);
}

/** Start of the local month containing `date`, in `timeZone`. */
export function startOfMonth(date: Date, timeZone: string): Date {
  const p = tzParts(date, timeZone);
  return zonedDayStartInstant(p.year, p.month, 1, timeZone);
}

/** Local calendar day key 'YYYY-MM-DD' for `date` in `timeZone`. */
export function tzDayKey(date: Date, timeZone: string): string {
  const p = tzParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function parseDayKey(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function resolveRange(key: RangeKey, opts: ResolveRangeOptions = {}): ResolvedRange {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone || DEFAULT_TIME_ZONE;
  const labelOf = (k: RangeKey) => RANGE_OPTIONS.find((o) => o.key === k)?.label ?? k;

  if (key === "today") {
    return { key, from: startOfDay(now, timeZone), to: now, label: labelOf("today") };
  }
  if (key === "this_month") {
    return { key, from: startOfMonth(now, timeZone), to: now, label: labelOf("this_month") };
  }
  if (key === "custom") {
    const f = opts.customFrom ? parseDayKey(opts.customFrom) : null;
    const t = opts.customTo ? parseDayKey(opts.customTo) : null;
    if (!f || !t) return resolveRange("30d", opts); // safe fallback; validation guards UI input
    const from = zonedDayStartInstant(f.y, f.m, f.d, timeZone);
    const to = new Date(zonedDayStartInstant(t.y, t.m, t.d, timeZone).getTime() + DAY_MS);
    return { key, from, to, label: labelOf("custom") };
  }

  const n = LAST_N[key] ?? 30;
  const todayStart = startOfDay(now, timeZone);
  return {
    key,
    from: new Date(todayStart.getTime() - (n - 1) * DAY_MS),
    to: now,
    label: labelOf(key),
  };
}

const VALID_KEYS = new Set<RangeKey>([
  "today",
  "3d",
  "7d",
  "14d",
  "30d",
  "this_month",
  "custom",
]);
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_RANGE_KEY: RangeKey = "7d";

export interface RangeParamsInput {
  range?: string | string[] | null;
  from?: string | string[] | null;
  to?: string | string[] | null;
}

export interface ParsedRangeParams {
  key: RangeKey;
  customFrom: string | null;
  customTo: string | null;
}

export interface ClampResult {
  from: Date;
  clamped: boolean;
  requestedFrom: Date | null; // original lower bound when clamping occurred
}

/**
 * Apply the tenant's analytics retention as a read-time access limit (ADR-0006): clamp
 * the range's lower bound to `now - retentionDays`. `NULL` = unlimited (no clamp). The
 * older portion is reported as out-of-window, never as a misleading zero.
 */
export function clampToRetention(
  from: Date,
  now: Date,
  retentionDays: number | null
): ClampResult {
  if (retentionDays == null) return { from, clamped: false, requestedFrom: null };
  const capStart = new Date(now.getTime() - retentionDays * 86_400_000);
  if (from.getTime() < capStart.getTime()) {
    return { from: capStart, clamped: true, requestedFrom: from };
  }
  return { from, clamped: false, requestedFrom: null };
}

/**
 * Validate raw URL/search params (dependency-free; Zod is not installed). Unknown keys
 * and malformed/inverted custom dates fall back to the default range rather than error.
 */
export function parseRangeParams(input: RangeParamsInput): ParsedRangeParams {
  const first = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const rawKey = String(first(input.range)).trim() as RangeKey;
  const key: RangeKey = VALID_KEYS.has(rawKey) ? rawKey : DEFAULT_RANGE_KEY;

  if (key === "custom") {
    const from = String(first(input.from)).trim();
    const to = String(first(input.to)).trim();
    if (DAY_KEY_RE.test(from) && DAY_KEY_RE.test(to) && from <= to) {
      return { key: "custom", customFrom: from, customTo: to };
    }
    return { key: DEFAULT_RANGE_KEY, customFrom: null, customTo: null };
  }

  return { key, customFrom: null, customTo: null };
}
