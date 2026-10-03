/**
 * A project's chip in the sidebar (issue #958, part 4): the project's initial
 * on a colour derived from it, replacing the generic folder icon so a row is
 * recognisable at a glance — and so it matches the per-instance favicon, which
 * uses the very same derivation (`deriveChipColor`) for `brand.name`.
 *
 * The colour hashes the project's SLUG, not its display name. The name is
 * editable in Settings, and a colour a user has learned should not change
 * under them because a typo got fixed; the slug is fixed at creation. (The
 * favicon hashes `brand.name` only because an instance has no other stable
 * identifier.) The initial, on the other hand, comes from the display name —
 * it is what the user reads next to it.
 *
 * The sidebar passes `color` from `assignChipColors` (lib/projectChips.ts), which
 * keeps neighbouring projects off the same palette slot; without it the chip
 * falls back to the bare hash, `deriveChipColor(slug)`.
 *
 * Purely decorative: `aria-hidden`, so the row's accessible name is still just
 * the project name.
 */
import { chipForeground, deriveChipColor } from "../lib/brandChip";
import { graphemes } from "../lib/graphemes";

/**
 * The chip's glyph: the first letter, digit or emoji of `name`, uppercased.
 * Leading whitespace and punctuation (`_scratch`, `.dotfiles`, `"quoted"`) are
 * skipped so the chip shows something meaningful; a name made only of
 * punctuation falls back to its first character, and an empty one to "?".
 *
 * Graphemes with nothing visible in them — whitespace, format characters
 * (U+200B, U+FEFF, U+200D, bidi marks: `\p{Cf}`), controls, a lone combining
 * mark — are dropped first; `trim()` alone misses most of them and would leave
 * a blank chip. A name with nothing visible left gets "?".
 */
const VISIBLE = /[^\p{Cf}\p{Cc}\p{M}\p{Z}\p{White_Space}]/u;

export function projectInitial(name: string): string {
  const gs = graphemes(name.normalize("NFC")).filter((g) => VISIBLE.test(g));
  if (gs.length === 0) return "?";
  const meaningful = gs.find((g) => /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(g)) ?? gs[0];
  // Uppercase, unless that would widen it ("ß" → "SS") past the chip.
  const upper = meaningful.toLocaleUpperCase();
  return graphemes(upper).length === 1 ? upper : meaningful;
}

export function ProjectChip({
  slug,
  name,
  color,
  className = "",
}: {
  slug: string;
  name: string;
  /** The assigned chip colour; defaults to the slug's hashed palette colour. */
  color?: string;
  className?: string;
}) {
  const bg = color ?? deriveChipColor(slug);
  return (
    <span
      aria-hidden="true"
      data-testid="project-chip"
      // `rounded-sm` reads the theme's `--radius-sm`, so the chip squares off
      // under Terminal and Sci-Fi like everything else there. The colour is a
      // computed value, not a token — the same exception the brand chip takes.
      className={`flex h-4 w-4 shrink-0 select-none items-center justify-center overflow-hidden rounded-sm text-3xs font-semibold leading-none ${className}`}
      style={{ backgroundColor: bg, color: chipForeground(bg) }}
    >
      {projectInitial(name)}
    </span>
  );
}
