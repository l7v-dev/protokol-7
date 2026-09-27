import type { StructuredTextItem } from "unpdf";
import type { MultiColumnLayoutOptions } from "../api/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MIN_COLUMN_GAP = 20; // pts in PDF coordinate space
const HEADER_FOOTER_ZONE_FRACTION = 0.08; // top 8% / bottom 8% of page height
const HEADER_FOOTER_FREQUENCY_THRESHOLD = 0.5; // >=50% of pages to qualify
const MIN_PAGES_FOR_HF_DETECTION = 3;

// ---------------------------------------------------------------------------
// Column segment built from text items
// ---------------------------------------------------------------------------

interface ColumnSegment {
  colIndex: number;
  items: StructuredTextItem[];
}

// ---------------------------------------------------------------------------
// MultiColumnLayoutResolver
//
// Operates on StructuredTextItem[][] (one sub-array per page) returned by
// unpdf's extractTextItems(). Uses x-coordinate gap (gutter) analysis to
// detect 2- or 3-column layouts, then re-orders items so text flows
// column-by-column, top-to-bottom within each column.
// ---------------------------------------------------------------------------

export class MultiColumnLayoutResolver {
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Resolves column order for a set of pages.
   *
   * @param pages   Per-page arrays of StructuredTextItem from extractTextItems
   * @param options MultiColumnLayoutOptions (enabled, minColumnGap,
   *                expectedColumns)
   * @returns       Array of resolved page text strings in reading order
   */
  static resolvePages(
    pages: StructuredTextItem[][],
    options: MultiColumnLayoutOptions = {}
  ): string[] {
    const minGap = options.minColumnGap ?? DEFAULT_MIN_COLUMN_GAP;
    const expected = options.expectedColumns;

    return pages.map((items) => {
      if (items.length === 0) return "";
      const boundaries = this.detectColumnBoundaries(items, minGap, expected);
      if (boundaries.length <= 1) {
        // Single column — join items preserving EOL markers
        return this.joinItems(items);
      }
      return this.reorderByColumns(items, boundaries);
    });
  }

  // -------------------------------------------------------------------------
  // Column boundary detection
  // -------------------------------------------------------------------------

  /**
   * Detects column left-edge boundaries using a gap histogram over item
   * x-coordinates. Returns sorted array of column left-edge x values.
   * A single element means single-column layout (no gutter detected).
   */
  private static detectColumnBoundaries(
    items: StructuredTextItem[],
    minGap: number,
    expectedColumns?: number
  ): number[] {
    if (items.length === 0) return [0];

    // Collect x-start positions of all text items
    const xPositions = items.filter((it) => it.str.trim().length > 0).map((it) => it.x);

    if (xPositions.length === 0) return [0];

    const minX = Math.min(...xPositions);
    const maxX = Math.max(...xPositions);
    const range = maxX - minX;

    if (range < minGap * 2) return [minX]; // too narrow for multi-column

    // Build a histogram of x-coordinate clusters.
    // Bin width is set so that neighbouring characters in the same column
    // fall into the same bucket (approximately one em-width).
    const BIN_WIDTH = Math.max(4, minGap / 4);
    const bins = new Map<number, number>();

    for (const x of xPositions) {
      const bin = Math.floor((x - minX) / BIN_WIDTH);
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
    }

    const sortedBins = [...bins.entries()].sort((a, b) => a[0] - b[0]);

    // Find significant gaps between populated bins
    const boundaries: number[] = [minX];
    let prevBin = sortedBins[0][0];
    for (let i = 1; i < sortedBins.length; i++) {
      const gap = (sortedBins[i][0] - prevBin) * BIN_WIDTH;
      if (gap >= minGap) {
        // A gap in x-histogram signals a column gutter.
        const boundaryX = minX + sortedBins[i][0] * BIN_WIDTH;
        boundaries.push(boundaryX);
      }
      prevBin = sortedBins[i][0];
    }

    // If caller specified expected column count, enforce it
    if (expectedColumns && expectedColumns >= 2) {
      if (boundaries.length > expectedColumns) {
        // Keep only the strongest N-1 gutter gaps
        return boundaries.slice(0, expectedColumns);
      }
      if (boundaries.length < expectedColumns) {
        // Divide page evenly as fallback
        return Array.from(
          { length: expectedColumns },
          (_, i) => minX + (range / expectedColumns) * i
        );
      }
    }

    return boundaries;
  }

  // -------------------------------------------------------------------------
  // Column assignment and text serialisation
  // -------------------------------------------------------------------------

  /**
   * Assigns each item to a column, sorts within each column by y descending
   * (PDF y-origin is bottom-left, so higher y = higher on page), then
   * concatenates columns left-to-right.
   */
  private static reorderByColumns(items: StructuredTextItem[], boundaries: number[]): string {
    const columns: ColumnSegment[] = boundaries.map((_, i) => ({
      colIndex: i,
      items: [],
    }));

    for (const item of items) {
      // Assign to the rightmost boundary that is <= item.x
      let col = 0;
      for (let i = boundaries.length - 1; i >= 0; i--) {
        if (item.x >= boundaries[i] - 2) {
          col = i;
          break;
        }
      }
      columns[col].items.push(item);
    }

    // Sort each column top-to-bottom (higher y = nearer top in PDF space)
    for (const seg of columns) {
      seg.items.sort((a, b) => b.y - a.y);
    }

    // Concatenate columns
    return columns
      .map((seg) => this.joinItems(seg.items))
      .filter((t) => t.trim().length > 0)
      .join("\n\n");
  }

