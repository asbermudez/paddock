import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { memo, useState } from "react";
import {
  computeTabStatus,
  IDLE_TAB_STATUS,
  TabStatusContext,
  tabStatusDot,
  tabStatusPrefix,
  useHiddenSince,
  usePublishTabScope,
  useTabStatusState,
  type TabFinished,
  type TabScope,
  type TabStatusInputs,
} from "./tabStatus";

/** Visibility, driven the way the browser does: the property plus the event. */
let visibility: DocumentVisibilityState = "visible";
beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  delete (document as unknown as Record<string, unknown>).visibilityState;
  vi.useRealTimers();
});
const setVisibility = (v: DocumentVisibilityState) =>
  act(() => {
    visibility = v;
    document.dispatchEvent(new Event("visibilitychange"));
  });

// The backlog: replies that landed at t=100..300, long before anything below.
const BACKLOG: TabFinished[] = [
  { projectSlug: "", at: 100 }, // the ROOT workspace — key "", never a falsy guard
  { projectSlug: "hushpod", at: 200 },
  { projectSlug: "hushpod", at: 300 },
];
const ACTIVE = new Map([["sess-run", "hushpod"]]);

describe("computeTabStatus + prefix + dot", () => {
  const show = (scope: TabScope | null, inputs: Partial<TabStatusInputs> = {}) => {
    const s = computeTabStatus(scope, { active: ACTIVE, finished: BACKLOG, hiddenSince: null, ...inputs });
    return { prefix: tabStatusPrefix(s), dot: tabStatusDot(s) };
  };

  it("chat page: ● while this chat runs, ✓ when it is unread in a background tab, nothing otherwise", () => {
    expect(show({ kind: "chat", sessionId: "sess-run", unread: false })).toEqual({ prefix: "● ", dot: "running" });
    expect(show({ kind: "chat", sessionId: "sess-done", unread: true })).toEqual({ prefix: "✓ ", dot: "unread" });
    expect(show({ kind: "chat", sessionId: "sess-done", unread: false })).toEqual({ prefix: "", dot: null });
    // A new turn in flight supersedes the stale ✓.
    expect(show({ kind: "chat", sessionId: "sess-run", unread: true })).toEqual({ prefix: "● ", dot: "running" });
  });

  it("chat page ignores OTHER chats' activity", () => {
    expect(show({ kind: "chat", sessionId: "sess-other", unread: false })).toEqual({ prefix: "", dot: null });
  });

  it("project/root: the unread BACKLOG alone never shows (visible tab)", () => {
    expect(show({ kind: "workspace", key: "hushpod" })).toEqual({ prefix: "● ", dot: "running" });
    expect(show({ kind: "workspace", key: "" })).toEqual({ prefix: "", dot: null });
    expect(show({ kind: "instance" })).toEqual({ prefix: "● ", dot: "running" });
  });

  it("project/root: the backlog doesn't count from a hidden tab either — only replies after the baseline", () => {
    expect(show({ kind: "workspace", key: "" }, { hiddenSince: 1000 })).toEqual({ prefix: "", dot: null });
    const landed = [...BACKLOG, { projectSlug: "hushpod", at: 1500 }, { projectSlug: "", at: 1600 }];
    expect(show({ kind: "workspace", key: "hushpod" }, { finished: landed, hiddenSince: 1000 })).toEqual({
      prefix: "● (1) ",
      dot: "running",
    });
    expect(show({ kind: "workspace", key: "" }, { finished: landed, hiddenSince: 1000 })).toEqual({
      prefix: "(1) ",
      dot: "unread",
    });
    expect(show({ kind: "instance" }, { finished: landed, hiddenSince: 1000 })).toEqual({
      prefix: "● (2) ",
      dot: "running",
    });
    // …and none of it while the tab is visible.
    expect(show({ kind: "workspace", key: "" }, { finished: landed, hiddenSince: null })).toEqual({
      prefix: "",
      dot: null,
    });
  });

  it("running is per scope; an unknown workspace is idle", () => {
    expect(show({ kind: "workspace", key: "quiet" })).toEqual({ prefix: "", dot: null });
    expect(show({ kind: "instance" }, { active: new Map() })).toEqual({ prefix: "", dot: null });
  });

  it("no scope is idle", () => {
    expect(computeTabStatus(null, { active: ACTIVE, finished: BACKLOG, hiddenSince: 0 })).toBe(IDLE_TAB_STATUS);
  });
});

describe("useHiddenSince", () => {
  it("is null while visible, the moment of hiding while hidden, and null again on return", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(5000);
    const { result } = renderHook(() => useHiddenSince());
    expect(result.current).toBeNull();
    vi.setSystemTime(6000);
    setVisibility("hidden");
    expect(result.current).toBe(6000);
    vi.setSystemTime(7000);
    setVisibility("hidden"); // a repeat event doesn't move the baseline
    expect(result.current).toBe(6000);
    setVisibility("visible");
    expect(result.current).toBeNull();
  });

  it("starts at load time for a tab loaded hidden", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(4242);
    visibility = "hidden";
    const { result } = renderHook(() => useHiddenSince());
    expect(result.current).toBe(4242);
  });
});

