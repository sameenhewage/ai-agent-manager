/**
 * Single source of truth for human-facing date/time formatting across the dashboard
 * (Dashboard, Chat Monitor, Analytics). Every surface formats the SAME instant the SAME
 * way: in the TENANT timezone, 12-hour AM/PM. Using `Intl.DateTimeFormat` with an EXPLICIT
 * `timeZone` makes the result depend only on the instant + the fixed tenant zone — never on
 * the host's local zone — so server and client agree (no hydration drift) WITHOUT the old
 * "render in UTC" workaround that previously made Chat Monitor disagree with the Dashboard.
 *
 * Pure: the relative-label helpers take an injectable `now`, so there are no hidden
 * Date.now() side effects and everything is unit-testable.
 */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export type TimeInput = string | Date | null | undefined;

function toDate(value: TimeInput): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Calendar fields of an instant AS SEEN in `timeZone`. Deterministic (host-zone-independent). */
interface ZonedFields {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

// One formatter per zone (cached): cheap to reuse, keeps output deterministic.
const fieldFmtCache = new Map<string, Intl.DateTimeFormat>();
function fieldFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = fieldFmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    fieldFmtCache.set(timeZone, f);
  }
  return f;
}

function zonedFields(d: Date, timeZone: string): ZonedFields {
  const parts = fieldFormatter(timeZone).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** 12-hour clock with AM/PM from already-zoned fields (e.g. "7:00 PM", "12:00 AM"). */
function clockFromFields(f: ZonedFields): string {
  const ampm = f.hour >= 12 ? "PM" : "AM";
  let h = f.hour % 12;
  if (h === 0) h = 12;
  return `${h}:${pad(f.minute)} ${ampm}`;
}

/** Canonical tenant timezone. Single source of truth; analytics ranges re-export this. */
export const DEFAULT_TIME_ZONE = "Asia/Colombo";

/** Local calendar day key ("YYYY-MM-DD") of an instant in `timeZone`. "" for null/invalid. */
export function dayKey(value: TimeInput, timeZone: string): string {
  const d = toDate(value);
  if (!d) return "";
  const f = zonedFields(d, timeZone);
  return `${f.year}-${pad(f.month)}-${pad(f.day)}`;
}

/** WhatsApp-style bubble clock, e.g. "7:00 PM". "" for null/invalid. */
export function fmtClock(value: TimeInput, timeZone: string): string {
  const d = toDate(value);
  if (!d) return "";
  return clockFromFields(zonedFields(d, timeZone));
}

/** Absolute date + AM/PM time, e.g. "Jun 15, 7:00 PM". Em-dash sentinel for null/invalid. */
export function fmtDateTime(value: TimeInput, timeZone: string): string {
  const d = toDate(value);
  if (!d) return "\u2014";
  const f = zonedFields(d, timeZone);
  return `${MONTHS_SHORT[f.month - 1]} ${f.day}, ${clockFromFields(f)}`;
}

/** Chat header "last seen" stamp, e.g. "15 Jun 2026, 7:00 PM". "Unknown" for null/invalid. */
export function fmtFullStamp(value: TimeInput, timeZone: string): string {
  const d = toDate(value);
  if (!d) return "Unknown";
  const f = zonedFields(d, timeZone);
  return `${f.day} ${MONTHS_SHORT[f.month - 1]} ${f.year}, ${clockFromFields(f)}`;
}

/** Centered date-separator label: Today / Yesterday / "10 June 2026". "" for null. */
export function fmtDayLabel(value: TimeInput, timeZone: string, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "";
  const k = dayKey(d, timeZone);
  if (k === dayKey(now, timeZone)) return "Today";
  if (k === dayKey(new Date(now.getTime() - DAY_MS), timeZone)) return "Yesterday";
  const f = zonedFields(d, timeZone);
  return `${f.day} ${MONTHS_LONG[f.month - 1]} ${f.year}`;
}

/** Compact list timestamp: clock today, "Yesterday", short date this year, else m/d/yy. "" for null. */
export function fmtListStamp(value: TimeInput, timeZone: string, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "";
  const k = dayKey(d, timeZone);
  if (k === dayKey(now, timeZone)) return fmtClock(d, timeZone);
  if (k === dayKey(new Date(now.getTime() - DAY_MS), timeZone)) return "Yesterday";
  const f = zonedFields(d, timeZone);
  const nowYear = zonedFields(now, timeZone).year;
  if (f.year === nowYear) return `${f.day} ${MONTHS_SHORT[f.month - 1]}`;
  return `${pad(f.month)}/${pad(f.day)}/${String(f.year).slice(2)}`;
}
