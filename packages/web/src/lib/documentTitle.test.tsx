import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import {
  cleanTitlePart,
  formatDocumentTitle,
  TITLE_PART_MAX,
  useDocumentTitle,
  type TitlePart,
} from "./documentTitle";

type WithConfig = { __PADDOCK_CONFIG__?: unknown };
const setBrand = (name: string) => {
  (globalThis as WithConfig).__PADDOCK_CONFIG__ = { brand: { name } };
};

afterEach(() => {
  delete (globalThis as WithConfig).__PADDOCK_CONFIG__;
});

describe("formatDocumentTitle (#958)", () => {
  it("reads most specific first, brand last", () => {
    expect(formatDocumentTitle({ parts: ["Fix the leaking tap", "hushpod"], brand: "House" })).toBe(
      "Fix the leaking tap · hushpod — House",
    );
  });

  it("is just the brand when there are no parts", () => {
    expect(formatDocumentTitle({ parts: [], brand: "House" })).toBe("House");
  });

  it("skips empty, whitespace-only and nullish parts — never 'undefined' or a dangling separator", () => {
    const parts: TitlePart[] = [undefined, null, "", "   ", false, "hushpod"];
    expect(formatDocumentTitle({ parts, brand: "House" })).toBe("hushpod — House");
    expect(formatDocumentTitle({ parts: [null, "  "], brand: "House" })).toBe("House");
  });

  it("drops a trailing part equal to the brand (case-insensitive): no `house — House`", () => {
    expect(formatDocumentTitle({ parts: ["house"], brand: "House" })).toBe("House");
    expect(formatDocumentTitle({ parts: ["Fix it", "HOUSE"], brand: "House" })).toBe("Fix it — House");
  });

  it("keeps a part that merely contains the brand", () => {
    expect(formatDocumentTitle({ parts: ["House party"], brand: "House" })).toBe("House party — House");
  });

  it("collapses adjacent duplicate parts", () => {
    expect(formatDocumentTitle({ parts: ["Files", "files", "hushpod"], brand: "B" })).toBe(
      "Files · hushpod — B",
    );
  });

  it("prepends a prefix verbatim (room for the #958 status markers)", () => {
    expect(formatDocumentTitle({ parts: ["hushpod"], brand: "House", prefix: "● (2) " })).toBe(
      "● (2) hushpod — House",
    );
    expect(formatDocumentTitle({ parts: [], brand: "House", prefix: "✓ " })).toBe("✓ House");
  });

  it("falls back to Paddock for a blank brand", () => {
    expect(formatDocumentTitle({ parts: ["x"], brand: "  " })).toBe("x — Paddock");
  });
});

describe("cleanTitlePart", () => {
  it("collapses whitespace, including newlines", () => {
    expect(cleanTitlePart("  Fix\n  the   tap ")).toBe("Fix the tap");
  });

  it(`truncates to ${TITLE_PART_MAX} characters with an ellipsis`, () => {
    const long = "a".repeat(100);
    const out = cleanTitlePart(long);
    expect(Array.from(out)).toHaveLength(TITLE_PART_MAX);
    expect(out.endsWith("…")).toBe(true);
    // Exactly at the limit is untouched.
    expect(cleanTitlePart("b".repeat(TITLE_PART_MAX))).toBe("b".repeat(TITLE_PART_MAX));
  });

  it("never splits an emoji into a lone surrogate", () => {
    const out = cleanTitlePart("🐎".repeat(100));
    expect(out).toBe(`${"🐎".repeat(TITLE_PART_MAX - 1)}…`);
  });

  it("doesn't leave a space before the ellipsis", () => {
    const out = cleanTitlePart(`${"a".repeat(TITLE_PART_MAX - 2)} bcdef`);
    expect(out).toBe(`${"a".repeat(TITLE_PART_MAX - 2)}…`);
  });
});

function Titled({ parts, prefix }: { parts: TitlePart[]; prefix?: string }) {
  useDocumentTitle(parts, { prefix });
  return null;
}

describe("useDocumentTitle", () => {
  it("sets the title with the default brand", () => {
    render(<Titled parts={["Discover"]} />);
    expect(document.title).toBe("Discover — Paddock");
  });

  it("follows the injected brand, and a brand change on re-render", () => {
    setBrand("House");
    const { rerender } = render(<Titled parts={["Config"]} />);
    expect(document.title).toBe("Config — House");
    setBrand("Barn");
    rerender(<Titled parts={["Config"]} />);
    expect(document.title).toBe("Config — Barn");
  });

  it("updates when the parts change, and carries a prefix", () => {
    const { rerender } = render(<Titled parts={["Old"]} />);
    expect(document.title).toBe("Old — Paddock");
    rerender(<Titled parts={["New"]} prefix="● " />);
    expect(document.title).toBe("● New — Paddock");
  });

  it("restores the bare brand on unmount, so a route without a title inherits nothing stale", () => {
    setBrand("House");
    const { unmount } = render(<Titled parts={["Secret chat name", "hushpod"]} />);
    expect(document.title).toBe("Secret chat name · hushpod — House");
    unmount();
    expect(document.title).toBe("House");
  });

  it("a page mounting after another unmounts wins (chat → /discover)", () => {
    setBrand("House");
    function Swap({ page }: { page: "chat" | "discover" }) {
      return page === "chat" ? (
        <Titled key="chat" parts={["Fix the tap", "hushpod"]} />
      ) : (
        <Titled key="discover" parts={["Discover"]} />
      );
    }
    const { rerender } = render(<Swap page="chat" />);
    expect(document.title).toBe("Fix the tap · hushpod — House");
    rerender(<Swap page="discover" />);
    expect(document.title).toBe("Discover — House");
  });
});
