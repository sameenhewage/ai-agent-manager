import { describe, it, expect } from "vitest";
import { NAV, isActive, activeNav } from "./nav-items";

/** Parked/prototype-only surfaces that must NOT appear in Phase 1 nav. */
const FORBIDDEN = [
  "Orders",
  "Issues",
  "Exchanges",
  "Follow-up",
  "Custom Items",
  "Staff Tasks",
  "Bot Status",
  "Settings",
  "Bloomwire",
];

describe("Phase 1 navigation", () => {
  it("exposes exactly the three approved surfaces", () => {
    expect(NAV.map((n) => n.label)).toEqual([
      "Dashboard",
      "Chat Monitor",
      "Analytics",
    ]);
    expect(NAV.map((n) => n.href)).toEqual(["/", "/chat-monitor", "/analytics"]);
  });

  it("contains no parked/forbidden or Bloomwire entries", () => {
    const text = JSON.stringify(
      NAV.map((n) => ({ label: n.label, href: n.href, sub: n.sub }))
    );
    for (const f of FORBIDDEN) {
      expect(text).not.toContain(f);
    }
  });

  it("isActive matches root exactly and sub-routes by prefix", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/analytics")).toBe(false);
    expect(isActive("/chat-monitor", "/chat-monitor")).toBe(true);
    expect(isActive("/chat-monitor", "/chat-monitor/abc-123")).toBe(true);
  });

  it("activeNav falls back to Dashboard for unknown paths", () => {
    expect(activeNav("/nope").label).toBe("Dashboard");
    expect(activeNav("/analytics").label).toBe("Analytics");
  });
});
