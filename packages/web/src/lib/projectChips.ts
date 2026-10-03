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
 *  - each takes its `preferredChipSlot(slug)` if free, else the next free slot
 *    after it (wrapping);
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
import { CHIP_PALETTE, preferredChipSlot } from "./brandChip";

export interface ChipSlotInput {
  slug: string;
  /** Creation date (`YYYY-MM-DD`); absent or unparseable sorts as newest. */
  started?: string;
}

function startedKey(started: string | undefined): string {
  // ISO dates compare correctly as strings; anything else sorts last ("~" > digits).
  return started && /^\d{4}-\d{2}-\d{2}/.test(started) ? started : "~";
}

export function assignChipSlots(
  projects: readonly ChipSlotInput[],
  size: number = CHIP_PALETTE.length,
): Map<string, number> {
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
    const preferred = preferredChipSlot(slug) % size;
    let slot = preferred;
    if (taken.size < size) {
      while (taken.has(slot)) slot = (slot + 1) % size;
    }
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