describe("usePublishTabScope ↔ useTabStatusState", () => {
  /** A minimal shell: the provider, plus a route that publishes `scope` and prints its prefix. */
  function rig(initial: TabScope | null, inputs: Omit<TabStatusInputs, "hiddenSince">) {
    let setRouteScope!: (s: TabScope | null) => void;
    let setShown!: (b: boolean) => void;
    let setInputs!: (i: Omit<TabStatusInputs, "hiddenSince">) => void;
    const renders = { route: 0 };
    /** Every prefix the route rendered, with the scope it rendered it under. */
    const seen: Array<{ scope: string; prefix: string }> = [];
    // memo: the route re-renders only when its prop or the CONTEXT changes.
    const Route = memo(function Route({ scope }: { scope: TabScope | null }) {
      renders.route += 1;
      const prefix = usePublishTabScope(scope);
      seen.push({ scope: scope?.kind === "chat" ? `chat:${scope.sessionId}` : String(scope?.kind), prefix });
      return <span data-testid="prefix">{`[${prefix}]`}</span>;
    });
    function Shell() {
      const [scope, setScope] = useState(initial);
      const [shown, show] = useState(true);
      const [i, setI] = useState(inputs);
      setRouteScope = setScope;
      setShown = show;
      setInputs = setI;
      const value = useTabStatusState(i);
      return (
        <>
          <span data-testid="dot">{String(tabStatusDot(value.status))}</span>
          <TabStatusContext.Provider value={value}>{shown && <Route scope={scope} />}</TabStatusContext.Provider>
        </>
      );
    }
    const view = render(<Shell />);
    const text = (id: string) => view.getByTestId(id).textContent;
    return {
      prefix: () => text("prefix"),
      dot: () => text("dot"),
      renders,
      seen,
      setScope: (s: TabScope | null) => act(() => setRouteScope(s)),
      unmountRoute: () => act(() => setShown(false)),
      setInputs: (i: Omit<TabStatusInputs, "hiddenSince">) => act(() => setInputs(i)),
    };
  }

  it("round-trips a scope into a prefix and a dot", () => {
    const r = rig({ kind: "workspace", key: "hushpod" }, { active: ACTIVE, finished: BACKLOG });
    expect(r.prefix()).toBe("[● ]");
    expect(r.dot()).toBe("running");
    r.setScope({ kind: "chat", sessionId: "sess-done", unread: true });
    expect(r.prefix()).toBe("[✓ ]");
    expect(r.dot()).toBe("unread");
  });

  it("never renders the PREVIOUS scope's prefix under a new scope (the scopeKey guard)", () => {
    const r = rig({ kind: "workspace", key: "hushpod" }, { active: ACTIVE, finished: BACKLOG });
    expect(r.prefix()).toBe("[● ]");
    r.seen.length = 0;
    // Navigate to an idle chat. The first render under the new scope still has
    // the shell's OLD status in context (● for hushpod) — the guard must hide it.
    r.setScope({ kind: "chat", sessionId: "sess-idle", unread: false });
    const underChat = r.seen.filter((s) => s.scope === "chat:sess-idle");
    expect(underChat.length).toBeGreaterThan(0);
    expect(underChat.map((s) => s.prefix)).toEqual(underChat.map(() => ""));
    expect(r.prefix()).toBe("[]");
  });

  it("(n) appears only for replies that land while the tab is hidden, and clears on return", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1000);
    const r = rig({ kind: "workspace", key: "" }, { active: new Map(), finished: BACKLOG });
    // Backlog at load: nothing.
    expect(r.prefix()).toBe("[]");
    expect(r.dot()).toBe("null");

    // A reply lands while you're LOOKING at the tab: still nothing.
    r.setInputs({ active: new Map(), finished: [...BACKLOG, { projectSlug: "", at: 1500 }] });
    expect(r.prefix()).toBe("[]");

    vi.setSystemTime(2000);
    setVisibility("hidden");
    expect(r.prefix()).toBe("[]");
    r.setInputs({ active: new Map(), finished: [...BACKLOG, { projectSlug: "", at: 1500 }, { projectSlug: "", at: 2500 }] });
    expect(r.prefix()).toBe("[(1) ]");
    expect(r.dot()).toBe("unread");

    setVisibility("visible");
    expect(r.prefix()).toBe("[]");
    expect(r.dot()).toBe("null");
  });

  it("withdraws on unmount, so the next page starts idle", () => {
    const r = rig({ kind: "workspace", key: "hushpod" }, { active: ACTIVE, finished: BACKLOG });
    expect(r.dot()).toBe("running");
    r.unmountRoute();
    expect(r.dot()).toBe("null");
  });

  it("does not re-render consumers when a recompute changes nothing in scope", () => {
    const r = rig({ kind: "workspace", key: "hushpod" }, { active: ACTIVE, finished: BACKLOG });
    const before = r.renders.route;
    // Another workspace started running: same status for this scope.
    r.setInputs({ active: new Map([...ACTIVE, ["sess-x", "quiet"]]), finished: BACKLOG });
    expect(r.renders.route).toBe(before);
    // This workspace stopped running: one re-render, new prefix.
    r.setInputs({ active: new Map(), finished: BACKLOG });
    expect(r.prefix()).toBe("[]");
  });

  it("is inert outside a shell: no prefix, no throw", () => {
    const { result } = renderHook(() => usePublishTabScope({ kind: "instance" }));
    expect(result.current).toBe("");
  });
});
