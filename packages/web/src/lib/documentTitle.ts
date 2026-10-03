import { useEffect } from "react";
import { getBrand } from "./brand";

/**
 * Per-route document titles (#958).
 *
 * A tab's title reads most-specific first, brand last:
 *
 *   `Fix the leaking tap · hushpod — House`
 *
 * — the route's `parts` joined with ` · `, then ` — ` and the brand name. A
 * route with no parts of its own is just the brand. The brand suffix is owned
 * HERE, not by `AppShell`: a parent's effects run after its children's, so a
 * shell-level `document.title = brand` would clobber every page's title.
 *
 * `prefix` is a hook for the live-status work later in #958 (`● `, `✓ `,
 * `(2) `); it is prepended verbatim, so the caller owns its trailing space.
 *
 * The server-side `<title>` stays the bare brand on purpose, so chat names never
 * reach a fetcher that doesn't run JS.
 */

/** Longest a single title part may be before it is cut with `…`. */
export const TITLE_PART_MAX = 60;

/** Separator between parts, and between the parts and the brand. */
export const TITLE_PART_SEP = " · ";
export const TITLE_BRAND_SEP = " — ";

/** A part as a caller may supply it — empties are skipped, not rendered. */
export type TitlePart = string | null | undefined | false;

/**
 * Normalise one part: collapse whitespace (a chat name can carry newlines) and
 * cut to {@link TITLE_PART_MAX} characters including the `…`. Counted in code
 * points so an emoji is never split into a lone surrogate. Returns "" for an
 * empty or whitespace-only part.
 */
export function cleanTitlePart(part: TitlePart, max = TITLE_PART_MAX): string {
  if (!part) return "";
  const text = part.replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

export interface DocumentTitleInput {
  /** Most specific first. Empty / whitespace / nullish parts are dropped. */
  parts: readonly TitlePart[];
  /** The instance's brand name — always last. */
  brand: string;
  /** Prepended verbatim (status markers, #958 §3). */
  prefix?: string;
}

/**
 * Build a title. Pure, so the status prefix work can reuse it.
 *
 * Parts are rendered as given — no de-duplication. A chat named like its
 * project (`hushpod · hushpod`) must not collapse into the project's Home title,
 * and a part equal to the brand must stay so a project named like the instance
 * is distinguishable from the root. Which parts to include is the caller's call.
 */
export function formatDocumentTitle({ parts, brand, prefix = "" }: DocumentTitleInput): string {
  const brandName = cleanTitlePart(brand) || "Paddock";
  const kept = parts.map((p) => cleanTitlePart(p)).filter(Boolean);
  const body = kept.length ? `${kept.join(TITLE_PART_SEP)}${TITLE_BRAND_SEP}${brandName}` : brandName;
  return `${prefix}${body}`;
}

/**
 * Set `document.title` for the mounted route. On unmount the title falls back to
 * the bare brand, so a route that sets no title of its own (a redirect, the error
 * screen) never inherits the previous page's chat name.
 */
export function useDocumentTitle(
  parts: readonly TitlePart[],
  options: { prefix?: string } = {},
): void {
  const brand = getBrand().name;
  const title = formatDocumentTitle({ parts, brand, prefix: options.prefix });
  useEffect(() => {
    document.title = title;
  }, [title]);
  useEffect(
    () => () => {
      document.title = formatDocumentTitle({ parts: [], brand: getBrand().name });
    },
    [],
  );
}
