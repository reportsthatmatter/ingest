import { describe, expect, it } from "vitest";
import { takePrintedNumber } from "../src/clean";
import { markUnreadPages } from "../src/pipeline";
import type { Block } from "../src/paragraphs";

// Pages the PDF pipeline read no number off, between two it did (reportsthatmatter-d662).
const at = (pdfIndex: number, printed: number | null = null) => ({ volume: 1, pdfIndex, printed });
const page = (pdfIndex: number, number: number): Block => ({ kind: "page", number, at: at(pdfIndex, number) }) as Block;
const para = (pdfIndex: number, text: string): Block => ({ kind: "paragraph", text, at: at(pdfIndex) }) as Block;
const label = (b: Block) => (b.kind === "page" ? `%%${b.number}` : (b as { text: string }).text);

describe("markUnreadPages", () => {
  it("marks an unread page at its own first block, between two read pages in step", () => {
    const chunks = [page(5, 10), para(5, "a"), para(6, "b1"), para(6, "b2"), para(7, "c"), page(8, 13), para(8, "d")];
    // pages 6 and 7 lie between 10 (pdf 5) and 13 (pdf 8)
    markUnreadPages(chunks);
    expect(chunks.map(label)).toEqual(["%%10", "a", "%%11", "b1", "b2", "%%12", "c", "%%13", "d"]);
  });

  it("leaves a gap whose numbers are not in step, and a page with no block, unmarked", () => {
    const skewed = [page(5, 10), para(5, "a"), para(6, "b"), page(8, 14), para(8, "d")];
    markUnreadPages(skewed);
    expect(skewed.map(label)).toEqual(["%%10", "a", "b", "%%14", "d"]);
    const blank = [page(5, 10), para(5, "a"), page(7, 12), para(7, "c")];
    markUnreadPages(blank);
    expect(blank.map(label)).toEqual(["%%10", "a", "%%12", "c"]);
  });
});

describe("takePrintedNumber and a thumb-index tab (Leveson Part L)", () => {
  it("reads the folio above a lone tab letter, and takes both off", () => {
    expect(takePrintedNumber(["Text.", "", "                  1803", "                         L", ""])).toMatchObject({ printed: 1803, lines: ["Text.", "", ""] });
  });
  it("reads a folio and tab on one line, either way round", () => {
    expect(takePrintedNumber(["Text.", "", "L                    1804"])).toMatchObject({ printed: 1804, lines: ["Text.", ""] });
    expect(takePrintedNumber(["Text.", "1805          L"])).toMatchObject({ printed: 1805, lines: ["Text."] });
  });
  it("leaves a lone capital that follows no number alone", () => {
    expect(takePrintedNumber(["Text.", "L"])).toMatchObject({ printed: null, lines: ["Text.", "L"] });
  });
});
