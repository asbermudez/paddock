/**
 * The brand chip's identity colour (issue #958).
 *
 * The chip — `brand.logo` on a rounded square — is what tells one Paddock
 * instance's browser tabs from another's: the favicon IS the chip, and the
 * sidebar shows the same chip next to the wordmark. Its colour is:
 *
 *  1. `brand.accent`, if the operator set one;
 *  2. otherwise, when the instance has been renamed, a colour DERIVED from
 *     `brand.name` — a stable hash picks the hue — so two renamed instances
 *     differ with zero config;
 *  3. otherwise (still called "Paddock", default accent) the default
 *     terracotta, i.e. nothing changes.
 *
 * "Set" vs "left at the default": the server injects only the RESOLVED accent
 * (`window.__PADDOCK_CONFIG__.brand.accent`), so the client cannot tell an
 * accent explicitly set to `#c2603c` from one never set. Both are treated as
 * unset — the same rule the server's own `accentRootStyle` uses.
 *
 * Pure and DOM-free on purpose, so it is unit-testable under jsdom and reusable
 * by anything else that wants a name-derived chip (the sidebar's per-project
 * chips, #958 part 4, call `deriveChipColor` directly).
 */
import { DEFAULT_BRAND, type Brand } from "./brand";
import { contrastRatio, inSrgbGamut, oklchToRgb, resolveColor, toHex, type Rgba } from "./color";

/**
 * Lightness and chroma of a derived chip. Fixed, so only the hue varies with
 * the name: mid lightness reads as a solid tile on both Chrome's light (~0.9 L)
 * and dark (~0.25 L) tab strips, and keeps a white glyph legible on top.
 */
export const DERIVED_CHIP_L = 0.56;
export const DERIVED_CHIP_C = 0.14;

/**
 * 32-bit FNV-1a over the UTF-16 code units of `s`. Stable across browsers and
 * releases, which is the whole requirement: an instance's colour must never
 * change under a user who has learned it.
 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The hue (0–359) a name hashes to. Trimmed, case-sensitive. */
export function nameHue(name: string): number {
  return hashString(name.trim()) % 360;
}

/**
 * A chip colour derived from a name, as `#rrggbb`. Fixed OKLCH lightness and
 * chroma, hue from the hash; chroma is pulled in only as far as needed to stay
 * inside sRGB, so no hue lands on a clipped, off-hue tile.
 */
export function deriveChipColor(name: string): string {
  const H = nameHue(name);
  let C = DERIVED_CHIP_C;
  while (C > 0 && !inSrgbGamut(DERIVED_CHIP_L, C, H)) C -= 0.005;
  return toHex(oklchToRgb(DERIVED_CHIP_L, Math.max(C, 0), H));
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether the accent is the default (or unset — the client cannot tell; see top). */
export function isDefaultAccent(accent: string | undefined | null): boolean {
  return !accent || same(accent, DEFAULT_BRAND.accent);
}

/** All three brand fields at their defaults: the shipped favicon and chip stay exactly as they are. */
export function isDefaultBrand(brand: Brand): boolean {
  return (
    same(brand.name, DEFAULT_BRAND.name) &&
    brand.logo.trim() === DEFAULT_BRAND.logo &&
    isDefaultAccent(brand.accent)
  );
}

/** Parse a CSS colour, or null if it is not one `color.ts` understands. */
function parse(color: string): Rgba | null {
  try {
    return resolveColor(color, {});
  } catch {
    return null;
  }
}

/**
 * The chip colour for this brand, as a CSS colour string — the favicon's tile.
 * See the top of the file for the three cases. An accent that is not a
 * parseable colour is treated as unset.
 */
export function brandChipColor(brand: Brand): string {
  if (!isDefaultAccent(brand.accent) && parse(brand.accent)) return brand.accent.trim();
  if (same(brand.name, DEFAULT_BRAND.name)) return DEFAULT_BRAND.accent;
  return deriveChipColor(brand.name);
}

/**
 * The colour the SIDEBAR chip should override its accent background with, or
 * null to leave it on the theme's `--accent` (today's look).
 *
 * Only the derived case overrides. An explicit accent already reaches the
 * sidebar chip through the `--accent` seam (theme-solved to the same hue), and
 * the default case must not change at all. The global `--accent` — buttons,
 * links — is never touched: the derived colour is the instance's identity, not
 * its UI accent.
 */
export function sidebarChipOverride(brand: Brand): string | null {
  if (!isDefaultAccent(brand.accent) && parse(brand.accent)) return null;
  if (same(brand.name, DEFAULT_BRAND.name)) return null;
  return deriveChipColor(brand.name);
}

/**
 * Foreground for a text glyph on a chip of `color`: white (what the chip has
 * always used, `--accent-fg`) as long as it clears the 3:1 large-text floor —
 * the glyph is bold and fills most of the tile — else black, for an operator's
 * pale accent. Emoji ignore it; a plain letter like "H" depends on it.
 */
export function chipForeground(color: string): "white" | "black" {
  const bg = parse(color);
  if (!bg) return "white";
  return contrastRatio({ r: 1, g: 1, b: 1, a: 1 }, bg) >= 3 ? "white" : "black";
}
