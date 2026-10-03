import { describe, it, expect, afterEach } from "vitest";
import { graphemes, setGraphemeSegmenterForTests } from "./graphemes";

afterEach(() => setGraphemeSegmenterForTests(true));

describe("graphemes", () => {
  it("keeps multi-code-point clusters whole", () => {
    expect(graphemes("a👨‍👩‍👧b")).toEqual(["a", "👨‍👩‍👧", "b"]);
    expect(graphemes("🇬🇧🇫🇷")).toEqual(["🇬🇧", "🇫🇷"]);
    expect(graphemes("👍🏽!")).toEqual(["👍🏽", "!"]);
    expect(graphemes("éx")).toEqual(["é", "x"]);
  });

  it("falls back to code points without Intl.Segmenter — never a lone surrogate", () => {
    setGraphemeSegmenterForTests(false);
    expect(graphemes("a🐎b")).toEqual(["a", "🐎", "b"]);
    expect(graphemes("🇬🇧")).toEqual(["🇬", "🇧"]);
  });
});
