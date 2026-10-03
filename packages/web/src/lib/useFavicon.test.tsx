import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_BRAND, STATUS_DOT_COLORS, type Brand } from "./brand";
import type { TabDot } from "./tabStatus";
import { nameInitial, useFavicon } from "./useFavicon";

const SHIPPED = `
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />`;
const icon32 = () => document.head.querySelector('link[sizes="32x32"]')!.getAttribute("href");

/** Canvas stub: every chip "encodes" to a data URL naming what was drawn. */
let canvasAvailable = true;
let tainted = false;
let drawn: string[] = [];
let encodes = 0;
function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    if (!canvasAvailable) return null;
    const canvas = this as HTMLCanvasElement & { _dot?: string };
    let arcOpen = false;
    const ctx: Record<string, unknown> = {
      measureText: () => ({ width: 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
      fillText: (t: string) => drawn.push(`text:${t}`),
      drawImage: (img: { src?: string }) => drawn.push(`image:${img.src}`),
      // The status dot is the last `arc` + `fill`; remember its colour on the canvas.
      arc: () => (arcOpen = true),
      fill: () => {
        if (arcOpen) canvas._dot = String(ctx.fillStyle);
        arcOpen = false;
      },
    };
    return new Proxy(ctx, { get: (t, p: string) => (p in t ? t[p] : () => {}) }) as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement) {
    if (tainted) throw new DOMException("tainted", "SecurityError");
    encodes += 1;
    const dot = (this as HTMLCanvasElement & { _dot?: string })._dot;
    return `data:image/png;${this.width};${drawn.at(-1) ?? ""}${dot ? `;dot:${dot}` : ""}`;
  });
}

/** Image stub: `loads` decides, per (src, cors), whether onload or onerror fires. */
let loads: (src: string, cors: boolean) => boolean = () => true;
class FakeImage {
  crossOrigin: string | null = null;
  width = 64;
  height = 64;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    const ok = loads(v, this.crossOrigin === "anonymous");
    queueMicrotask(() => (ok ? this.onload?.() : this.onerror?.()));
  }
}

/** The head as jsdom serialises it after installing SHIPPED (it drops the `/>`). */
let shipped = "";
beforeEach(() => {
  document.head.innerHTML = SHIPPED;
  shipped = document.head.innerHTML;
  canvasAvailable = true;
  tainted = false;
  drawn = [];
  encodes = 0;
  loads = () => true;
  stubCanvas();
  vi.stubGlobal("Image", FakeImage);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
});

const brand = (b: Partial<Brand>): Brand => ({ ...DEFAULT_BRAND, ...b });

describe("useFavicon", () => {
  it("leaves the shipped icons exactly alone for an all-defaults instance", () => {
    renderHook(() => useFavicon(DEFAULT_BRAND));
    expect(document.head.innerHTML).toBe(shipped);
    expect(drawn).toEqual([]);
  });

  it("draws a glyph chip at 32 and 16 for a branded instance, and restores on unmount", () => {
    const { unmount } = renderHook(() => useFavicon(brand({ name: "House", logo: "🏠" })));
    expect(icon32()).toBe("data:image/png;32;text:🏠");
    expect(document.head.querySelector('link[sizes="16x16"]')!.getAttribute("href")).toBe("data:image/png;16;text:🏠");
    unmount();
    expect(document.head.innerHTML).toBe(shipped);
  });

  it("follows a brand change without a reload", () => {
    const { rerender } = renderHook((b: Brand) => useFavicon(b), { initialProps: brand({ name: "House", logo: "H" }) });
    expect(icon32()).toBe("data:image/png;32;text:H");
    rerender(brand({ name: "House", logo: "W" }));
    expect(icon32()).toBe("data:image/png;32;text:W");
    rerender(DEFAULT_BRAND);
    expect(document.head.innerHTML).toBe(shipped);
  });

  it("keeps the shipped icons when there is no canvas", () => {
    canvasAvailable = false;
    renderHook(() => useFavicon(brand({ name: "House" })));
    expect(document.head.innerHTML).toBe(shipped);
  });

  it("composites a CORS-readable image logo", async () => {
    renderHook(() => useFavicon(brand({ name: "House", logo: "https://cdn.example/logo.png" })));
    await waitFor(() => expect(icon32()).toBe("data:image/png;32;image:https://cdn.example/logo.png"));
  });

  it("falls back to the raw image URL when the canvas is tainted", async () => {
    tainted = true;
    renderHook(() => useFavicon(brand({ name: "House", logo: "https://cdn.example/logo.png" })));
    await waitFor(() => expect(icon32()).toBe("https://cdn.example/logo.png"));
    expect(document.head.querySelector('link[sizes="32x32"]')!.hasAttribute("type")).toBe(false);
  });

  it("falls back to the raw image URL when only the CORS load fails", async () => {
    loads = (_src, cors) => !cors;
    renderHook(() => useFavicon(brand({ name: "House", logo: "/brand/logo.svg" })));
    await waitFor(() => expect(icon32()).toBe("/brand/logo.svg"));
  });

  it("falls back to the name's initial when the image does not load at all", async () => {
    loads = () => false;
    renderHook(() => useFavicon(brand({ name: "house", logo: "/missing.png" })));
    await waitFor(() => expect(icon32()).toBe("data:image/png;32;text:H"));
  });

  it("ignores a load that resolves after the brand moved on", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    loads = () => true;
    class SlowImage extends FakeImage {
      set src(v: string) {
        void gate.then(() => this.onload?.());
        Object.defineProperty(this, "_s", { value: v });
      }
      get src() {
        return (this as unknown as { _s: string })._s;
      }
    }
    vi.stubGlobal("Image", SlowImage);
    const { rerender } = renderHook((b: Brand) => useFavicon(b), {
      initialProps: brand({ name: "House", logo: "/slow.png" }),
    });
    rerender(brand({ name: "House", logo: "Z" }));
    expect(icon32()).toBe("data:image/png;32;text:Z");
    release();
    await gate;
    await new Promise((r) => setTimeout(r, 0));
    expect(icon32()).toBe("data:image/png;32;text:Z");
  });
});

