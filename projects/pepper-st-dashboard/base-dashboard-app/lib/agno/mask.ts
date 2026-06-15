/**
 * PII masking (ADR-0005 / Workflow 07). Single shared utility used by BOTH UI
 * rendering and logging. Country-agnostic: keep a small prefix/suffix, mask the
 * middle with a fixed number of bullets (so length isn't revealed). Never returns
 * enough to reconstruct the value; raw phone/contact ids must never be logged.
 */

const BULLETS = "•••••";

export function maskContactId(id: string | null | undefined): string {
  if (id == null) return "(none)";
  const s = String(id).trim();
  if (s.length === 0) return "(none)";
  // Too short to reveal any part safely.
  if (s.length <= 4) return BULLETS;
  const prefix = s.slice(0, 2);
  const suffix = s.length >= 8 ? s.slice(-3) : s.slice(-2);
  return `${prefix}${BULLETS}${suffix}`;
}
