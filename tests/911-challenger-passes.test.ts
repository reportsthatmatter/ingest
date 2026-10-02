import { describe, expect, it } from "vitest";
import { linkSequencedMarkers } from "../src/footnotes";
import { mergeAcrossPages, shortSubheadAt, spacedContentsBlocks, type Block } from "../src/paragraphs";
import { pipeline, resolvePasses } from "../src/define";
import { contentsEntries, numberedSections, quoteRunOn, shiftedPages, shortSubheads } from "../src/passes";

const volumes = [{ path: "archive/x.pdf" }];
const base = { id: "x", title: "X", repo: ".", volumes };

describe("contentsEntries (reportsthatmatter-5fn)", () => {
  const page = [
    "                                      CONTENTS",
    "",
    "        List of Illustrations and Tables ix",
    "        Staff List xiii–xiv",
    "",
    "        1. “WE HAVE SOME PLANES” 1",
    "               1.1   Inside the Four Flights 1",
    "               2.4   Building an Organization, Declaring",
    "                        War on the United States (1992–1996) 59",
    "          v",
  ];

  it("lays the page out as its entries, wrapped titles joined and the folio dropped", () => {
    const blocks = spacedContentsBlocks(page);
    expect(blocks[0]).toEqual({ kind: "heading", level: 2, text: "CONTENTS" });
    expect(blocks.slice(1).map((b) => (b.kind === "contents" ? `${b.text} | ${b.page}` : b.kind))).toEqual([
      "List of Illustrations and Tables | ix",
      "Staff List | xiii–xiv",
      '1\\. "WE HAVE SOME PLANES" | 1',
      "1.1 Inside the Four Flights | 1",
      "2.4 Building an Organization, Declaring War on the United States (1992–1996) | 59",
    ]);
  });

  it("reads a list of illustrations, with its wrapped tail", () => {
    const blocks = spacedContentsBlocks([
      "  LIST OF ILLUSTRATIONS",
      "        AND TABLES",
      "  p. 15          FAA Air Traffic Control Centers",
      "  p. 312         The Twin Towers following the impact of American Airlines",
      "                    Flight 11 and United Airlines Flight 175",
      "  p. 313         The Pentagon",
    ]);
    expect(blocks[0]).toEqual({ kind: "heading", level: 2, text: "LIST OF ILLUSTRATIONS AND TABLES" });
    expect(blocks[2]).toMatchObject({
      text: "The Twin Towers following the impact of American Airlines Flight 11 and United Airlines Flight 175",
      page: "312",
    });
  });

  it("needs numberedSections", () => {
    expect(() => pipeline({ ...base, passes: [contentsEntries()] })).toThrow(/numberedSections/);
    expect(resolvePasses(pipeline({ ...base, passes: [numberedSections(), contentsEntries()] })).contentsEntries).toBe(true);
  });
});

describe("linkSequencedMarkers (reportsthatmatter-w1n)", () => {
  const numbers = new Set([1, 2, 3, 4, 5, 6, 37, 38]);

  it("links markers glued to a closing quotation mark, a short word or a number", () => {
    expect(linkSequencedMarkers('He said "we have some planes."1 Then at 9:09.2 Later it.3 End.', numbers)).toBe(
      'He said "we have some planes."[^1] Then at 9:09.[^2] Later it.[^3] End.'
    );
  });

  it("takes only numbers in sequence, and not a year, a decimal or a heading's own number", () => {
    expect(linkSequencedMarkers("It rose in 1993.5 percent more.", numbers)).toBe("It rose in 1993.5 percent more.");
    expect(linkSequencedMarkers("First.[^37] The war ended.38 Then.", numbers)).toBe("First.[^37] The war ended.[^38] Then.");
    expect(linkSequencedMarkers("### 2.1 A Declaration of War", numbers)).toBe("### 2.1 A Declaration of War");
    // 5 is in the chapter, but the last marker read was 37, so 5 cannot come next.
    expect(linkSequencedMarkers("First.[^37] Second.5 Third.", numbers)).toBe("First.[^37] Second.5 Third.");
  });
});

describe("shortSubheads (reportsthatmatter-5u2)", () => {
  const full = "In the spring of 2001, the level of reporting on terrorist threats and planned attacks rose.";
  it("reads a short title-case line over a full one as a subhead", () => {
    const lines = ["   More text above, ending here.", "", "   The Drumbeat Begins", `   ${full}`];
    expect(shortSubheadAt(lines, 2)).toBe(true);
  });
  it("leaves a label, a sentence and a line followed by a short one", () => {
    expect(shortSubheadAt(["", "Indianapolis Center", "Boston"], 1)).toBe(false);
    expect(shortSubheadAt(["", "The Drumbeat Begins.", full], 1)).toBe(false);
    expect(shortSubheadAt(["text", "The Drumbeat Begins", full], 1)).toBe(false);
  });
  it("is a declared pass", () => {
    expect(resolvePasses(pipeline({ ...base, passes: [shortSubheads()] })).shortSubheads).toBe(true);
  });
});

describe("quoteRunOn (reportsthatmatter-m2y)", () => {
  const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
  const blocks: Block[] = [
    { kind: "quote", text: "the fundamental problem was poor decision-making by top NASA", at: at(4) },
    { kind: "page", number: 5, at: at(5) },
    { kind: "paragraph", text: "and contractor personnel, who failed to act.", at: at(5) },
    { kind: "paragraph", text: "Information on the flaws was available.", at: at(5) },
  ];
  it("joins a lower-case page-opening paragraph into the quotation that stops mid-sentence", () => {
    const merged = mergeAcrossPages(blocks, { quoteRunOn: true });
    expect(merged.filter((b) => b.kind === "quote")).toHaveLength(1);
    expect(merged[0]).toMatchObject({ text: "the fundamental problem was poor decision-making by top NASA and contractor personnel, who failed to act." });
    expect(merged.some((b) => b.kind === "paragraph" && b.text.startsWith("Information"))).toBe(true);
  });
  it("does nothing unless declared", () => {
    expect(mergeAcrossPages(blocks).filter((b) => b.kind === "paragraph")).toHaveLength(2);
    expect(resolvePasses(pipeline({ ...base, passes: [quoteRunOn(), shiftedPages()] })).shiftedPages).toBe(true);
  });
});
