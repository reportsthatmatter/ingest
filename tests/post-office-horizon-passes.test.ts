import { describe, expect, it } from "vitest";
import { splitPage } from "../src/clean";
import { parseFootnotes } from "../src/footnotes";
import { pipeline, resolvePasses } from "../src/define";
import type { Pass } from "../src/passes";
import { footnoteNumbers, pdfPageNumbers } from "../src/passes";

/**
 * Passes the Post Office Horizon IT Inquiry's Volume 1 declares (reportsthatmatter-gqsy.2): its notes set
 * the number flush and the text at a tab stop, often opening on a bracketed document reference, and its
 * pages carry no folio.
 */
const resolve = (passes: Pass[]) => resolvePasses(pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes }));
const page = (lines: string[], index: number) => ({ index, volume: 1, pdfIndex: index, lines });

// PDF p.8, as `pdftotext -layout` gives it (body shortened)
const P8 = [
  "Post Office Horizon IT Inquiry Report: Volume 1",
  "",
  "1.12. In 2009 the organisation was formed which will forever be known by the acronym JFSA",
  "      which the claimants’ main contentions were accepted without reservation.10",
  "",
  "",
  "9     Most of the persons prosecuted were convicted of offences of dishonesty. An unknown percentage",
  "      of those prosecuted were acquitted (probably somewhere in the region of 7.5%) but the impact of",
  "      prosecution was invariably disastrous even for those acquitted.",
  "10    Alan Bates and Others v Post Office Limited Judgment (No.3) (Common Issues) [2019] EWHC 606",
  "      (QB) and Horizon Issues judgment.",
  "11    [INQ00002032].",
  "176 [RLIT0000601] at [1/11] to [2/11].",
  "",
];

describe('footnoteNumbers("tabbed")', () => {
  it("reads a flush number with its text at a tab stop, opening on a letter or a bracket", () => {
    const split = splitPage(page(P8, 8), 9, { footnoteNumbers: "tabbed" });
    expect(split.footnotes[0]).toMatch(/^9 {5}Most/);
    const notes = parseFootnotes(split.footnotes, 8, "tabbed");
    expect(notes.map((n) => n.number)).toEqual([9, 10, 11]);
    expect(notes[0].text).toMatch(/^Most of the persons .* even for those acquitted\.$/);
    expect(notes[2].text).toBe("[INQ00002032]. 176 [RLIT0000601] at [1/11] to [2/11].");
  });

  it("is not the bare style, which leaves these notes in the body", () => {
    expect(splitPage(page(P8, 8), 9).footnotes).toEqual([]);
  });

  it("resolves the declared style", () => {
    expect(resolve([footnoteNumbers("tabbed")]).footnoteNumbers).toBe("tabbed");
    expect(resolve([footnoteNumbers("period")]).footnoteNumbers).toBe("period");
    expect(resolve([]).footnoteNumbers).toBeUndefined();
  });
});

describe("pdfPageNumbers", () => {
  it("is declared", () => {
    expect(resolve([pdfPageNumbers()]).pdfPageNumbers).toBe(true);
    expect(resolve([]).pdfPageNumbers).toBe(false);
  });
});
