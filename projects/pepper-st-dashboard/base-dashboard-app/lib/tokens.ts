/**
 * PEPPER ST. brand tokens (single source of truth for TS usage + tests).
 * These mirror the CSS variables in `app/globals.css`, which are mapped 1:1 from
 * the approved demo prototype. Keep this file and `globals.css` in sync.
 */
export const brand = {
  /** Brand accent — rose/berry (business + staff actions). */
  accent: "#be185d",
  /** AI accent — violet (everything the bot does). */
  ai: "#7c3aed",
  /** WhatsApp channel green. */
  whatsapp: "#25d366",
  /** Large surface radius. */
  radius: "14px",
  /** Small control radius. */
  radiusSmall: "10px",
  fontSans: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif',
  fontMono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export type BrandTokens = typeof brand;
