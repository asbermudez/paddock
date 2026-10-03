import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_BRAND, type Brand } from "./brand";
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
function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    if (!canvasAvailable) return null;
    const ctx: Record<string, unknown> = {
      measureText: () => ({ width: 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
      fillText: (t: string) => drawn.push(`text:${t}`),
      drawImage: (img: { src?: string }) => drawn.push(`image:${img.src}`),
    };
    return new Proxy(ctx, { get: (t, p: string) => (p in t ? t[p] : () => {}) }) as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement) {
    if (tainted) throw new DOMException("tainted", "SecurityError");
    return `data:image/png;${this.width};${drawn.at(-1) ?? ""}`;
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