describe("nameInitial", () => {
  it("upper-cases the first code point, emoji-safe", () => {
    expect(nameInitial(" house")).toBe("H");
    expect(nameInitial("🦄 lab")).toBe("🦄");
    expect(nameInitial("")).toBe("P");
  });
});

describe("useFavicon — live status dot (#958 part 3)", () => {
  const ORANGE = STATUS_DOT_COLORS.running;
  const GREEN = STATUS_DOT_COLORS.unread;
  type P = { b: Brand; dot: TabDot | null };
  const house = brand({ name: "House", logo: "🏠" });

  it("puts an orange dot on the chip while running, green for unread, and clears it when idle", () => {
    const { rerender } = renderHook(({ b, dot }: P) => useFavicon(b, dot), { initialProps: { b: house, dot: "running" } });
    expect(icon32()).toBe(`data:image/png;32;text:🏠;dot:${ORANGE}`);
    expect(document.head.querySelector('link[sizes="16x16"]')!.getAttribute("href")).toBe(`data:image/png;16;text:🏠;dot:${ORANGE}`);
    rerender({ b: house, dot: "unread" });
    expect(icon32()).toBe(`data:image/png;32;text:🏠;dot:${GREEN}`);
    rerender({ b: house, dot: null });
    // Back to the plain brand chip — not the shipped icon, which this brand never had.
    expect(icon32()).toBe("data:image/png;32;text:🏠");
  });

  it("never redraws the canvas for a status it has already drawn", () => {
    const { rerender } = renderHook(({ b, dot }: P) => useFavicon(b, dot), { initialProps: { b: house, dot: null } });
    rerender({ b: house, dot: "running" });
    const afterFirstRun = encodes;
    // Same dot again (a count changed, say): no effect re-run, no draw.
    rerender({ b: house, dot: "running" });
    expect(encodes).toBe(afterFirstRun);
    // Flip away and back: both are memoised, still no draw.
    rerender({ b: house, dot: null });
    rerender({ b: house, dot: "running" });
    expect(encodes).toBe(afterFirstRun);
    expect(icon32()).toBe(`data:image/png;32;text:🏠;dot:${ORANGE}`);
  });

  it("draws an all-defaults instance's dot on the SHIPPED icon, and restores it exactly when idle", async () => {
    const { rerender } = renderHook(({ b, dot }: P) => useFavicon(b, dot), {
      initialProps: { b: DEFAULT_BRAND, dot: null },
    });
    expect(document.head.innerHTML).toBe(shipped);
    rerender({ b: DEFAULT_BRAND, dot: "unread" });
    await waitFor(() => expect(icon32()).toBe(`data:image/png;32;image:/icons/favicon-32.png;dot:${GREEN}`));
    rerender({ b: DEFAULT_BRAND, dot: null });
    expect(document.head.innerHTML).toBe(shipped);
  });

  it("retries a failed shipped-icon load on the next status change instead of caching the failure", async () => {
    let shippedOk = false;
    loads = (src) => (src === "/icons/favicon-32.png" ? shippedOk : true);
    const { rerender } = renderHook(({ b, dot }: P) => useFavicon(b, dot), {
      initialProps: { b: DEFAULT_BRAND, dot: "running" },
    });
    await new Promise((r) => setTimeout(r, 0));
    // Failed: the shipped icons stay (the title still carries the status).
    expect(document.head.innerHTML).toBe(shipped);
    shippedOk = true;
    rerender({ b: DEFAULT_BRAND, dot: "unread" });
    await waitFor(() => expect(icon32()).toBe(`data:image/png;32;image:/icons/favicon-32.png;dot:${GREEN}`));
    // …and the status that failed before draws now too.
    rerender({ b: DEFAULT_BRAND, dot: "running" });
    await waitFor(() => expect(icon32()).toBe(`data:image/png;32;image:/icons/favicon-32.png;dot:${ORANGE}`));
  });

  it("leaves the shipped icons alone, without throwing, when there is no canvas", async () => {
    canvasAvailable = false;
    renderHook(() => useFavicon(DEFAULT_BRAND, "running"));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.head.innerHTML).toBe(shipped);
  });

  it("keeps a raw-URL image logo as the icon while a status shows — no dot, no identity swap", async () => {
    loads = (_src, cors) => !cors; // shows, but can't be composited
    const b = brand({ name: "house", logo: "/brand/logo.svg" });
    const { rerender } = renderHook(({ b, dot }: P) => useFavicon(b, dot), { initialProps: { b, dot: null } });
    await waitFor(() => expect(icon32()).toBe("/brand/logo.svg"));
    const before = encodes;
    rerender({ b, dot: "running" });
    expect(icon32()).toBe("/brand/logo.svg");
    rerender({ b, dot: "unread" });
    expect(icon32()).toBe("/brand/logo.svg");
    // Nothing was drawn for the status: no initial-letter chip, no dot.
    expect(encodes).toBe(before);
    expect(drawn.some((d) => d === "text:H")).toBe(false);
  });

  it("composites the dot onto a CORS-readable image logo", async () => {
    renderHook(() => useFavicon(brand({ name: "House", logo: "https://cdn.example/logo.png" }), "unread"));
    await waitFor(() =>
      expect(icon32()).toBe(`data:image/png;32;image:https://cdn.example/logo.png;dot:${GREEN}`),
    );
  });
});
