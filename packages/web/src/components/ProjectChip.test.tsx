import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectChip, projectInitial } from "./ProjectChip";
import { chipForeground, deriveChipColor } from "../lib/brandChip";

describe("projectInitial", () => {
  it.each([
    ["hushpod", "H"],
    ["Beacon", "B"],
    ["  spaced out", "S"],
    ["_scratch", "S"],
    [".dotfiles", "D"],
    ['"quoted"', "Q"],
    ["42-things", "4"],
    ["élan", "É"],
    ["ßeta", "ß"], // "SS" would be two glyphs on a 16px chip
    ["日本語", "日"],
    ["🐎 horses", "🐎"],
    ["👩‍💻 dev", "👩‍💻"], // ZWJ sequence stays whole
    ["🇬🇧 uk", "🇬🇧"], // flag: two regional indicators, one grapheme
    ["---", "-"],
    ["", "?"],
    ["   ", "?"],
  ])("%j → %j", (name, want) => {
    expect(projectInitial(name)).toBe(want);
  });
});

describe("ProjectChip", () => {
  it("shows the initial on the slug-derived colour, decoratively", () => {
    render(<ProjectChip slug="hushpod" name="Hush Pod" />);
    const chip = screen.getByTestId("project-chip");
    expect(chip).toHaveTextContent("H");
    expect(chip).toHaveAttribute("aria-hidden", "true");
    const bg = deriveChipColor("hushpod");
    // jsdom normalises the inline style to rgb(); compare via a probe element.
    const probe = document.createElement("span");
    probe.style.backgroundColor = bg;
    probe.style.color = chipForeground(bg);
    expect(chip.style.backgroundColor).toBe(probe.style.backgroundColor);
    expect(chip.style.color).toBe(probe.style.color);
  });

  it("keeps its colour across a rename (hashes the slug, not the name)", () => {
    const { rerender } = render(<ProjectChip slug="hushpod" name="Hush Pod" />);
    const before = screen.getByTestId("project-chip").style.backgroundColor;
    rerender(<ProjectChip slug="hushpod" name="Podcast ad remover" />);
    const chip = screen.getByTestId("project-chip");
    expect(chip.style.backgroundColor).toBe(before);
    expect(chip).toHaveTextContent("P");
  });

  it("is deterministic, and different slugs generally differ", () => {
    expect(deriveChipColor("beacon")).toBe(deriveChipColor("beacon"));
    const colours = new Set(["beacon", "hushpod", "herdctl", "paddock", "eightsleep"].map(deriveChipColor));
    expect(colours.size).toBeGreaterThan(1);
  });
});
