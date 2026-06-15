import { describe, it, expect } from "vitest";
import { brand } from "./tokens";

describe("brand tokens", () => {
  it("matches the approved demo palette", () => {
    expect(brand.accent).toBe("#be185d");
    expect(brand.ai).toBe("#7c3aed");
    expect(brand.whatsapp).toBe("#25d366");
  });

  it("uses the demo radius + typography", () => {
    expect(brand.radius).toBe("14px");
    expect(brand.radiusSmall).toBe("10px");
    expect(brand.fontSans).toContain("Plus Jakarta Sans");
    expect(brand.fontMono).toContain("JetBrains Mono");
  });
});
