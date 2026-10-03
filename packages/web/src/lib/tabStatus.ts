import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Live status in the browser tab (#958 part 3): a title prefix and a coloured
 * dot on the favicon, so a tab says "working" or "something landed" without
 * being looked at.
 *
 * | Page          | Running (orange dot, `● `)   | Unread (green dot)               |
 * |---------------|------------------------------|----------------------------------|
 * | Chat page     | this chat's turn in flight   | finished while hidden: `✓ `      |
 * | Project pages | any chat in the project      | `(n) ` the project's unread count|
 * | Root `/`      | anything on the instance     | `(n) ` the instance's unread     |
 *
 * Running wins the dot; the title carries both (`● (2) hushpod — House`).
 *
 * The data lives in two places, so the plumbing is a round trip through one
 * context, provided by `AppShell`:
 *  - the ROUTE knows what the tab is about (a {@link TabScope}) and, for a chat,
 *    whether its reply is unseen — it publishes that with {@link usePublishTabScope};
 *  - the SHELL knows the running set and the per-workspace badges, so it resolves
 *    the scope into a {@link TabStatus}, draws the favicon from it, and hands it
 *    back down through the same context for the route's title prefix.
 * A route that publishes nothing (Discover, Config, the grid) shows no status.
 * Outside an `AppShell` (component tests) the context is inert: idle, no-op.
 */

/** What the current tab is about. */
export type TabScope =
  | { kind: "chat"; sessionId: string; unread: boolean }
  | { kind: "workspace"; key: string }
  | { kind: "instance" };

/** What the tab should say. */
export interface TabStatus {
  running: boolean;
  /** Unread replies in scope. A chat page uses 0/1 and renders `✓ `, not a count. */
  unread: number;
  /** The scope's kind, which picks `✓ ` vs `(n) `. */
  kind: TabScope["kind"] | "none";
}

export const IDLE_TAB_STATUS: TabStatus = { running: false, unread: 0, kind: "none" };

/** Per-workspace counts, as the sidebar badges them. Keys are workspace keys; the root's is `""`. */
export interface WorkspaceBadge {
  unread: number;
  inflight: number;
}

export interface TabStatusInputs {
  badges: ReadonlyMap<string, WorkspaceBadge>;
  /** sessionId → workspace key, every turn running right now. */
  active: ReadonlyMap<string, string>;
}

/** Resolve a scope against the shell's live data. Pure. */
export function computeTabStatus(scope: TabScope | null, { badges, active }: TabStatusInputs): TabStatus {
  if (!scope) return IDLE_TAB_STATUS;
  switch (scope.kind) {
    case "chat": {
      const running = active.has(scope.sessionId);
      // A new turn in flight supersedes "finished while you were away".
      return { kind: "chat", running, unread: !running && scope.unread ? 1 : 0 };
    }
    case "workspace": {
      // `badges.get` — never a truthiness guard: the root workspace's key is "".
      const b = badges.get(scope.key);
      return { kind: "workspace", running: (b?.inflight ?? 0) > 0, unread: b?.unread ?? 0 };
    }
    case "instance": {
      let unread = 0;
      for (const b of badges.values()) unread += b.unread;
      return { kind: "instance", running: active.size > 0, unread };
    }
  }
}

/** The title prefix, caller-ready (trailing space included), or "". */
export function tabStatusPrefix(s: TabStatus): string {
  let out = s.running ? "● " : "";
  if (s.unread > 0) out += s.kind === "chat" ? "✓ " : `(${s.unread}) `;
  return out;
}

export type TabDot = "running" | "unread";

/** Which dot the favicon carries: running beats unread. */
export function tabStatusDot(s: TabStatus): TabDot | null {
  if (s.running) return "running";
  if (s.unread > 0) return "unread";
  return null;
}

/** Equality on what is rendered — the key a publisher compares to skip no-op updates. */
export function tabScopeKey(scope: TabScope | null): string {
  if (!scope) return "none";
  if (scope.kind === "chat") return `chat:${scope.sessionId}:${scope.unread ? 1 : 0}`;
  if (scope.kind === "workspace") return `ws:${scope.key}`;
  return "instance";
}

export interface TabStatusContextValue {
  status: TabStatus;
  /** {@link tabScopeKey} of the scope `status` was resolved for. */
  scopeKey: string;
  /** Publish (or, with null, withdraw) the mounted route's scope. */
  setScope: (scope: TabScope | null) => void;
}

export const TabStatusContext = createContext<TabStatusContextValue>({
  status: IDLE_TAB_STATUS,
  scopeKey: "none",
  setScope: () => {},
});

/**
 * Publish this route's scope for as long as it is mounted, and return the title
 * prefix the shell resolved for it. Re-publishes only when the scope's key
 * changes; withdraws on unmount so the next route starts idle.
 */
export function usePublishTabScope(scope: TabScope | null): string {
  const { status, scopeKey, setScope } = useContext(TabStatusContext);
  const key = tabScopeKey(scope);
  // The scope object is rebuilt every render; its key is what matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => scope, [key]);
  useEffect(() => {
    setScope(stable);
  }, [stable, setScope]);
  useEffect(() => () => setScope(null), [setScope]);
  // Until the shell has resolved THIS scope (the render between a navigation
  // and the publish effect) the status still describes the previous page; say
  // nothing rather than borrow it.
  return scopeKey === key ? tabStatusPrefix(status) : "";
}

/**
 * The shell's side: hold the published scope, resolve it against the live
 * badges + running set, and produce the context value. The value's identity
 * changes only when what it renders changes, so a badge recompute that moves
 * nothing in scope re-renders no consumer and redraws no favicon.
 */
export function useTabStatusState(inputs: TabStatusInputs): TabStatusContextValue {
  const [scope, setScopeState] = useState<TabScope | null>(null);
  const setScope = useCallback((next: TabScope | null) => {
    setScopeState((prev) => (tabScopeKey(prev) === tabScopeKey(next) ? prev : next));
  }, []);
  const { badges, active } = inputs;
  const computed = computeTabStatus(scope, { badges, active });
  const scopeKey = tabScopeKey(scope);
  const statusKey = `${scopeKey}|${computed.kind}|${computed.running ? 1 : 0}|${computed.unread}`;
  return useMemo(
    () => ({ status: computed, scopeKey, setScope }),
    // `computed` is fresh every render; `statusKey` is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusKey, setScope],
  );
}
