import { describe, it, expect } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { memo, useState } from "react";
import {
  computeTabStatus,
  IDLE_TAB_STATUS,
  TabStatusContext,
  tabStatusDot,
  tabStatusPrefix,
  usePublishTabScope,
  useTabStatusState,
  type TabScope,
  type TabStatusInputs,
  type WorkspaceBadge,
} from "./tabStatus";

const badges = (entries: Array<[string, Partial<WorkspaceBadge>]>) =>
  new Map(entries.map(([k, b]) => [k, { unread: 0, inflight: 0, ...b }]));

const live: TabStatusInputs = {
  badges: badges([
    ["", { unread: 1 }], // the ROOT workspace — key "", never a falsy guard
    ["hushpod", { unread: 2, inflight: 1 }],
    ["quiet", {}],
  ]),
  active: new Map([["sess-run", "hushpod"]]),
};

describe("computeTabStatus + prefix + dot", () => {
  const show = (scope: TabScope | null, inputs = live) => {
    const s = computeTabStatus(scope, inputs);
    return { prefix: tabStatusPrefix(s), dot: tabStatusDot(s) };
  };

  it("chat page: ● while this chat runs, ✓ for a reply landed while hidden, nothing otherwise", () => {
    expect(show({ kind: "chat", sessionId: "sess-run", unread: false })).toEqual({ prefix: "● ", dot: "running" });
    expect(show({ kind: "chat", sessionId: "sess-done", unread: true })).toEqual({ prefix: "✓ ", dot: "unread" });
    expect(show({ kind: "chat", sessionId: "sess-done", unread: false })).toEqual({ prefix: "", dot: null });
    // A new turn in flight supersedes the stale ✓.
    expect(show({ kind: "chat", sessionId: "sess-run", unread: true })).toEqual({ prefix: "● ", dot: "running" });
  });

  it("chat page ignores OTHER chats' activity", () => {
    expect(show({ kind: "chat", sessionId: "sess-other", unread: false })).toEqual({ prefix: "", dot: null });
  });

  it("project page: running + (n) combine; running wins the dot", () => {
    expect(show({ kind: "workspace", key: "hushpod" })).toEqual({ prefix: "● (2) ", dot: "running" });
    expect(show({ kind: "workspace", key: "quiet" })).toEqual({ prefix: "", dot: null });
    expect(show({ kind: "workspace", key: "unknown" })).toEqual({ prefix: "", dot: null });
  });

  it("the root workspace's own pages read key \"\" (not treated as missing)", () => {
    expect(show({ kind: "workspace", key: "" })).toEqual({ prefix: "(1) ", dot: "unread" });
  });

  it("root Home aggregates the whole instance", () => {
    expect(show({ kind: "instance" })).toEqual({ prefix: "● (3) ", dot: "running" });
    const idle: TabStatusInputs = { badges: badges([["", {}]]), active: new Map() };
    expect(show({ kind: "instance" }, idle)).toEqual({ prefix: "", dot: null });
  });

  it("no scope is idle", () => {
    expect(computeTabStatus(null, live)).toBe(IDLE_TAB_STATUS);
  });
});

describe("usePublishTabScope ↔ useTabStatusState", () => {
  /** A minimal shell: the provider, plus a route that publishes `scope` and prints its prefix. */
  function rig(initial: TabScope | null, inputs: TabStatusInputs) {
    let setRouteScope!: (s: TabScope | null) => void;
    let setShown!: (b: boolean) => void;
    let setInputs!: (i: TabStatusInputs) => void;
    const renders = { route: 0 };
    // memo: the route re-renders only when its prop or the CONTEXT changes.
    const Route = memo(function Route({ scope }: { scope: TabScope | null }) {
      renders.route += 1;
      return <span data-testid="prefix">{`[${usePublishTabScope(scope)}]`}</span>;
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
      setScope: (s: TabScope | null) => act(() => setRouteScope(s)),
      unmountRoute: () => act(() => setShown(false)),
      setInputs: (i: TabStatusInputs) => act(() => setInputs(i)),
    };
  }

  it("round-trips a scope into a prefix and a dot", () => {
    const r = rig({ kind: "workspace", key: "hushpod" }, live);
    expect(r.prefix()).toBe("[● (2) ]");
    expect(r.dot()).toBe("running");
    r.setScope({ kind: "chat", sessionId: "sess-done", unread: true });
    expect(r.prefix()).toBe("[✓ ]");
    expect(r.dot()).toBe("unread");
  });

  it("withdraws on unmount, so the next page starts idle", () => {
    const r = rig({ kind: "workspace", key: "hushpod" }, live);
    expect(r.dot()).toBe("running");
    r.unmountRoute();
    expect(r.dot()).toBe("null");
  });

  it("does not re-render consumers when a badge recompute changes nothing in scope", () => {
    const r = rig({ kind: "workspace", key: "hushpod" }, live);
    const before = r.renders.route;
    // A different workspace's count moved: same status for this scope.
    r.setInputs({ ...live, badges: new Map([...live.badges, ["quiet", { unread: 5, inflight: 0 }]]) });
    expect(r.renders.route).toBe(before);
    // This workspace's count moved: one re-render, new prefix.
    r.setInputs({ ...live, badges: new Map([...live.badges, ["hushpod", { unread: 4, inflight: 1 }]]) });
    expect(r.prefix()).toBe("[● (4) ]");
  });

  it("is inert outside a shell: no prefix, no throw", () => {
    const { result } = renderHook(() => usePublishTabScope({ kind: "instance" }));
    expect(result.current).toBe("");
  });
});
