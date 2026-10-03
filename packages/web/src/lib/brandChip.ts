/**
 * The brand chip's identity colour (issue #958).
 *
 * The chip — `brand.logo` on a rounded square — is what tells one Paddock
 * instance's browser tabs from another's: the favicon IS the chip, and the
 * sidebar shows a chip next to the wordmark. Its colour is:
 *
 *  1. `brand.accent`, if the operator set one. The favicon uses that hex
 *     exactly; the sidebar chip keeps reaching it through the theme-solved
 *     `--accent`, so the two share a hue but may differ in lightness.
 *  2. otherwise, when the instance has been renamed, a colour DERIVED from
 *     `brand.name` — a stable hash picks a slot in `CHIP_PALETTE` — so two
 *     renamed instances differ with zero config. Here favicon and sidebar chip
 *     are the same colour exactly.
 *  3. otherwise (still called "Paddock", default accent) the default
 *     terracotta, i.e. nothing changes.
 *
 * "Set" vs "left at the default": the server injects only the RESOLVED accent
 * (`window.__PADDOCK_CONFIG__.brand.accent`), so the client cannot tell an
 * accent explicitly set to `#c2603c` from one never set. Both are treated as
 * unset — the same rule the server's own `accentRootStyle` uses.
 *
 * Pure and DOM-free on purpose, so it is unit-testable under jsdom and reusable
 * by anything else that wants a key-derived chip (the sidebar's per-project
 * chips, #958 part 4, build on `CHIP_PALETTE` / `preferredChipSlot`).
 */
import { DEFAULT_BRAND, type Brand } from "./brand";
import { contrastRatio, oklchToRgb, resolveColor, rgbToOklch, toHex, type Rgba } from "./color";

/**
 * The chip palette, as OKLCH `[L, C, H]`: twelve slots, one per ~30° of hue,
 * hand-tuned rather than computed.
 *
 * Why a palette and not a continuous hue: hashing to any of 360 hues clusters
 * — on one real instance four of nine project names landed in a single 45°
 * olive band, and two hues 20° apart are indistinguishable at 16px. Twelve
 * fixed slots trade a higher chance of an exact repeat (which a caller with the
 * whole list can avoid; see `preferredChipSlot`) for a guarantee that any two
 * DIFFERENT slots read as different colours.
 *
 * How the slots were tuned:
 *  - Every slot clears 4.5:1 against white text (the sidebar chip draws a
 *    letter logo at body size); the lightest sit near 4.6:1.
 *  - Lightness alternates (~0.44–0.48 vs ~0.55–0.58) between neighbours,
 *    because sRGB caps chroma hard in the teal/cyan and yellow/olive bands at
 *    this lightness, and hue alone cannot separate them there. The darker
 *    slots (crimson, rust, olive, deep teal, indigo, plum) are what push the
 *    closest pair apart.
 *  - Yellow is not offered as such: at a lightness that carries white text it
 *    is olive or ochre, so the warm half is crimson / rust / ochre / olive.
 *  - Chroma is already inside the sRGB gamut for each slot, so nothing clips.
 *  - The closest pair (rust / ochre) is ~0.091 apart in OKLab — ~4.5x the
 *    ~0.02 just-noticeable difference — and the nearest slot to the default
 *    terracotta is ~0.095 away, so a renamed instance never reads as an
 *    unbranded one.
 *
 * Order is part of the contract: `preferredChipSlot` indexes into it, so
 * reordering or inserting a slot recolours existing instances. Append-only
 * changes would too (the modulus changes); treat the list as frozen.
 */
const CHIP_PALETTE_OKLCH: ReadonlyArray<readonly [number, number, number]> = [
  [0.47, 0.17, 25], //   crimson
  [0.5, 0.122, 55], //   rust
  [0.555, 0.112, 90], // ochre
  [0.48, 0.12, 125], //  olive
  [0.545, 0.15, 150], // green
  [0.44, 0.077, 185], // deep teal
  [0.555, 0.098, 215], // cyan
  [0.545, 0.15, 252], // blue
  [0.44, 0.17, 282], //  indigo
  [0.58, 0.16, 308], //  violet
  [0.48, 0.17, 338], //  plum
  [0.58, 0.16, 5], //    rose
];

/** The chip palette as `#rrggbb`, in slot order. */
export const CHIP_PALETTE: readonly string[] = Object.freeze(
  CHIP_PALETTE_OKLCH.map(([L, C, H]) => toHex(oklchToRgb(L, C, H))),
);

/**
 * Each palette slot in OKLab, measured from the RENDERED `#rrggbb` (so any
 * gamut clipping is accounted for), for distance comparisons between slots.
 */
const CHIP_PALETTE_OKLAB: ReadonlyArray<{ L: number; a: number; b: number }> = CHIP_PALETTE.map((hex) => {
  const { L, C, H } = rgbToOklch(resolveColor(hex, {}));
  const h = (H * Math.PI) / 180;
  return { L, a: C * Math.cos(h), b: C * Math.sin(h) };
});

/**
 * Perceptual distance between two palette slots: Euclidean ΔE in OKLab
 * (ΔEOK, ~0.02 is a just-noticeable difference). Symmetric; 0 for i === j.
 */
export function chipSlotDeltaE(i: number, j: number): number {
  const p = CHIP_PALETTE_OKLAB[i];
  const q = CHIP_PALETTE_OKLAB[j];
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

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

/**
 * The palette slot a key hashes to (trimmed, case-sensitive). "Preferred"
 * because a caller colouring a whole list (project chips) may move a key off
 * its slot to avoid a collision; a single key — this instance's name — just
 * takes it.
 */
export function preferredChipSlot(key: string): number {
  return hashString(key.trim()) % CHIP_PALETTE.length;
}

/** The chip colour for a key, as `#rrggbb`: its preferred palette slot. */
export function deriveChipColor(key: string): string {
  return CHIP_PALETTE[preferredChipSlot(key)];
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
 * Only the derived case overrides — and so only the derived case makes the
 * sidebar chip and the favicon exactly the same colour. An explicit accent
 * reaches the sidebar chip through the `--accent` seam instead (theme-solved:
 * same hue, possibly a different lightness from the favicon's raw hex), and
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
 * always used, `--accent-fg`) as long as it clears `minContrast`, else black,
 * for an operator's pale accent. Emoji ignore it; a plain letter like "H"
 * depends on it.
 *
 * The default floor is 4.5:1 — the sidebar chip draws its letter at text-sm,
 * which is body text. The favicon passes 3: its glyph fills three quarters of
 * the icon, and at 3 the default terracotta (~4.2:1) keeps the white letter the
 * sidebar chip has always shown on it. Every derived colour clears 4.5 either
 * way, so for a renamed instance the two always agree.
 */
export function chipForeground(color: string, minContrast = 4.5): "white" | "black" {
  const bg = parse(color);
  if (!bg) return "white";
  return contrastRatio({ r: 1, g: 1, b: 1, a: 1 }, bg) >= minContrast ? "white" : "black";
}
