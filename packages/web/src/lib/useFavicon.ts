/**
 * Keep the tab's favicon showing this instance's brand chip (issue #958).
 *
 * - All-defaults brand (Paddock / 🐎 / default accent): the shipped PNG links
 *   are left exactly as `index.html` has them — nothing is drawn.
 * - Glyph logo: drawn synchronously at 16 and 32 px.
 * - Image logo: loaded with CORS so the canvas stays readable, then drawn. If
 *   that can't happen the fallbacks degrade in order, and none of them throws
 *   or leaves a broken icon:
 *     1. CORS load fails, or the canvas is tainted → load it WITHOUT CORS; if
 *        that succeeds the image is fine to show, just not to composite, so
 *        the raw URL becomes the icon.
 *     2. The image does not load at all → a chip with the name's initial.
 *     3. No canvas at all → the shipped icons stay for a glyph logo; an image
 *        logo goes straight to (1)'s raw URL.
 *
 * Re-runs whenever name / logo / accent change. Today the brand is frozen at
 * server boot (a Config → Branding edit needs a restart, then a reload), so in
 * practice that is once per page load; the hook does not assume it.
 */
import { useEffect } from "react";
import { logoIsImage, type Brand } from "./brand";
import { brandChipColor, chipForeground, isDefaultBrand } from "./brandChip";
import {
  FAVICON_SIZES,
  loadImage,
  renderFaviconChip,
  restoreFavicon,
  setFavicon,
  type ChipContent,
  type FaviconHrefs,
} from "./favicon";

/** Draw both rasters, or null if either cannot be drawn. */
export function renderFaviconHrefs(content: ChipContent, color: string): FaviconHrefs | null {
  // 3:1 — the glyph fills most of the icon; see chipForeground.
  const foreground = chipForeground(color, 3);
  const large = renderFaviconChip({ content, color, foreground, size: FAVICON_SIZES.large });
  const small = large && renderFaviconChip({ content, color, foreground, size: FAVICON_SIZES.small });
  return large && small ? { large, small, type: "image/png" } : null;
}

/** First character (grapheme-ish: one code point) of the name, upper-cased — the last-resort glyph. */
export function nameInitial(name: string): string {
  return (Array.from(name.trim())[0] ?? "P").toUpperCase();
}

/** Apply a glyph chip, or restore the shipped icons if it cannot be drawn. */
function applyGlyph(glyph: string, color: string): void {
  const hrefs = renderFaviconHrefs({ glyph }, color);
  if (hrefs) setFavicon(hrefs);
  else restoreFavicon();
}

export function useFavicon(brand: Brand): void {
  const { name, logo, accent } = brand;

  useEffect(() => {
    const b = { name, logo, accent };
    if (isDefaultBrand(b)) {
      restoreFavicon();
      return;
    }
    const color = brandChipColor(b);
    const src = logo.trim();
    if (!logoIsImage(src)) {
      applyGlyph(src, color);
      return;
    }

    let cancelled = false;
    const fallbackToInitial = () => {
      if (!cancelled) applyGlyph(nameInitial(name), color);
    };
    const fallbackToRawUrl = () =>
      loadImage(src, false).then(() => {
        if (!cancelled) setFavicon({ small: src, large: src });
      }, fallbackToInitial);

    loadImage(src, true).then((image) => {
      if (cancelled) return;
      const hrefs = renderFaviconHrefs({ image }, color);
      if (hrefs) setFavicon(hrefs);
      else void fallbackToRawUrl(); // tainted (or no canvas): show the image as-is
    }, fallbackToRawUrl);

    return () => {
      cancelled = true;
    };
  }, [name, logo, accent]);

  // Put the shipped icons back when the shell unmounts (and between tests).
  useEffect(() => () => restoreFavicon(), []);
}
