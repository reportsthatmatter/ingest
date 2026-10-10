import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { asteriskBreaks, contentsOutline, foiaRedactions, layoutRunOvers, letteredItems, romanFolios, runningFurniture, type Pass } from "../src/passes";
import { readContentsOutline } from "../src/paragraphs";
import { separateAsterisks } from "../src/redactions";
import { runOverByFace } from "../src/markers";
import type { Layout, LayoutLine } from "../src/layout";

// The Mueller report as DOJ publishes it (reportsthatmatter-gqsy.5). Fixtures are pdftotext -layout pages:
// Volume I PDF pp.1, 3, 4, 21, 75, 80 and Volume II PDF pp.4, 17.
const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").replace(/\n$/, "").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

const run = (names: string[], passes: Pass[]) =>
  ingestPageGroups(
    [names.map((name, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines: fixture(name) }))],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  ).markdown;

const headings = (markdown: string) => markdown.split("\n").filter((line) => /^#{2,4} /.test(line));

describe("contentsOutline on the Mueller report (reportsthatmatter-gqsy.5)", () => {
  it("reads a lower-case roman label, 'ii.', as a contents entry", () => {
    const titles = readContentsOutline(fixture("mueller-v1-p4")).map((e) => `${e.label} ${e.title}`);
    expect(titles).toContain("ii. Post-LOI Contacts with Individuals in Russia");
    expect(titles).toContain("ii. Candidate Trump's Opportunities to Travel to Russia");
  });

  it("ends an entry on ellipsis leaders ('Acts……… 162')", () => {
    const titles = readContentsOutline(fixture("mueller-v2-p4")).map((e) => e.title);
    expect(titles.some((t) => /…/.test(t))).toBe(false);
    expect(titles).toContain("The Text of Section 1512(c)(2) Prohibits a Broad Range of Obstructive Acts");
  });

  it("the defect: an OCR-misspelt heading on a scanned page is not read as the entry", () => {
    const md = run(["mueller-v1-p3", "mueller-v1-p4", "mueller-v1-p75"], [contentsOutline()]);
    expect(headings(md)).not.toContain("### Trump Tower Moscow Project");
    expect(md).toContain("1. Trnmp Tower Moscow Project");
  });

  it("with { scanned: true } reads it as the entry, spelt as the contents spells it", () => {
    const md = run(["mueller-v1-p3", "mueller-v1-p4", "mueller-v1-p75"], [contentsOutline({ scanned: true })]);
    expect(headings(md)).toContain("### Trump Tower Moscow Project");
    expect(md).not.toContain("Trnmp Tower Moscow Project");
  });

  it("reads a body heading under a lower-case roman label", () => {
    const md = run(["mueller-v1-p3", "mueller-v1-p4", "mueller-v1-p80"], [contentsOutline({ scanned: true })]);
    expect(headings(md)).toContain("#### Post-LOI Contacts with Individuals in Russia");
  });
});

describe("romanFolios and a rule cited in the running head (reportsthatmatter-gqsy.5)", () => {
  it("a contents page folioed 'i' keeps it, not the head's 'Fed. R. Crim. P. 6(e)'", () => {
    const md = run(["mueller-v1-p1", "mueller-v1-p3", "mueller-v1-p4"], [runningFurniture(), romanFolios()]);
    expect(md).toContain("%%page i%%");
    expect(md).toContain("%%page ii%%");
    expect(md).not.toMatch(/%%page 6/);
  });
});

describe("asteriskBreaks (reportsthatmatter-gqsy.5)", () => {
  it("separates a centred '* * *' from the lines either side", () => {
    expect(separateAsterisks(["a line.", "      *   *   *", "        Next paragraph"])).toEqual([
      "a line.",
      "",
      "      *   *   *",
      "",
      "        Next paragraph",
    ]);
    expect(separateAsterisks(["no break here"])).toEqual(["no break here"]);
  });

  it("the defect: the break and the next paragraph's first line are quoted, its other lines cut off", () => {
    const md = run(["mueller-v1-p21"], [foiaRedactions()]);
    expect(md).toMatch(/^> \*\*\* From its inception/m);
  });

  it("with the pass the paragraph after the break is whole", () => {
    const md = run(["mueller-v1-p21"], [foiaRedactions(), asteriskBreaks()]);
    expect(md).toMatch(/^From its inception, the Office recognized that its investigation could identify foreign intelligence and counterintelligence information/m);
  });
});

describe("letteredItems with one space after a bracketed letter (reportsthatmatter-gqsy.5)", () => {
  it("reads '(a) The President's…' and its hanging lines as one item", () => {
    const md = run(["mueller-v2-p17"], [letteredItems()]);
    expect(md).toMatch(/^\(a\) The President.s January 27, 2017 dinner with former FBI Director James Comey in which the President reportedly asked/m);
  });
});

describe("layoutRunOvers (reportsthatmatter-gqsy.5)", () => {
  const line = (text: string, size: number, top: number): LayoutLine => ({ text, size, top } as unknown as LayoutLine);
  const layoutOf = (lines: LayoutLine[]): Layout =>
    ({
      volumes: 1,
      lines: () => lines,
      page: () => ({ bodyFont: "TimesNewRomanPSMT|18|#000000", lines } as never),
      pages: () => [1],
      bodyFont: { family: "TimesNewRomanPSMT", size: 18 } as never,
      checksums: [],
    }) as Layout;
  // Volume II PDF p.54: note 276's tail heads the page's note block, below the body's last, unfinished line.
  const body = [
    "        That afternoon, Sessions announced his decision to recuse “from any existing or future",
    "States.”285 Sessions believed the decision to recuse was not a close call, given the applicable",
    "",
    "",
    "",
    "of James B. Comey, former Director of the FBI) (“[H]e called me one day. . . . [H]e just called to check in",
    "and tell me I was doing an awesome job, and wanted to see how I was doing.”).",
  ];

  it("takes the trailing run set two points smaller than the body, below a gap", () => {
    const layout = layoutOf([
      line("That afternoon, Sessions announced his decision to recuse “from any existing or future", 18, 800),
      line("States.”285 Sessions believed the decision to recuse was not a close call, given the applicable", 18, 820),
      line("of James B. Comey, former Director of the FBI) (“[H]e called me one day. . . . [H]e just called to check in", 16, 880),
      line("and tell me I was doing an awesome job, and wanted to see how I was doing.”).", 16, 900),
    ]);
    expect(runOverByFace(layout, 1, 1, body)).toBe(2);
  });

  it("leaves a run in the body's size, and a run without a gap above it", () => {
    const sameSize = layoutOf(body.filter((l) => l.trim()).map((t, i) => line(t.trim(), 18, 800 + 20 * i)));
    expect(runOverByFace(sameSize, 1, 1, body)).toBe(0);
    const small = layoutOf(body.filter((l) => l.trim()).map((t, i) => line(t.trim(), 16, 800 + 20 * i)));
    expect(runOverByFace(small, 1, 1, body.filter((l) => l.trim()))).toBe(0);
  });

  it("resolves from the declared passes", () => {
    expect(resolvePasses(pipeline({ ...base, passes: [layoutRunOvers(), asteriskBreaks()] }))).toMatchObject({
      layoutRunOvers: true,
      asteriskBreaks: true,
    });
  });
});

describe("contentsOutline: one spaced dot as a leader, and centredMinor (reportsthatmatter-gqsy.5)", () => {
  it("ends an entry on a single dot set apart by spaces", () => {
    const titles = readContentsOutline([
      "      1. Potential Coordination: Conspiracy and Collusion............................................. 180",
      "      2. Potential Coordination: Foreign Agent Statutes (FARA and 18 U.S.C. § 951) . 181",
      "           a. Governing Law............................................................................... 181",
    ]).map((e) => `${e.label} ${e.title}`);
    expect(titles).toEqual([
      "1. Potential Coordination: Conspiracy and Collusion",
      "2. Potential Coordination: Foreign Agent Statutes (FARA and 18 U.S.C. § 951)",
      "a. Governing Law",
    ]);
    // an abbreviation's own full stop before the page is not a leader
    const titles2 = readContentsOutline(["A. Smith v. Jones Inc. 26", "B. Two ..... 27", "C. Three ..... 28", "D. Four ..... 29"]).map((e) => e.title);
    expect(titles2).not.toContain("Smith v. Jones Inc");
  });

  const page = (lines: string[]) => lines;
  const contents = page([
    "                         TABLE OF CONTENTS – VOLUME II",
    "INTRODUCTION TO VOLUME II .............................................. 1",
    "EXECUTIVE SUMMARY TO VOLUME II ......................................... 3",
    "I. BACKGROUND LEGAL AND EVIDENTIARY PRINCIPLES ......................... 9",
    "     A. Legal Framework of Obstruction of Justice ....................... 9",
    "IV. CONCLUSION ........................................................ 182",
  ]);
  const body = page([
    "                              INTRODUCTION TO VOLUME II",
    "",
    "        This report is submitted to the Attorney General pursuant to 28 C.F.R. § 600.8(c), which",
    "states that the Special Counsel shall provide a confidential report to the Attorney General.",
    "",
    "                                     CONCLUSION",
    "",
    "        Because we determined not to make a traditional prosecutorial judgment, we did not draw",
    "ultimate conclusions about the President’s conduct, and so on for the rest of this paragraph.",
  ]);
  const runPages = (passes: Pass[]) =>
    ingestPageGroups(
      [[contents, body].map((lines, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines }))],
      { title: "T" },
      resolvePasses(pipeline({ ...base, passes }))
    ).markdown;

  it("the defect: a centred subhead the contents does not number is a top-level section", () => {
    expect(headings(runPages([contentsOutline()]))).toContain("## CONCLUSION");
  });

  it("with centredMinor it is a subhead; a centred title the contents lists keeps its level", () => {
    const found = headings(runPages([contentsOutline({ centredMinor: true })]));
    expect(found).toContain("#### CONCLUSION");
    expect(found).toContain("## INTRODUCTION TO VOLUME II");
  });
});
