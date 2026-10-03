import { describe, it, expect } from "vitest";
import { DEFAULT_BRAND } from "./brand";
import {
  DERIVED_CHIP_L,
  brandChipColor,
  chipForeground,
  deriveChipColor,
  hashString,
  isDefaultAccent,
  isDefaultBrand,
  nameHue,
  sidebarChipOverride,
} from "./brandChip";
import { resolveColor, rgbToOklch } from "./color";

const HEX = /^#[0-9a-f]{6}$/;

describe("hashString / nameHue", () => {
  it("is deterministic and pinned (an instance's colour must never drift)", () => {
    // FNV-1a reference values: "" is the offset basis, "a" is the published vector.
    expect(hashString("")).toBe(0x811c9dc5);
    expect(hashString("a")).toBe(0xe40c292c);
    expect(nameHue("House")).toBe(nameHue("House"));
    expect(nameHue("  House ")).toBe(nameHue("House"));
  });

  it("spreads ordinary instance names across the wheel", () => {
    const hues = ["House", "Homelab", "Projects", "Work", "Lab", "Media"].map(nameHue);
    expect(new Set(hues).size).toBe(hues.length);
    for (const h of hues) expect(h).toBeGreaterThanOrEqual(0), expect(h).toBeLessThan(360);
  });
});

describe("deriveChipColor", () => {
  it("returns an in-gamut hex at the fixed lightness, with the name's hue", () => {
    for (const name of ["House", "Homelab", "Projects", "Work", "Lab", "Media", "x", "🦄"]) {
      const hex = deriveChipColor(name);
      expect(hex).toMatch(HEX);
      const { L, H } = rgbToOklch(resolveColor(hex, {}));
      expect(L).toBeCloseTo(DERIVED_CHIP_L, 1);
      const dh = Math.abs(((H - nameHue(name) + 540) % 360) - 180);
      expect(dh).toBeLessThan(4);
    }
  });

  it("differs between names and is stable for one", () => {
    expect(deriveChipColor("House")).toBe(deriveChipColor("House"));
    expect(deriveChipColor("House")).not.toBe(deriveChipColor("Homelab"));
  });

  it("keeps a white glyph legible (>= 3:1) for every hue", () => {
    for (let i = 0; i < 200; i++) expect(chipForeground(deriveChipColor(`instance-${i}`))).toBe("white");
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
  it("white on the default and on dark accents, black on a pale one", () => {
    expect(chipForeground(DEFAULT_BRAND.accent)).toBe("white");
    expect(chipForeground("#1e3a8a")).toBe("white");
    expect(chipForeground("#ffd700")).toBe("black");
    expect(chipForeground("not a colour")).toBe("white");
  });
});
