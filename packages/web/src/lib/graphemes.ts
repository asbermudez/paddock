/**
 * User-perceived characters (grapheme clusters), for cutting text without
 * breaking it. A code point is not a character: 👨‍👩‍👧 is five code points
 * joined by ZWJs, a flag is two regional indicators, 👍🏽 carries a skin-tone
 * modifier and `é` may be `e` + a combining accent. Cutting between any of those
 * leaves a dangling joiner, a lone letter-flag or a stripped modifier.
 *
 * Uses `Intl.Segmenter` (grapheme granularity); where it is unavailable, falls
 * back to code points — never splitting a surrogate pair, at least.
 */

type SegmenterLike = { segment(text: string): Iterable<{ segment: string }> };

let segmenter: SegmenterLike | null | undefined;

function getSegmenter(): SegmenterLike | null {
  if (segmenter === undefined) {
    const Ctor = (Intl as { Segmenter?: new (l?: string, o?: { granularity: "grapheme" }) => SegmenterLike })
      .Segmenter;
    segmenter = Ctor ? new Ctor(undefined, { granularity: "grapheme" }) : null;
  }
  return segmenter;
}

/** Split `text` into grapheme clusters (code points if the runtime can't segment). */
export function graphemes(text: string): string[] {
  const seg = getSegmenter();
  return seg ? Array.from(seg.segment(text), (s) => s.segment) : Array.from(text);
}

/** Test seam: force the code-point fallback (`false`) or restore detection (`true`). */
export function setGraphemeSegmenterForTests(enabled: boolean): void {
  segmenter = enabled ? undefined : null;
}
