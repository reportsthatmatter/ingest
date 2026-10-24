import { describe, expect, it } from "vitest";
import { correctPageText } from "../src/edition";

const printed = [
  { volume: 1, pdfIndex: 22, number: 12 },
  { volume: 1, pdfIndex: 23, number: 13 },
];

describe("correctPageText: corrections reach the page text a clean edition is aligned to", () => {
  it("supplies the words of a page whose text layer lacks them, on the page `where` names", () => {
    const pages = [
      { volume: 1, pdfIndex: 22, lines: ["RT hires or makes contractual agreements"] },
      { volume: 1, pdfIndex: 23, lines: ["Annex B"] },
    ];
    const n = correctPageText(pages, [{ find: "Annex B", replace: "Annex B ESTIMATIVE LANGUAGE Estimative language consists", where: { printed: 13 } }], printed);
    expect(n).toBe(1);
    expect(pages[1].lines).toEqual(["Annex B ESTIMATIVE LANGUAGE Estimative language consists"]);
    expect(pages[0].lines).toEqual(["RT hires or makes contractual agreements"]);
  });

  it("matches across the break between two lines, keeping the page's line count", () => {
    const pages = [{ volume: 1, pdfIndex: 22, lines: ["the Sen- ate", "Committee met"] }];
    expect(correctPageText(pages, [{ find: "ate Committee", replace: "ate's Committee" }], printed)).toBe(1);
    expect(pages[0].lines).toEqual(["the Sen- ate's Committee met", ""]);
  });

  it("leaves the page text alone when the find is absent or ambiguous there", () => {
    const pages = [{ volume: 1, pdfIndex: 23, lines: ["Annex B", "Annex B"] }];
    expect(correctPageText(pages, [{ find: "Annex B", replace: "X" }, { find: "Annex C", replace: "Y" }], printed)).toBe(0);
    expect(pages[0].lines).toEqual(["Annex B", "Annex B"]);
  });

  it("does not look outside the page `where` names", () => {
    const pages = [{ volume: 1, pdfIndex: 22, lines: ["Annex B"] }];
    expect(correctPageText(pages, [{ find: "Annex B", replace: "X", where: { printed: 13 } }], printed)).toBe(0);
  });
});
