import { describe, it, expect, vi } from "vitest";
import { createChatInitialLoad, resolveInitialSelection } from "./initial-load";

/**
 * Root-cause ownership lock (replaces the global request de-dupe). React StrictMode (dev)
 * double-invokes mount effects on client navigation; the previous code re-ran the whole
 * list+transcript load twice. These tests prove the lifecycle has a SINGLE owner for the list
 * and a SINGLE owner for the selected transcript — WITHOUT any global URL de-dupe.
 */

describe("createChatInitialLoad — single-owner initial load", () => {
  it("loads the conversation LIST exactly once even when the mount effect runs twice (StrictMode)", () => {
    const loadList = vi.fn();
    const loadTranscript = vi.fn();
    const loader = createChatInitialLoad({ loadList, loadTranscript });

    // Simulate React StrictMode's dev double-invoke of the mount effect.
    loader.ensureListLoaded();
    loader.ensureListLoaded();

    expect(loadList).toHaveBeenCalledTimes(1);
    expect(loadTranscript).not.toHaveBeenCalled();
  });

  it("loads the selected TRANSCRIPT exactly once for the auto-selected first conversation", () => {
    const loadList = vi.fn();
    const loadTranscript = vi.fn();
    const loader = createChatInitialLoad({ loadList, loadTranscript });

    // Initial renders before auto-select: selectedId is null → never loads a transcript.
    loader.ensureTranscriptLoaded(null);
    loader.ensureTranscriptLoaded(null);
    expect(loadTranscript).not.toHaveBeenCalled();

    // Auto-select resolves the first conversation; the selected-id effect may run twice.
    loader.ensureTranscriptLoaded("conv-1");
    loader.ensureTranscriptLoaded("conv-1");

    expect(loadTranscript).toHaveBeenCalledTimes(1);
    expect(loadTranscript).toHaveBeenCalledWith("conv-1");
  });

  it("loads each DISTINCT conversation once as the user switches (no global cache, no re-load storm)", () => {
    const loadTranscript = vi.fn();
    const loader = createChatInitialLoad({ loadList: vi.fn(), loadTranscript });

    loader.ensureTranscriptLoaded("conv-1");
    loader.ensureTranscriptLoaded("conv-2");
    loader.ensureTranscriptLoaded("conv-2"); // repeat of current → no-op
    loader.ensureTranscriptLoaded("conv-3");

    expect(loadTranscript.mock.calls.map((c) => c[0])).toEqual(["conv-1", "conv-2", "conv-3"]);
  });

  it("does NOT couple the two owners — loading the list never triggers a transcript load", () => {
    const loadList = vi.fn();
    const loadTranscript = vi.fn();
    const loader = createChatInitialLoad({ loadList, loadTranscript });

    loader.ensureListLoaded();

    expect(loadList).toHaveBeenCalledTimes(1);
    expect(loadTranscript).not.toHaveBeenCalled(); // the bug was loadList() calling loadChat(first)
  });
});

describe("resolveInitialSelection — auto-select first, once, without overriding the user", () => {
  it("selects the first conversation when nothing is selected yet", () => {
    expect(resolveInitialSelection(null, "conv-1")).toBe("conv-1");
  });

  it("keeps the user's current selection (never re-selects / overrides)", () => {
    expect(resolveInitialSelection("conv-2", "conv-1")).toBe("conv-2");
  });

  it("selects nothing when the list is empty", () => {
    expect(resolveInitialSelection(null, null)).toBeNull();
  });
});
