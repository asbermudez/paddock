import { describe, expect, it } from "vitest";
import { CHIP_PALETTE, preferredChipSlot } from "./brandChip";
import { assignChipColors, assignChipSlots, type ChipSlotInput } from "./projectChips";

const N = CHIP_PALETTE.length;

/** `count` distinct slugs that all hash to the same preferred slot. */
function collidingSlugs(count: number, prefix = "p"): string[] {
  const bySlot = new Map<number, string[]>();
  for (let i = 0; ; i++) {
    const slug = `${prefix}${i}`;
    const slot = preferredChipSlot(slug);
    const list = bySlot.get(slot) ?? [];
    list.push(slug);
    bySlot.set(slot, list);
    if (list.length === count) return list;
  }
}

const values = (m: Map<string, number>) => [...m.values()];

describe("assignChipSlots", () => {
  it("gives every project its preferred slot when nothing collides", () => {
    const seen = new Set<number>();
    const ps: ChipSlotInput[] = [];
    for (let i = 0; ps.length < 5; i++) {
      const slug = `solo${i}`;
      if (seen.has(preferredChipSlot(slug))) continue;
      seen.add(preferredChipSlot(slug));
      ps.push({ slug, started: "2026-01-01" });
    }
    const m = assignChipSlots(ps);
    for (const p of ps) expect(m.get(p.slug)).toBe(preferredChipSlot(p.slug));
  });

  it("resolves a collision: the older project keeps its slot, the newer takes the next free one", () => {
    const [a, b] = collidingSlugs(2);
    const pref = preferredChipSlot(a);
    const m = assignChipSlots([
      { slug: b, started: "2026-02-01" },
      { slug: a, started: "2026-01-01" },
    ]);
    expect(m.get(a)).toBe(pref);
    expect(m.get(b)).toBe((pref + 1) % N);
  });

  it("orders by creation date before slug", () => {
    const [a, b] = collidingSlugs(2).sort(); // slug order would favour a; the date must win
    const m = assignChipSlots([
      { slug: a, started: "2026-05-01" },
      { slug: b, started: "2026-01-01" },
    ]);
    expect(m.get(b)).toBe(preferredChipSlot(b)); // older wins
    expect(m.get(a)).not.toBe(m.get(b));
  });

  it("breaks same-day ties by slug", () => {
    const [x, y] = collidingSlugs(2).sort();
    const m = assignChipSlots([
      { slug: y, started: "2026-01-01" },
      { slug: x, started: "2026-01-01" },
    ]);
    expect(m.get(x)).toBe(preferredChipSlot(x));
    expect(m.get(y)).toBe((preferredChipSlot(x) + 1) % N);
  });

  it("wraps past the end of the palette", () => {
    const old = collidingSlugsForSlot(N - 1);
    const newer = collidingSlugsForSlot(N - 1, old);
    const m = assignChipSlots([
      { slug: old, started: "2020-01-01" },
      { slug: newer, started: "2026-01-01" },
    ]);
    expect(m.get(old)).toBe(N - 1);
    expect(m.get(newer)).toBe(0);
  });

  it("is stable when a NEWER project is added: no existing project changes colour", () => {
    const base: ChipSlotInput[] = ["managers", "edspencer-net", "coderabbit", "herdctl", "paddock", "hushpod"].map(
      (slug, i) => ({ slug, started: `2026-0${i + 1}-01` }),
    );
    const before = assignChipSlots(base);
    // A newcomer that collides with an existing project's slot.
    const collider = collidingSlugsForSlot(before.get("paddock")!);
    const after = assignChipSlots([...base, { slug: collider, started: "2026-09-01" }]);
    for (const p of base) expect(after.get(p.slug)).toBe(before.get(p.slug));
    expect(values(after).filter((s) => s === after.get(collider))).toHaveLength(1);
  });

  it("uses all 12 distinct slots before repeating, then falls back to the preferred slot", () => {
    const slugs = collidingSlugs(N + 3, "c"); // all prefer the same slot — worst case
    const ps = slugs.map((slug, i) => ({ slug, started: `2026-01-${String(i + 1).padStart(2, "0")}` }));
    const m = assignChipSlots(ps);
    const first12 = slugs.slice(0, N).map((s) => m.get(s)!);
    expect(new Set(first12).size).toBe(N);
    for (const s of slugs.slice(N)) expect(m.get(s)).toBe(preferredChipSlot(s));
  });

  it("is deterministic regardless of input order", () => {
    const ps: ChipSlotInput[] = collidingSlugs(5, "d").map((slug, i) => ({ slug, started: `2026-03-0${i + 1}` }));
    const a = assignChipSlots(ps);
    const b = assignChipSlots([...ps].reverse());
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());
  });

  it("deleting a project frees its slot, and a later bumped project may move into it (accepted)", () => {
    // Deletion is the one way an existing project's colour can change: the
    // project that was bumped off its preferred slot returns to it. Rare, and
    // it lands on the colour its hash wanted all along.
    const [a, b, c] = collidingSlugs(3, "x");
    const ps = [
      { slug: a, started: "2026-01-01" },
      { slug: b, started: "2026-02-01" },
      { slug: c, started: "2026-03-01" },
    ];
    const before = assignChipSlots(ps);
    expect(before.get(b)).toBe((preferredChipSlot(a) + 1) % N);
    const after = assignChipSlots(ps.filter((p) => p.slug !== a));
    expect(after.get(b)).toBe(preferredChipSlot(b)); // moved into the freed slot
    expect(after.has(a)).toBe(false);
  });

  it("sorts projects without a usable `started` after dated ones", () => {
    const [a, b] = collidingSlugs(2, "u");
    const m = assignChipSlots([{ slug: a }, { slug: b, started: "2026-01-01" }]);
    expect(m.get(b)).toBe(preferredChipSlot(b));
    expect(m.get(a)).not.toBe(m.get(b));
  });

  it("assignChipColors maps slots onto the palette", () => {
    const m = assignChipColors([{ slug: "paddock", started: "2026-01-01" }]);
    expect(m.get("paddock")).toBe(CHIP_PALETTE[preferredChipSlot("paddock")]);
  });
});

/** A slug whose preferred slot is `slot`. */
function collidingSlugsForSlot(slot: number, not?: string): string {
  for (let i = 0; ; i++) {
    const s = `slot${slot}-${i}`;
    if (preferredChipSlot(s) === slot && s !== not) return s;
  }
}
