/**
 * The branded favicon (issue #958): the brand chip drawn on a canvas and set as
 * the tab icon, so one instance's tabs can be told from another's.
 *
 * Two halves, kept apart so each is testable on its own:
 *
 *  - `renderFaviconChip` — pure drawing: content (a glyph or a loaded image) on
 *    a rounded square of one colour, returned as a PNG data URL. Returns null
 *    rather than throwing when there is no 2D context (jsdom, a locked-down
 *    browser) or the canvas is tainted by a cross-origin image.
 *  - `setFavicon` / `restoreFavicon` — swap the hrefs of the `<link rel="icon">`
 *    tags `index.html` ships, remembering the originals so they can be put
 *    back. The shipped tags stay the pre-JS default and the all-defaults look.
 *
 * The live status dot (#958 part 3) is one more pass over the same canvas after
 * `drawContent`: a hole punched through the chip (the "cut-out ring", so the dot
 * reads on any chip colour, including one the same hue as the dot) and the dot
 * drawn inside it.
 */

/**
 * What goes on the chip: a glyph/emoji string, an already-loaded image (cover-
 * fitted onto the tile), or a finished `icon` — the shipped favicon PNG — drawn
 * as-is with NO tile, so an all-defaults instance's status icon is its own icon
 * plus a dot rather than a chip it never had.
 */
export type ChipImage = CanvasImageSource & { width: number; height: number; naturalWidth?: number; naturalHeight?: number };
export type ChipContent = { glyph: string } | { image: ChipImage } | { icon: ChipImage };

export interface FaviconChipOptions {
  content: ChipContent;
  /** Tile colour, any CSS colour a canvas accepts. */
  color: string;
  /** Colour for a text glyph (emoji ignore it). */
  foreground?: string;
  /** Square edge in device pixels. */
  size: number;
  /** Status dot colour (#958 part 3); omitted = no dot. */
  dot?: string;
  /** Document to create the canvas in (tests). */
  doc?: Document;
}

/**
 * The two raster sizes set on the tab. Chrome picks the `sizes` entry nearest
 * the tab's device-pixel size — 16 on a 1x screen, 32 on a 2x one — and a glyph
 * drawn natively at 16 is crisper than a 32 or 64 downsampled to it.
 */
export const FAVICON_SIZES = { small: 16, large: 32 } as const;

