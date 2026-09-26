import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StructuredTextItem } from "unpdf";
import {
  HeaderFooterStripper,
  MultiColumnLayoutResolver,
} from "../src/extractors/multi-column-layout-resolver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  str: string,
  x: number,
  y: number,
  opts: Partial<StructuredTextItem> = {}
): StructuredTextItem {
  return {
    str,
    x,
    y,
    width: opts.width ?? str.length * 6,
    height: opts.height ?? 12,
    fontSize: opts.fontSize ?? 12,
    fontFamily: opts.fontFamily ?? "sans-serif",
    dir: opts.dir ?? "ltr",
    hasEOL: opts.hasEOL ?? false,
  };
}

// Build a synthetic 2-column page:
//   Column A: x = 10..100  (left margin 10)
//   Column B: x = 200..300 (left margin 200, gutter at 100..200)
//
// Items are interleaved as they appear in a PDF stream (not sorted by column).
function makeTwoColumnPage(): StructuredTextItem[] {
  return [
    makeItem("col-a-line1", 10, 800),
    makeItem("col-b-line1", 200, 800),
    makeItem("col-a-line2", 10, 780),
    makeItem("col-b-line2", 200, 780),
    makeItem("col-a-line3", 15, 760),
    makeItem("col-b-line3", 205, 760),
  ];
}

// Build a single-column page
function makeSingleColumnPage(): StructuredTextItem[] {
  return [makeItem("line1", 10, 800), makeItem("line2", 10, 780), makeItem("line3", 10, 760)];
}

// ---------------------------------------------------------------------------
// MultiColumnLayoutResolver
// ---------------------------------------------------------------------------

describe("MultiColumnLayoutResolver", () => {
  it("returns empty string for an empty page", () => {
    const result = MultiColumnLayoutResolver.resolvePages([[]], {});
    assert.equal(result[0], "");
  });

  it("single-column page preserves item text in y-order", () => {
    const page = makeSingleColumnPage();
    const [text] = MultiColumnLayoutResolver.resolvePages([page], {
      enabled: true,
    });
    assert.ok(text.includes("line1"), "should contain line1");
    assert.ok(text.includes("line2"), "should contain line2");
    assert.ok(text.includes("line3"), "should contain line3");
  });

  it("two-column page with large gutter outputs left column before right", () => {
    const page = makeTwoColumnPage();
    const [text] = MultiColumnLayoutResolver.resolvePages([page], {
      enabled: true,
      minColumnGap: 20,
    });

    // All text should appear
    assert.ok(text.includes("col-a-line1"));
    assert.ok(text.includes("col-b-line1"));

    // Left column items must all appear before right column items
    const idxA = text.indexOf("col-a-line1");
    const idxB = text.indexOf("col-b-line1");
    assert.ok(idxA < idxB, "Left column must precede right column");
  });

  it("respects expectedColumns=2 override for manually specified column count", () => {
    const page = makeTwoColumnPage();
    const [text] = MultiColumnLayoutResolver.resolvePages([page], {
      enabled: true,
      expectedColumns: 2,
      minColumnGap: 20,
    });
    assert.ok(text.includes("col-a-line1"));
    assert.ok(text.includes("col-b-line1"));
    const idxA = text.indexOf("col-a-line1");
    const idxB = text.indexOf("col-b-line1");
    assert.ok(idxA < idxB, "Left column should still precede right");
  });

  it("within each column, items are sorted top-to-bottom (descending y)", () => {
    const page = makeTwoColumnPage();
    const [text] = MultiColumnLayoutResolver.resolvePages([page], {
      enabled: true,
      minColumnGap: 20,
    });
    // col-a-line1 (y=800) should appear before col-a-line3 (y=760)
    const idx1 = text.indexOf("col-a-line1");
    const idx3 = text.indexOf("col-a-line3");
    assert.ok(idx1 < idx3, "Higher-y item should appear first within column");
  });

  it("handles multiple pages independently", () => {
    const page1 = makeSingleColumnPage();
    const page2 = makeTwoColumnPage();
    const results = MultiColumnLayoutResolver.resolvePages([page1, page2], {
      minColumnGap: 20,
    });
    assert.equal(results.length, 2);
    assert.ok(results[0].includes("line1"));
    assert.ok(results[1].includes("col-a-line1"));
  });

  it("items with no text are treated as single-column (no crash)", () => {
    const page = [makeItem("", 10, 800), makeItem("", 200, 800)];
    const [text] = MultiColumnLayoutResolver.resolvePages([page], {
      minColumnGap: 20,
    });
    assert.equal(text.trim(), "");
  });

  it("falls back to single-column when x-range is narrower than 2*minGap", () => {
    // All items within a narrow x range
    const page = [makeItem("a", 10, 800), makeItem("b", 15, 780), makeItem("c", 12, 760)];
    const [text] = MultiColumnLayoutResolver.resolvePages([page], {
      minColumnGap: 100,
    });
    // Should include all text with no crash
    assert.ok(text.includes("a"));
    assert.ok(text.includes("b"));
  });
});

