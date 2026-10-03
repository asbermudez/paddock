import { describe, it, expect, afterEach, vi } from "vitest";
import { renderFaviconChip, restoreFavicon, setFavicon } from "./favicon";

/** The three icon links index.html ships. */
function installShippedLinks() {
  document.head.innerHTML = `
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`;
}
/** Every link's attributes, order-insensitive (removing and re-adding `type` reorders them). */
const snapshot = () =>
  Array.from(document.head.querySelectorAll("link")).map((l) =>
    Array.from(l.attributes, (a) => `${a.name}=${a.value}`).sort().join(" "),
  );
const hrefOf = (sel: string) => document.head.querySelector(sel)?.getAttribute("href");

afterEach(() => {
  document.head.innerHTML = "";
  vi.restoreAllMocks();
});

describe("setFavicon / restoreFavicon", () => {
  it("points each shipped link at the matching raster, then restores them byte-for-byte", () => {
    installShippedLinks();
    const before = snapshot();
    setFavicon({ small: "data:image/png;small", large: "data:image/png;large", type: "image/png" });

    expect(hrefOf('link[sizes="16x16"]')).toBe("data:image/png;small");
    expect(hrefOf('link[sizes="32x32"]')).toBe("data:image/png;large");
    expect(hrefOf('link[sizes="any"]')).toBe("data:image/png;large");
    expect(document.head.querySelector('link[sizes="any"]')?.getAttribute("type")).toBe("image/png");
    // The home-screen icon is not a tab icon and is never touched.
    expect(hrefOf('link[rel="apple-touch-icon"]')).toBe("/icons/apple-touch-icon.png");

    // A second swap must not overwrite the remembered originals.
    setFavicon({ small: "/logo.png", large: "/logo.png" });
    expect(document.head.querySelector('link[sizes="32x32"]')?.hasAttribute("type")).toBe(false);

    restoreFavicon();
    expect(snapshot()).toEqual(before);
  });

  it("restore is a no-op when nothing was swapped", () => {
    installShippedLinks();
    const before = snapshot();
    restoreFavicon();
    expect(snapshot()).toEqual(before);
  });

  it("creates a link when the page has none, and removes it on restore", () => {
    setFavicon({ small: "s", large: "l", type: "image/png" });
    expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
    expect(hrefOf('link[rel="icon"]')).toBe("l");
    restoreFavicon();
    expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(0);
  });
});

/** A recording 2D context, enough for the drawing code to run against. */
function fakeContext() {
  const calls: string[] = [];
  const ctx = new Proxy(
    { font: "", fillStyle: "", textAlign: "", textBaseline: "" } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        if (prop === "measureText")
          return (t: string) => {
            calls.push(`measure:${t}`);
            const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(target.font))?.[1] ?? 10);
            return {
              width: px,
              actualBoundingBoxLeft: 0,
              actualBoundingBoxRight: px * 0.9,
              actualBoundingBoxAscent: px * 0.8,
              actualBoundingBoxDescent: px * 0.1,
            };
          };
        return (...args: unknown[]) => calls.push(`${prop}:${args.map(String).join(",")}`);
      },
      set(target, prop: string, value) {
        target[prop] = value;
        calls.push(`set:${prop}=${String(value)}`);
        return true;
      },
    },
  );
  return { ctx, calls };
}

describe("renderFaviconChip", () => {
  it("returns null, without throwing, when there is no 2D context (jsdom)", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(renderFaviconChip({ content: { glyph: "H" }, color: "#336699", size: 32 })).toBeNull();
  });

  it("draws the tile, then a glyph scaled so its ink fills ~70% and is centred", () => {
    const { ctx, calls } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAA");

    const url = renderFaviconChip({ content: { glyph: "H" }, color: "#336699", foreground: "white", size: 32 });
    expect(url).toBe("data:image/png;base64,AAA");
    expect(calls).toContain("set:fillStyle=#336699");
    expect(calls).toContain("set:fillStyle=white");
    // Fake ink is 0.9em wide x 0.9em tall: the final font is 22.4/0.9 px.
    const fonts = calls.filter((c) => c.startsWith("set:font="));
    expect(Number(/(\d+(?:\.\d+)?)px/.exec(fonts.at(-1)!)![1])).toBeCloseTo(22.4 / 0.9, 5);
    expect(fonts.at(-1)).toContain("Apple Color Emoji");
    const fill = calls.find((c) => c.startsWith("fillText:"))!;
    const [, x, y] = fill.slice("fillText:".length).split(",").map(Number);
    expect(x).toBeCloseTo((32 - 22.4) / 2, 5);
    expect(y).toBeCloseTo((32 - 22.4) / 2 + (22.4 / 0.9) * 0.8, 5);
  });

  it("returns null when the canvas is tainted (toDataURL throws)", () => {
    const { ctx } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw new DOMException("tainted", "SecurityError");
    });
    const image = { width: 64, height: 32 } as unknown as HTMLImageElement;
    expect(renderFaviconChip({ content: { image }, color: "#336699", size: 32 })).toBeNull();
  });

  it("cover-fits an image inside the clipped tile", () => {
    const { ctx, calls } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,BBB");
    const image = { width: 64, height: 32 } as unknown as HTMLImageElement;
    expect(renderFaviconChip({ content: { image }, color: "#336699", size: 32 })).toBe("data:image/png;base64,BBB");
    expect(calls).toContain("clip:");
    // 64x32 scaled to cover 32x32 => 64x32, offset -16 horizontally.
    expect(calls.find((c) => c.startsWith("drawImage:"))).toMatch(/,-16,0,64,32$/);
  });

  it("rejects a canvas that cannot encode PNG", () => {
    const { ctx } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:,");
    expect(renderFaviconChip({ content: { glyph: "H" }, color: "#336699", size: 16 })).toBeNull();
  });
});