/** Corner radius as a fraction of the edge — matches the shipped icon's squircle-ish corners. */
const RADIUS = 0.22;
/** Share of the tile a glyph's ink box may fill. Chrome reports an emoji's box a little larger than its ink, so 0.76 lands an emoji near the shipped icon's ~70% and a letter just over it. */
const GLYPH_FILL = 0.76;
/** Emoji first, so a pictograph renders in colour wherever the OS has a colour font. */
const FONT_STACK = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, -apple-system, "Segoe UI", sans-serif`;

function roundedRect(ctx: CanvasRenderingContext2D, size: number): void {
  const r = size * RADIUS;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
}

function drawTile(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  roundedRect(ctx, size);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Ink box of `text` at the current font, from the actualBoundingBox metrics. */
function inkBox(ctx: CanvasRenderingContext2D, text: string) {
  const m = ctx.measureText(text);
  const left = m.actualBoundingBoxLeft ?? 0;
  const right = m.actualBoundingBoxRight ?? m.width;
  const ascent = m.actualBoundingBoxAscent ?? 0;
  const descent = m.actualBoundingBoxDescent ?? 0;
  return { left, ascent, w: left + right, h: ascent + descent };
}

function drawGlyph(ctx: CanvasRenderingContext2D, size: number, glyph: string, fg: string): void {
  const target = size * GLYPH_FILL;
  // Measure at a nominal size, then scale so the INK (not the em box, which
  // carries line-gap and side bearings) fills the target — then re-measure,
  // because hinting makes metrics only roughly linear at favicon sizes.
  let px = target;
  ctx.font = `600 ${px}px ${FONT_STACK}`;
  let box = inkBox(ctx, glyph);
  const longest = Math.max(box.w, box.h);
  if (longest > 0) {
    px = (px * target) / longest;
    ctx.font = `600 ${px}px ${FONT_STACK}`;
    box = inkBox(ctx, glyph);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(glyph, (size - box.w) / 2 + box.left, (size - box.h) / 2 + box.ascent);
}

/** Cover-fit the image into the tile, clipped to its rounded corners — the sidebar's `object-cover`. */
function drawImage(ctx: CanvasRenderingContext2D, size: number, img: ChipImage): void {
  const iw = img.naturalWidth || img.width || size;
  const ih = img.naturalHeight || img.height || size;
  const scale = Math.max(size / iw, size / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.save();
  roundedRect(ctx, size);
  ctx.clip();
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  ctx.restore();
}

function drawContent(ctx: CanvasRenderingContext2D, opts: FaviconChipOptions): void {
  const { content, size } = opts;
  if ("glyph" in content) drawGlyph(ctx, size, content.glyph, opts.foreground ?? "white");
  else if ("image" in content) drawImage(ctx, size, content.image);
  else ctx.drawImage(content.icon, 0, 0, size, size);
}

/**
 * Dot radius and the ring cut around it, as fractions of the edge: ~3.5px with
 * a ~1px ring at 16px. Small enough to leave the logo readable, big enough to
 * read at a glance on light and dark tab strips (checked on both).
 */
const DOT_R = 0.22;
const DOT_RING = 0.07;

/**
 * The status dot, bottom-right. The ring is a HOLE (`destination-out`), not a
 * stroke in some background colour: the tab strip behind it is the browser's,
 * light or dark, and only transparency matches both.
 */
function drawDot(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const r = size * DOT_R;
  const c = size - r;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(c, c, r + size * DOT_RING, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Draw the chip and return it as a PNG data URL, or null when it cannot be
 * drawn (no canvas 2D context) or read back (a tainted canvas). Never throws.
 */
export function renderFaviconChip(opts: FaviconChipOptions): string | null {
  try {
    const doc = opts.doc ?? document;
    const canvas = doc.createElement("canvas");
    canvas.width = opts.size;
    canvas.height = opts.size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (!("icon" in opts.content)) drawTile(ctx, opts.size, opts.color);
    drawContent(ctx, opts);
    if (opts.dot) drawDot(ctx, opts.size, opts.dot);
    const url = canvas.toDataURL("image/png");
    // A canvas that cannot encode (some stubs) answers "data:," — not an icon.
    return url.startsWith("data:image/png") ? url : null;
  } catch {
    // SecurityError from a tainted canvas, or anything else a browser refuses.
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* <link rel="icon"> swapping                                                  */
/* -------------------------------------------------------------------------- */

/** What to put on the tab. `type` omitted = leave the attribute off (a raw image URL). */
export interface FaviconHrefs {
  small: string;
  large: string;
  type?: string;
}

const ORIG_HREF = "data-paddock-default-href";
const ORIG_TYPE = "data-paddock-default-type";
const CREATED = "data-paddock-favicon";

function iconLinks(doc: Document): HTMLLinkElement[] {
  return Array.from(doc.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
}

/**
 * Point every `<link rel="icon">` at the branded chip. The 16×16 link gets the
 * small raster; every other one (the 32×32 and the `sizes="any"` .ico) the
 * large. Originals are stashed on the element the first time it is touched so
 * `restoreFavicon` can put them back exactly. With no icon links at all (dev
 * without index.html, tests), one is created.
 */
export function setFavicon(hrefs: FaviconHrefs, doc: Document = document): void {
  let links = iconLinks(doc);
  if (links.length === 0) {
    const link = doc.createElement("link");
    link.rel = "icon";
    link.setAttribute(CREATED, "");
    doc.head.appendChild(link);
    links = [link];
  }
  for (const link of links) {
    if (!link.hasAttribute(ORIG_HREF) && !link.hasAttribute(CREATED)) {
      link.setAttribute(ORIG_HREF, link.getAttribute("href") ?? "");
      link.setAttribute(ORIG_TYPE, link.getAttribute("type") ?? "");
    }
    const href = link.getAttribute("sizes") === "16x16" ? hrefs.small : hrefs.large;
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    if (hrefs.type) link.setAttribute("type", hrefs.type);
    else link.removeAttribute("type");
  }
}

/** Put the shipped icons back (a no-op if nothing was ever swapped). */
export function restoreFavicon(doc: Document = document): void {
  for (const link of iconLinks(doc)) {
    if (link.hasAttribute(CREATED)) {
      link.remove();
      continue;
    }
    if (!link.hasAttribute(ORIG_HREF)) continue;
    link.setAttribute("href", link.getAttribute(ORIG_HREF) ?? "");
    const type = link.getAttribute(ORIG_TYPE);
    if (type) link.setAttribute("type", type);
    else link.removeAttribute("type");
    link.removeAttribute(ORIG_HREF);
    link.removeAttribute(ORIG_TYPE);
  }
}

/**
 * The shipped 32px icon's URL — the base an all-defaults instance draws its
 * status dot on. Read from the DOM (its stashed original if it has been swapped)
 * rather than hard-coded, so it follows whatever `index.html` ships.
 */
export function shippedIconHref(doc: Document = document): string | null {
  const link =
    doc.head.querySelector<HTMLLinkElement>('link[rel~="icon"][sizes="32x32"]') ??
    doc.head.querySelector<HTMLLinkElement>('link[rel~="icon"][type="image/png"]');
  if (!link || link.hasAttribute(CREATED)) return null;
  return link.getAttribute(ORIG_HREF) ?? link.getAttribute("href");
}

/** Load an image, optionally CORS-enabled (needed for the canvas to stay readable). */
export function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`favicon: could not load ${src}`));
    img.src = src;
  });
}
