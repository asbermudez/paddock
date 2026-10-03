/**
 * Collision-avoiding colour assignment for the sidebar's project chips (#958).
 *
 * A bare hash into a 12-colour palette collides often — with nine projects the
 * odds that two share a colour are ~98% (the birthday problem) — and two
 * neighbouring rows in the same colour defeat the point of the chip. So the
 * sidebar hands out slots instead:
 *
 *  - projects are visited OLDEST FIRST — by `started` (the creation date, set
 *    once and immutable server-side, `YYYY-MM-DD`), ties broken by slug, which
 *    is also immutable. Day granularity means projects created the same day
 *    order by slug among themselves;
 *  - each takes its `preferredChipSlot(slug)` if free; otherwise the free slot
 *    that is MOST DISTINCT from every slot already taken — the one maximising
 *    the minimum OKLab ΔE to them (`chipSlotDeltaE`). Ties go to the slot
 *    nearest the preferred one (circular index distance), then the lowest
 *    index. "Next free slot" was the first cut, but the palette runs round the
 *    hue wheel, so the neighbour of a taken slot is its nearest-looking colour
 *    — a bumped paddock landed on ochre right beside herdctl's rust;
 *  - once all slots are taken, a project simply takes its preferred slot, and
 *    colours repeat.
 *
 * Why oldest-first: adding a project never moves an existing one. A newer
 * project can only take a slot nobody older wanted, so the colours a user has
 * learned stay put; the only project that "moves" off its hash is the newcomer
 * whose preferred slot was already taken. Deleting a project frees its slot,
 * which a later project that had been bumped may then move into — accepted:
 * deletion is rare and that project returns to the colour it "should" have had.
 *
 * Pure and deterministic: the same set of projects gives the same map in any
 * input order.
 */
import { CHIP_PALETTE, chipSlotDeltaE, preferredChipSlot } from "./brandChip";

export interface ChipSlotInput {
  slug: string;
  /** Creation date (`YYYY-MM-DD`); absent or unparseable sorts as newest. */
  started?: string;
}

function startedKey(started: string | undefined): string {
  // ISO dates compare correctly as strings; anything else sorts last ("~" > digits).
  return started && /^\d{4}-\d{2}-\d{2}/.test(started) ? started : "~";
}

/** Circular distance between two slot indices on a palette of `n`. */
function ringDistance(i: number, j: number, n: number): number {
  const d = Math.abs(i - j) % n;
  return Math.min(d, n - d);
}

/** The free slot most distinct from `taken` (see the top of the file). */
function mostDistinctFreeSlot(taken: ReadonlySet<number>, preferred: number, n: number): number {
  let best = -1;
  let bestScore = -Infinity;
  let bestRing = Infinity;
  for (let slot = 0; slot < n; slot++) {
    if (taken.has(slot)) continue;
    let score = Infinity;
    for (const t of taken) score = Math.min(score, chipSlotDeltaE(slot, t));
    const ring = ringDistance(slot, preferred, n);
    // Ascending index order makes "lowest index" the implicit last tiebreak.
    if (score > bestScore || (score === bestScore && ring < bestRing)) {
      best = slot;
      bestScore = score;
      bestRing = ring;
    }
  }
  return best;
}

export function assignChipSlots(projects: readonly ChipSlotInput[]): Map<string, number> {
  const n = CHIP_PALETTE.length;
  const ordered = [...projects].sort((a, b) => {
    const sa = startedKey(a.started);
    const sb = startedKey(b.started);
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  const taken = new Set<number>();
  const out = new Map<string, number>();
  for (const { slug } of ordered) {
    if (out.has(slug)) continue;
    const preferred = preferredChipSlot(slug);
    const slot =
      !taken.has(preferred) || taken.size >= n ? preferred : mostDistinctFreeSlot(taken, preferred, n);
    taken.add(slot);
    out.set(slug, slot);
  }
  return out;
}

/** `assignChipSlots`, resolved to palette colours. */
export function assignChipColors(projects: readonly ChipSlotInput[]): Map<string, string> {
  const colours = new Map<string, string>();
  for (const [slug, slot] of assignChipSlots(projects)) colours.set(slug, CHIP_PALETTE[slot]);
  return colours;
}
