import { describe, expect, it } from "vitest";
import { noteOffPage, hasPageNotes, type Block, type Footnote } from "../src/index";

const para = (text: string, pdfIndex: number): Block => ({ kind: "paragraph", text, at: { volume: 1, pdfIndex, printed: pdfIndex } });
const note = (number: number, pdfIndex: number): Footnote => ({ number, text: `note ${number} on ${pdfIndex}`, page: pdfIndex, pdfIndex });

// A numbering that restarts per chapter: 1-3 on pages 1-3, then 1-3 again on pages 5-7.
const notes = [note(1, 1), note(2, 2), note(3, 3), note(1, 5), note(2, 6), note(3, 7)];

describe("noteOffPage (reportsthatmatter-y0w9)", () => {
  it("counts a reference the renderer pairs with a note from another page (sparse linking)", () => {
    // Only the second chapter's last marker is linked: the alignment takes the first "3", on page 3
    const sparse = [para("The chapter ends here.[^3]", 7)];
    expect(noteOffPage(sparse, notes)).toEqual([{ volume: 1, page: 7, label: "3", definedVolume: 1, definedPage: 3 }]);
  });

  it("is clean when every marker is linked", () => {
    const dense = [para("One.[^1]", 1), para("Two.[^2]", 2), para("Three.[^3]", 3), para("One.[^1]", 5), para("Two.[^2]", 6), para("Three.[^3]", 7)];
    expect(noteOffPage(dense, notes)).toEqual([]);
  });

  it("allows a page either side, for a paragraph that runs over the break", () => {
    expect(noteOffPage([para("Runs over.[^2]", 1)], [note(2, 2)])).toEqual([]);
    expect(noteOffPage([para("Runs over.[^2]", 1)], [note(2, 3)])).toHaveLength(1);
  });

  it("reads a list item and a quotation too", () => {
    const blocks: Block[] = [
      { kind: "list", quoted: false, items: ["a[^2]"], at: { volume: 1, pdfIndex: 9, printed: 9 } },
      { kind: "quote", text: "q[^2]", at: { volume: 1, pdfIndex: 9, printed: 9 } },
    ];
    expect(noteOffPage(blocks, [note(2, 2)])).toHaveLength(2);
  });

  it("pairs a note that runs over a page as one note, on the page where it opens", () => {
    const split = [note(4, 10), { ...note(4, 11), text: "continued" }];
    expect(noteOffPage([para("Here.[^4]", 10)], split)).toEqual([]);
  });

  it("names the reports it applies to: page footnotes, not endnotes or an edition's notes", () => {
    expect(hasPageNotes([{ name: "layoutPageJoins" }])).toBe(true);
    expect(hasPageNotes([{ name: "endnotes" }])).toBe(false);
    expect(hasPageNotes([{ name: "edition" }])).toBe(false);
  });
});