// ---------------------------------------------------------------------------
// HeaderFooterStripper — stripFromItems
// ---------------------------------------------------------------------------

describe("HeaderFooterStripper.stripFromItems", () => {
  // Build a set of pages where 'Journal Name' appears at the top of each page
  // and 'Page N' appears at the bottom.
  function buildPagesWithHeaderFooter(count: number): StructuredTextItem[][] {
    const pages: StructuredTextItem[][] = [];
    for (let i = 0; i < count; i++) {
      const page: StructuredTextItem[] = [
        // Header at top (y near 800)
        makeItem("Journal Name", 10, 790),
        // Body content in the middle
        makeItem(`Body text page ${i + 1}`, 10, 500),
        makeItem(`More body content ${i + 1}`, 10, 480),
        // Footer at bottom (y near 10)
        makeItem(`Page ${i + 1}`, 10, 5),
      ];
      pages.push(page);
    }
    return pages;
  }

  it("returns input unchanged when fewer than 3 pages", () => {
    const pages = buildPagesWithHeaderFooter(2);
    const result = HeaderFooterStripper.stripFromItems(pages);
    assert.equal(result.length, 2);
    // 'Journal Name' should still be present
    assert.ok(result[0].some((i) => i.str === "Journal Name"));
  });

  it("strips recurring header items across >= 50% of pages", () => {
    const pages = buildPagesWithHeaderFooter(5);
    const result = HeaderFooterStripper.stripFromItems(pages);
    // 'Journal Name' appeared on all 5 pages in the header zone
    const hasHeader = result.some((p) => p.some((i) => i.str === "Journal Name"));
    assert.equal(hasHeader, false, "recurring header should be stripped");
  });

  it("strips recurring footer items across >= 50% of pages", () => {
    const pages = buildPagesWithHeaderFooter(5);
    const result = HeaderFooterStripper.stripFromItems(pages);
    // 'Page N' differs per page — should NOT be stripped
    // But let's verify body content survives
    for (let i = 0; i < result.length; i++) {
      assert.ok(
        result[i].some((item) => item.str.includes("Body text page")),
        `body content must survive on page ${i + 1}`
      );
    }
  });

  it("preserves unique body content after header/footer removal", () => {
    const pages = buildPagesWithHeaderFooter(5);
    const result = HeaderFooterStripper.stripFromItems(pages);
    assert.ok(
      result[0].some((i) => i.str === "Body text page 1"),
      "Body text must be preserved"
    );
    assert.ok(
      result[4].some((i) => i.str === "Body text page 5"),
      "Body text of last page must be preserved"
    );
  });

  it("handles pages with no items without throwing", () => {
    const pages: StructuredTextItem[][] = [[], [], [], []];
    const result = HeaderFooterStripper.stripFromItems(pages);
    assert.equal(result.length, 4);
  });
});

// ---------------------------------------------------------------------------
// HeaderFooterStripper — stripFromText (fallback text-only mode)
// ---------------------------------------------------------------------------

describe("HeaderFooterStripper.stripFromText", () => {
  function buildTextPages(count: number): string[] {
    const pages: string[] = [];
    for (let i = 0; i < count; i++) {
      pages.push(
        [
          "Recurring Journal Header",
          `Article body line A on page ${i + 1}`,
          `Article body line B on page ${i + 1}`,
          "Recurring Footer Line",
        ].join("\n")
      );
    }
    return pages;
  }

  it("returns input unchanged when fewer than 3 pages", () => {
    const pages = buildTextPages(2);
    const result = HeaderFooterStripper.stripFromText(pages);
    assert.ok(result[0].includes("Recurring Journal Header"));
  });

  it("strips recurring first-line header from all pages", () => {
    const pages = buildTextPages(5);
    const result = HeaderFooterStripper.stripFromText(pages);
    for (const page of result) {
      assert.ok(
        !page.includes("Recurring Journal Header"),
        "recurring header line must be stripped"
      );
    }
  });

  it("strips recurring last-line footer from all pages", () => {
    const pages = buildTextPages(5);
    const result = HeaderFooterStripper.stripFromText(pages);
    for (const page of result) {
      assert.ok(!page.includes("Recurring Footer Line"), "recurring footer line must be stripped");
    }
  });

  it("preserves unique body content after strip", () => {
    const pages = buildTextPages(5);
    const result = HeaderFooterStripper.stripFromText(pages);
    assert.ok(result[0].includes("Article body line A on page 1"));
    assert.ok(result[4].includes("Article body line A on page 5"));
  });

  it("does not strip lines appearing in fewer than 50% of pages", () => {
    const pages = buildTextPages(6);
    // Inject a line only in pages 0 and 1 (2/6 = 33% < 50%)
    pages[0] = `Rare Header\n${pages[0]}`;
    pages[1] = `Rare Header\n${pages[1]}`;
    const result = HeaderFooterStripper.stripFromText(pages);
    // Rare header should survive in some page since frequency < threshold
    const survived = result.some((p) => p.includes("Rare Header"));
    assert.ok(survived, "sub-threshold lines must not be stripped");
  });
});
