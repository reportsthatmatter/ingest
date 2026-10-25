import { describe, expect, it } from "vitest";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { facingPageMargins, geometry, numberedParagraphs, type Pass } from "../src/passes";

// Leveson sets a right-hand page's text four columns further in than a
// left-hand page's (the binding gutter): numbered paragraphs' text at 12 on
// odd PDF pages, 8 on even (reportsthatmatter-fkx). Measured against one
// margin per volume, a right-hand page's every line opened a paragraph and
// only the lower-case ones rejoined: "…I selected" / "Robert Jay QC…".
const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };
const at = (n: number, text: string) => " ".repeat(n) + text;

const left = (k: number) => [
  at(0, `${k}.1    The left-hand page sets its numbered paragraph text at eight columns and`),
  at(8, "carries on at the same column, line after line, as running text does on a"),
  at(8, "page of this kind, to the end of the paragraph."),
  "",
  at(0, `${k}.2    Another numbered paragraph on the left-hand page, carried on at eight`),
  at(8, "columns again, so that the volume's commonest indent is eight."),
];
// A right-hand page with no numbered paragraph of its own: its text sits at 12.
const right = [
  at(12, "With the assistance of the Treasury Solicitor, the Chairman selected"),
  at(12, "Robert Jay QC to be Counsel to the Inquiry; with his approval he nominated"),
  at(12, "Carine Patry Hoskins as junior Counsel, later adding Lucinda Boon for"),
  at(12, "Module 2, concerning the relationship between the press and the police."),
];
const opener = [
  at(4, "1.6     I also set about appointing counsel. With the assistance of the"),
  at(12, "Treasury Solicitor, I selected counsel to the Inquiry and the team."),
];
const run = (passes: Pass[]) =>
  ingestPageGroups(
    [
      [
        { index: 1, volume: 1, pdfIndex: 1, lines: opener },
        { index: 2, volume: 1, pdfIndex: 2, lines: left(2) },
        { index: 3, volume: 1, pdfIndex: 3, lines: right },
        { index: 4, volume: 1, pdfIndex: 4, lines: left(4) },
        { index: 5, volume: 1, pdfIndex: 6, lines: left(6) },
      ],
    ],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  ).markdown;
const paragraphs = (markdown: string) => markdown.split("\n").filter((l) => /^[A-Z0-9]/.test(l));

describe("facingPageMargins (reportsthatmatter-fkx)", () => {
  it("cuts a right-hand page's paragraph at every capital without it", () => {
    const out = paragraphs(run([geometry("per-volume"), numberedParagraphs()]));
    expect(out).toContain("Robert Jay QC to be Counsel to the Inquiry; with his approval he nominated");
  });

  it("reads a right-hand page against its own side's margin", () => {
    const out = paragraphs(run([geometry("per-volume"), facingPageMargins(), numberedParagraphs()]));
    expect(out.some((l) => l.startsWith("With the assistance of the Treasury Solicitor, the Chairman selected Robert Jay QC") && l.endsWith("press and the police."))).toBe(true);
    expect(out.filter((l) => l.startsWith("2.") || l.startsWith("4.") || l.startsWith("6."))).toHaveLength(6);
    expect(out).toContain("1.6 I also set about appointing counsel. With the assistance of the Treasury Solicitor, I selected counsel to the Inquiry and the team.");
  });

  it("is off unless declared", () => {
    expect(resolvePasses(pipeline({ ...base, passes: [] })).facingPageMargins).toBe(false);
    expect(resolvePasses(pipeline({ ...base, passes: [facingPageMargins()] })).facingPageMargins).toBe(true);
  });
});
