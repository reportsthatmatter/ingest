import { describe, expect, it } from "vitest";
import { takePrintedNumber } from "../src/clean";
import { strayFolios } from "../src/folios";
import { pipeline, resolvePasses } from "../src/define";
import { foliosInStep, parenFolios } from "../src/passes";

// Challenger (reportsthatmatter-uw50): "(3)" folios at the foot of chapter openers, and OCR'd figure pages
// whose garble reads as a folio ("2", "0", "77") on pages numbered 96, 126, 420 ...
describe("parenFolios (reportsthatmatter-uw50)", () => {
  it("the defect: a parenthesised folio stays in the text and the page has no number", () => {
    const { printed, lines } = takePrintedNumber(["Text of the page.", "", "(3)"]);
    expect(printed).toBeNull();
    expect(lines).toContain("(3)");
  });

  it("takes a foot or head folio in parentheses off, and only when declared", () => {
    expect(takePrintedNumber(["Text.", "", "   (3)"], { paren: true })).toEqual({ printed: 3, lines: ["Text.", ""] });
    expect(takePrintedNumber(["(12)", "Text."], { paren: true })).toMatchObject({ printed: 12, lines: ["Text."] });
  });

  it("leaves a list marker inside the page and a bare folio alone", () => {
    expect(takePrintedNumber(["Text.", "(1) which includes", "more text here."], { paren: true }).printed).toBeNull();
    expect(takePrintedNumber(["Text.", "", "17"], { paren: true })).toMatchObject({ printed: 17 });
  });

  it("resolves from the declared passes", () => {
    const def = pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [parenFolios(), foliosInStep()] });
    expect(resolvePasses(def)).toMatchObject({ parenFolios: true, foliosInStep: true });
  });
});

describe("strayFolios (reportsthatmatter-uw50)", () => {
  const run = (from: number, n: number, off: number) => Array.from({ length: n }, (_, i) => ({ pdfIndex: from + i, printed: from + i + off }));

  it("drops single strays and a stray pair inside an in-step run", () => {
    const reads = [...run(1, 5, -8), { pdfIndex: 6, printed: 2 }, ...run(7, 5, -8), { pdfIndex: 12, printed: 0 }, { pdfIndex: 14, printed: 0 }, ...run(15, 4, -8)];
    expect([...strayFolios(reads)].sort((a, b) => a - b)).toEqual([6, 12, 14]);
  });

  it("drops a chain of strays that only touch each other", () => {
    const reads = [...run(1, 4, -8), { pdfIndex: 5, printed: 2 }, { pdfIndex: 6, printed: 90 }, { pdfIndex: 7, printed: 11 }, ...run(8, 4, -8)];
    expect([...strayFolios(reads)].sort((a, b) => a - b)).toEqual([5, 6, 7]);
  });

  it("drops a consecutive run that sits between two stretches at one offset, but not a longer one", () => {
    expect(strayFolios([...run(1, 4, -8), ...run(5, 6, -3), ...run(11, 4, -8)]).size).toBe(6);
    expect(strayFolios([...run(1, 4, -8), ...run(5, 12, -3), ...run(17, 4, -8)]).size).toBe(0);
  });

  it("keeps a real change of numbering and a short run with no long run beside it", () => {
    expect(strayFolios([...run(1, 5, -4), ...run(6, 5, -8)]).size).toBe(0);
    expect(strayFolios([...run(1, 2, -4), ...run(3, 2, -8)]).size).toBe(0);
  });
});

describe("pageHeadFolios (reportsthatmatter-ssfk)", () => {
  const head = { above: /^\s*January 6, 2025\s*$/ };

  it("the defect: a 'Page N' running head stays in the text and the page has no number", () => {
    const { printed, lines } = takePrintedNumber(["January 6, 2025", "Page 3", "submitted in writing by the close of business"]);
    expect(printed).toBeNull();
    expect(lines).toContain("Page 3");
  });

  it("reads the head and takes it, and the line above that goes with it, off", () => {
    expect(takePrintedNumber([" January 6, 2025", " Page 12", "will greatly exceed"], { head })).toEqual({ printed: 12, lines: ["will greatly exceed"] });
    expect(takePrintedNumber(["", "Page 4", "Rather, Presidential"], { head })).toMatchObject({ printed: 4, lines: ["", "Rather, Presidential"] });
  });

  it("leaves a page whose head is some other line, and a 'Page N' in the middle of the text", () => {
    expect(takePrintedNumber(["Letterhead", "Page 3", "text"], { head }).printed).toBeNull();
    expect(takePrintedNumber(["Text of the page.", "More text.", "Page 3", "text"], { head }).printed).toBeNull();
  });
});
