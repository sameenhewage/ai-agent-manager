import { describe, it, expect } from "vitest";
import { RANGE_BUTTONS, rangeButtonState } from "./range-toolbar";

/**
 * Slice 12C — pure range-toolbar state. Locks the active / pending / soft-disabled
 * behaviour shared by the Dashboard + Analytics switchers (no DOM needed). Also guards
 * the button set against drift and confirms the toolbar carries NO metric values.
 */

describe("RANGE_BUTTONS", () => {
  it("is exactly the six standard ranges, in order, without a Custom entry", () => {
    expect(RANGE_BUTTONS.map((b) => b.key)).toEqual([
      "today",
      "3d",
      "7d",
      "14d",
      "30d",
      "this_month",
    ]);
    expect(RANGE_BUTTONS.map((b) => b.label)).toEqual([
      "Today",
      "3D",
      "7D",
      "14D",
      "30D",
      "Month",
    ]);
    // Custom is an Analytics-only control rendered separately, never a standard button.
    expect(RANGE_BUTTONS.some((b) => b.key === "custom")).toBe(false);
  });

  it("carries labels only — no numeric metric/value fields (no fake metrics in the toolbar)", () => {
    for (const b of RANGE_BUTTONS) {
      expect(Object.keys(b).sort()).toEqual(["key", "label"]);
      expect(typeof b.label).toBe("string");
    }
  });
});

describe("rangeButtonState — active", () => {
  it("marks the current range active", () => {
    expect(rangeButtonState({ optionKey: "7d", currentKey: "7d" }).isActive).toBe(true);
  });

  it("marks non-current ranges inactive", () => {
    expect(rangeButtonState({ optionKey: "3d", currentKey: "7d" }).isActive).toBe(false);
  });

  it("never marks a standard button active while a custom range is in effect", () => {
    expect(
      rangeButtonState({ optionKey: "7d", currentKey: "7d", customActive: true }).isActive
    ).toBe(false);
  });

  it("marks the Custom button active when the custom panel is open OR the range is custom", () => {
    expect(rangeButtonState({ optionKey: "custom", currentKey: "7d", customActive: true }).isActive).toBe(
      true
    );
    expect(rangeButtonState({ optionKey: "custom", currentKey: "custom" }).isActive).toBe(true);
    expect(rangeButtonState({ optionKey: "custom", currentKey: "7d" }).isActive).toBe(false);
  });
});

describe("rangeButtonState — pending", () => {
  it("marks pending only on the clicked button while a refresh is in flight", () => {
    expect(
      rangeButtonState({ optionKey: "3d", currentKey: "7d", pending: true, pendingKey: "3d" }).isPending
    ).toBe(true);
    expect(
      rangeButtonState({ optionKey: "7d", currentKey: "7d", pending: true, pendingKey: "3d" }).isPending
    ).toBe(false);
  });

  it("is not pending when no navigation is in flight", () => {
    expect(rangeButtonState({ optionKey: "3d", currentKey: "7d", pendingKey: "3d" }).isPending).toBe(
      false
    );
  });

  it("soft-disables every button while a transition is pending, and none otherwise", () => {
    expect(rangeButtonState({ optionKey: "today", currentKey: "7d", pending: true }).isDisabled).toBe(
      true
    );
    expect(rangeButtonState({ optionKey: "today", currentKey: "7d", pending: false }).isDisabled).toBe(
      false
    );
  });
});
