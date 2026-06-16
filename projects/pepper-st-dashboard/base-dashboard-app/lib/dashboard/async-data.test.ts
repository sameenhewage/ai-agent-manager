import { describe, it, expect } from "vitest";
import { asyncDataReducer, initAsyncData } from "./async-data";

/**
 * Slice 12C (ADR-0013) — pure client data-fetch state machine. Locks the
 * keep-previous-data + pending + safe-error/retry behaviour shared by the Dashboard and
 * Analytics widgets, without a DOM. No data access, no metric definitions here.
 */

interface Demo {
  n: number;
}
const A: Demo = { n: 1 };
const B: Demo = { n: 2 };

describe("initAsyncData", () => {
  it("seeds idle state holding the initial real data", () => {
    expect(initAsyncData(A)).toEqual({ data: A, status: "idle", pendingKey: null, error: null });
  });
});

describe("asyncDataReducer — REQUEST", () => {
  it("keeps previous data visible, marks refreshing, records the clicked key, clears any stale error", () => {
    const errored = asyncDataReducer(
      asyncDataReducer(initAsyncData(A), { type: "REQUEST", key: "x" }),
      { type: "FAILURE", message: "boom" }
    );
    expect(errored).toEqual({ data: A, status: "error", pendingKey: null, error: "boom" });

    const next = asyncDataReducer(errored, { type: "REQUEST", key: "30d" });
    expect(next).toEqual({ data: A, status: "refreshing", pendingKey: "30d", error: null });
  });
});

describe("asyncDataReducer — SUCCESS", () => {
  it("replaces the data and returns to idle", () => {
    const reqd = asyncDataReducer(initAsyncData(A), { type: "REQUEST", key: "30d" });
    expect(asyncDataReducer(reqd, { type: "SUCCESS", data: B })).toEqual({
      data: B,
      status: "idle",
      pendingKey: null,
      error: null,
    });
  });
});

describe("asyncDataReducer — FAILURE", () => {
  it("KEEPS the previous data and surfaces a safe error message (so the user can retry)", () => {
    const reqd = asyncDataReducer(initAsyncData(A), { type: "REQUEST", key: "30d" });
    expect(asyncDataReducer(reqd, { type: "FAILURE", message: "nope" })).toEqual({
      data: A,
      status: "error",
      pendingKey: null,
      error: "nope",
    });
  });
});
