import { describe, it, expect } from "vitest";
import { DEFAULT_BRAND } from "./brand";
import {
  CHIP_PALETTE,
  brandChipColor,
  chipForeground,
  deriveChipColor,
  hashString,
  isDefaultAccent,
  isDefaultBrand,
  preferredChipSlot,
  sidebarChipOverride,
} from "./brandChip";
import { contrastRatio, resolveColor, rgbToOklch } from "./color";

const HEX = /^#[0-9a-f]{6}$/;

/** OKLab Euclidean distance between two hexes. */
function deltaE(x: string, y: string): number {
  const lab = (h: string) => {
    const { L, C, H } = rgbToOklch(resolveColor(h, {}));
    const r = (H * Math.PI) / 180;
    return [L, C * Math.cos(r), C * Math.sin(r)];
  };
  const [p, q] = [lab(x), lab(y)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe("hashString / preferredChipSlot", () => {
  it("is deterministic and pinned (an instance's colour must never drift)", () => {
    // FNV-1a reference values: "" is the offset basis, "a" is the published vector.
    expect(hashString("")).toBe(0x811c9dc5);
    expect(hashString("a")).toBe(0xe40c292c);
    expect(preferredChipSlot("House")).toBe(hashString("House") % 12);
    expect(preferredChipSlot("  House ")).toBe(preferredChipSlot("House"));
  });

  it("always lands inside the palette", () => {
    for (let i = 0; i < 500; i++) {
      const slot = preferredChipSlot(`k${i}`);
      expect(Number.isInteger(slot)).toBe(true);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(CHIP_PALETTE.length);
    }
  });

  it("reaches every slot (no dead colours)", () => {
    const seen = new Set(Array.from({ length: 500 }, (_, i) => preferredChipSlot(`k${i}`)));
    expect(seen.size).toBe(CHIP_PALETTE.length);
  });
});

describe("CHIP_PALETTE", () => {
  it("is twelve frozen #rrggbb colours, pinned (reordering recolours every instance)", () => {
    expect(Object.isFrozen(CHIP_PALETTE)).toBe(true);
    expect(CHIP_PALETTE).toEqual([
      "#a51e24", "#964c04", "#8c6f05", "#4e6801", "#00873c", "#026058",
      "#008197", "#1a71c4", "#493cab", "#955bc2", "#962a7e", "#c4486d",
    ]);
    for (const hex of CHIP_PALETTE) expect(hex).toMatch(HEX);
  });

  it("every slot carries white body text at >= 4.5:1", () => {
    const white = { r: 1, g: 1, b: 1, a: 1 };
    for (const hex of CHIP_PALETTE) {
      expect(contrastRatio(white, resolveColor(hex, {})), hex).toBeGreaterThanOrEqual(4.5);
      expect(chipForeground(hex)).toBe("white");
    }
  });

  it("every pair of slots is clearly distinct: OKLab ΔE >= 0.08", () => {
    // ~0.02 is a just-noticeable difference in OKLab for large flat patches;
    // a 16px tab icon is neither large nor viewed side by side, so ask for 4x
    // that. The tuned palette's closest pair (rust/ochre) sits at ~0.091.
    let min = Infinity;
    for (let i = 0; i < CHIP_PALETTE.length; i++)
      for (let j = i + 1; j < CHIP_PALETTE.length; j++) min = Math.min(min, deltaE(CHIP_PALETTE[i], CHIP_PALETTE[j]));
    expect(min).toBeGreaterThanOrEqual(0.08);
  });

  it("no slot can be mistaken for an unbranded instance's terracotta", () => {
    for (const hex of CHIP_PALETTE) expect(deltaE(hex, DEFAULT_BRAND.accent), hex).toBeGreaterThanOrEqual(0.08);
  });
});

describe("deriveChipColor", () => {
  it("is the key's preferred palette slot", () => {
    for (const name of ["House", "Homelab", "Projects", "x", "🦄"]) {
      expect(deriveChipColor(name)).toBe(CHIP_PALETTE[preferredChipSlot(name)]);
    }
  });

  it("is stable for one name", () => {
    expect(deriveChipColor("House")).toBe(deriveChipColor("House"));
  });
});

describe("default detection", () => {
  it("treats the default accent (any case, padded) and an empty one as unset", () => {
    expect(isDefaultAccent(DEFAULT_BRAND.accent)).toBe(true);
    expect(isDefaultAccent(` ${DEFAULT_BRAND.accent.toUpperCase()} `)).toBe(true);
    expect(isDefaultAccent("")).toBe(true);
    expect(isDefaultAccent("#3366cc")).toBe(false);
  });

  it("only the full default trio counts as the default brand", () => {
    expect(isDefaultBrand(DEFAULT_BRAND)).toBe(true);
    expect(isDefaultBrand({ ...DEFAULT_BRAND, name: "House" })).toBe(false);
    expect(isDefaultBrand({ ...DEFAULT_BRAND, logo: "🏠" })).toBe(false);
    expect(isDefaultBrand({ ...DEFAULT_BRAND, accent: "#3366cc" })).toBe(false);
  });
});

describe("brandChipColor / sidebarChipOverride", () => {
  it("all defaults: terracotta, and the sidebar chip is left alone", () => {
    expect(brandChipColor(DEFAULT_BRAND)).toBe(DEFAULT_BRAND.accent);
    expect(sidebarChipOverride(DEFAULT_BRAND)).toBeNull();
  });

  it("renamed on the default accent: the derived colour, on both favicon and sidebar", () => {
    const b = { ...DEFAULT_BRAND, name: "House" };
    expect(brandChipColor(b)).toBe(deriveChipColor("House"));
    expect(sidebarChipOverride(b)).toBe(deriveChipColor("House"));
  });

  it("explicit accent wins; the sidebar keeps reaching it through --accent", () => {
    const b = { name: "House", logo: "🏠", accent: "#3366cc" };
    expect(brandChipColor(b)).toBe("#3366cc");
    expect(sidebarChipOverride(b)).toBeNull();
  });

  it("only the logo changed: still the default terracotta (the name is still Paddock)", () => {
    const b = { ...DEFAULT_BRAND, logo: "🏠" };
    expect(brandChipColor(b)).toBe(DEFAULT_BRAND.accent);
    expect(sidebarChipOverride(b)).toBeNull();
  });

  it("an unparseable accent is treated as unset", () => {
    const b = { name: "House", logo: "H", accent: "tomato-ish" };
    expect(brandChipColor(b)).toBe(deriveChipColor("House"));
  });
});

describe("chipForeground", () => {
  it("white on dark accents, black on a pale one; the floor is 4.5 unless the caller lowers it", () => {
    // Terracotta is ~4.2:1 against white: below body text, above the favicon's 3.
    expect(chipForeground(DEFAULT_BRAND.accent)).toBe("black");
    expect(chipForeground(DEFAULT_BRAND.accent, 3)).toBe("white");
    expect(chipForeground("#1e3a8a")).toBe("white");
    expect(chipForeground("#ffd700")).toBe("black");
    expect(chipForeground("not a colour")).toBe("white");
  });
});