  /**
   * Joins StructuredTextItem array into a plain string, inserting newlines
   * where hasEOL is set.
   */
  private static joinItems(items: StructuredTextItem[]): string {
    const parts: string[] = [];
    for (const item of items) {
      parts.push(item.str);
      if (item.hasEOL) parts.push("\n");
    }
    return parts.join("").trim();
  }
}

// ---------------------------------------------------------------------------
// HeaderFooterStripper
//
// Operates on per-page plain-text arrays. Detects lines that repeat in the
// top 8% / bottom 8% of page height across >= 50% of pages and strips them.
// When position data is unavailable, falls back to line-index-based detection
// (first 2 lines / last 2 lines of each page).
// ---------------------------------------------------------------------------

export class HeaderFooterStripper {
  // -------------------------------------------------------------------------
  // Position-aware stripping (primary path)
  // -------------------------------------------------------------------------

  /**
   * Strips repeating header/footer items using bounding-box y-coordinates.
   * Returns per-page arrays with header/footer items removed.
   *
   * @param pages     Per-page StructuredTextItem arrays
   * @returns         Cleaned per-page item arrays
   */
  static stripFromItems(pages: StructuredTextItem[][]): StructuredTextItem[][] {
    if (pages.length < MIN_PAGES_FOR_HF_DETECTION) return pages;

    // Compute per-page height bounds (min/max y across items)
    const pageBounds = pages.map((items) => {
      if (items.length === 0) return { minY: 0, maxY: 0 };
      const ys = items.map((i) => i.y);
      return { minY: Math.min(...ys), maxY: Math.max(...ys) };
    });

    // Collect candidate strings from top/bottom zones of each page
    const headerCandidates = new Map<string, number>(); // str -> page count
    const footerCandidates = new Map<string, number>();

    for (let pi = 0; pi < pages.length; pi++) {
      const { minY, maxY } = pageBounds[pi];
      const height = maxY - minY;
      if (height <= 0) continue;
      const topThreshold = maxY - height * HEADER_FOOTER_ZONE_FRACTION;
      const bottomThreshold = minY + height * HEADER_FOOTER_ZONE_FRACTION;

      const seenHeader = new Set<string>();
      const seenFooter = new Set<string>();

      for (const item of pages[pi]) {
        const s = item.str.trim();
        if (s.length === 0) continue;
        if (item.y >= topThreshold && !seenHeader.has(s)) {
          headerCandidates.set(s, (headerCandidates.get(s) ?? 0) + 1);
          seenHeader.add(s);
        }
        if (item.y <= bottomThreshold && !seenFooter.has(s)) {
          footerCandidates.set(s, (footerCandidates.get(s) ?? 0) + 1);
          seenFooter.add(s);
        }
      }
    }

    const total = pages.length;
    const recurringHeaders = this.filterRecurring(headerCandidates, total);
    const recurringFooters = this.filterRecurring(footerCandidates, total);
    const blacklist = new Set([...recurringHeaders, ...recurringFooters]);

    if (blacklist.size === 0) return pages;

    return pages.map((items, pi) => {
      const { minY, maxY } = pageBounds[pi];
      const height = maxY - minY;
      if (height <= 0) return items;
      const topThreshold = maxY - height * HEADER_FOOTER_ZONE_FRACTION;
      const bottomThreshold = minY + height * HEADER_FOOTER_ZONE_FRACTION;

      return items.filter((item) => {
        const s = item.str.trim();
        if (s.length === 0) return true;
        if ((item.y >= topThreshold || item.y <= bottomThreshold) && blacklist.has(s)) {
          return false;
        }
        return true;
      });
    });
  }

  // -------------------------------------------------------------------------
  // Text-only stripping (fallback / post-extraction)
  // -------------------------------------------------------------------------

  /**
   * Strips repeating header/footer lines from plain-text page strings.
   * Operates on line-index position (first 2 / last 2 lines per page).
   *
   * @param pages   Array of page text strings
   * @returns       Cleaned page text strings
   */
  static stripFromText(pages: string[]): string[] {
    if (pages.length < MIN_PAGES_FOR_HF_DETECTION) return pages;

    const pageLines = pages.map((p) => p.split("\n"));
    const total = pages.length;

    // Collect candidates from first/last N lines
    const ZONE_LINES = 2;
    const topCandidates = new Map<string, number>();
    const bottomCandidates = new Map<string, number>();

    for (const lines of pageLines) {
      const seenTop = new Set<string>();
      const seenBottom = new Set<string>();

      const topSlice = lines.slice(0, ZONE_LINES);
      const bottomSlice = lines.slice(-ZONE_LINES);

      for (const l of topSlice) {
        const s = l.trim();
        if (s.length > 0 && !seenTop.has(s)) {
          topCandidates.set(s, (topCandidates.get(s) ?? 0) + 1);
          seenTop.add(s);
        }
      }
      for (const l of bottomSlice) {
        const s = l.trim();
        if (s.length > 0 && !seenBottom.has(s)) {
          bottomCandidates.set(s, (bottomCandidates.get(s) ?? 0) + 1);
          seenBottom.add(s);
        }
      }
    }

    const recurringTop = this.filterRecurring(topCandidates, total);
    const recurringBottom = this.filterRecurring(bottomCandidates, total);
    const blacklist = new Set([...recurringTop, ...recurringBottom]);

    if (blacklist.size === 0) return pages;

    return pageLines.map((lines) => {
      const cleaned = lines.filter((l) => !blacklist.has(l.trim()));
      return cleaned.join("\n").trim();
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private static filterRecurring(candidates: Map<string, number>, total: number): Set<string> {
    const result = new Set<string>();
    for (const [str, count] of candidates) {
      if (count / total >= HEADER_FOOTER_FREQUENCY_THRESHOLD) {
        result.add(str);
      }
    }
    return result;
  }
}
