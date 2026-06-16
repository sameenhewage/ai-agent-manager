/**
 * Chat Monitor initial-load OWNERSHIP — pure, framework-free, no fetching, no cache.
 *
 * React StrictMode (dev) double-invokes mount effects on a client-side navigation, which
 * previously ran the whole list+transcript load TWICE (the duplicate first-load bug). The fix
 * is single ownership, not a global request de-dupe:
 *   - ONE owner loads the conversation LIST (at most once for the component's lifetime).
 *   - ONE owner loads the SELECTED transcript (once per distinct selected conversation).
 *
 * This module encodes that contract as a tiny stateful coordinator so it is unit-testable
 * without a DOM. It performs NO network I/O itself — the component supplies the real actions.
 * It is intentionally NOT a request cache and NOT a framework abstraction: a later, distinct
 * selection always loads, and an explicit retry bypasses it (the component calls the loader
 * with `force`).
 */

export interface ChatInitialLoadActions {
  /** Load the conversation list (the component wires the real fetch + masked DTO). */
  loadList: () => void;
  /** Load the latest transcript page for one conversation. */
  loadTranscript: (conversationId: string) => void;
}

export interface ChatInitialLoad {
  /**
   * Call from the LIST mount effect. Safe to call multiple times (React StrictMode runs the
   * mount effect twice in dev) — `loadList` runs at most ONCE.
   */
  ensureListLoaded: () => void;
  /**
   * Call from the SELECTED-ID effect with the current selection (or null before auto-select).
   * `loadTranscript` runs once per DISTINCT conversation id; null / a repeat of the current id
   * is a no-op (so a StrictMode re-invocation never double-loads the same transcript).
   */
  ensureTranscriptLoaded: (conversationId: string | null) => void;
}

export function createChatInitialLoad(actions: ChatInitialLoadActions): ChatInitialLoad {
  let listRequested = false;
  let transcriptRequestedFor: string | null = null;

  return {
    ensureListLoaded() {
      if (listRequested) return;
      listRequested = true;
      actions.loadList();
    },
    ensureTranscriptLoaded(conversationId) {
      if (!conversationId || conversationId === transcriptRequestedFor) return;
      transcriptRequestedFor = conversationId;
      actions.loadTranscript(conversationId);
    },
  };
}

/**
 * Auto-select resolver (pure): keep the user's current selection if any, otherwise select the
 * first conversation. Idempotent — combined with the once-only list load it guarantees the
 * first conversation is auto-selected EXACTLY ONCE and a user's choice is never overridden.
 */
export function resolveInitialSelection(
  currentSelectedId: string | null,
  firstConversationId: string | null
): string | null {
  return currentSelectedId ?? firstConversationId;
}
