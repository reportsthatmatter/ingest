import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import {
  allCapsHeadings,
  geometry,
  listedDivisions,
  wrappedHeadings,
  type Pass,
} from "../src/passes";
import { divisionContents } from "../src/paragraphs";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

const run = (names: string[], passes: Pass[]) =>
  ingestPageGroups(
    [names.map((name, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines: fixture(name) }))],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  );

const headings = (markdown: string) =>
  markdown.split("\n").filter((line) => /^#{2,3} /.test(line) && line !== "## Notes");

// Deep Water (us-deepwater-horizon): its contents, set with a page after a
// gap rather than dot leaders, then the Foreword and division openers.
const contents = "deepwater-contents";
const openers = [
  "deepwater-foreword", // "Photo: …" then "Foreword" over its first paragraph
  "deepwater-chapter-1-opening", // "Chapter One" over a nine-line title, no blank before the text
  "deepwater-chapter-3-opening", // the same, with a pull quote and photo credit below
  "deepwater-part-2", // "Part II" over a two-line title
  "deepwater-chapter-9-opening",
  "deepwater-appendix-a", // "Appendix A", a blank, "Commission Members"
  "deepwater-appendix-c", // "Executive Order-- National Commission on…" for "Executive Order"
  "deepwater-index", // "INDEX" in capitals
];

describe("listedDivisions (reportsthatmatter-a0z)", () => {
  it("reads every division the contents lists, chapters with the title below them", () => {
    const listed = divisionContents(fixture(contents));
    expect(listed.map((entry) => entry.kind ?? entry.title)).toEqual([
      "Foreword",
      "part", "chapter", "chapter", "chapter",
      "part", "chapter", "chapter", "chapter", "chapter",
      "part", "chapter", "chapter", "chapter",
      "Endnotes",
      "appendix", "appendix", "appendix", "appendix", "appendix", "appendix",
      "Index",
    ]);
    expect(listed[4]).toEqual({
      kind: "chapter",
      number: "3",
      title:
        '"It was like pulling teeth." Oversight—and Oversights—in Regulating Deepwater Energy Exploration and Production in the Gulf of Mexico',
    });
    expect(listed[5]).toEqual({
      kind: "part",
      number: "2",
      title: "Explosion and Aftermath: The Causes and Consequences of the Disaster",
    });
  });

  it("reads each chapter's title into its first paragraph without the pass (the defect)", () => {
    const { markdown } = run([contents, ...openers], [geometry("per-page")]);
    expect(headings(markdown).some((h) => h.includes("Chapter One"))).toBe(false);
    expect(markdown).toMatch(/^Chapter One "Everyone involved/m);
  });

  it("gives each division its own heading, the body's label over the contents' title", () => {
    const { markdown } = run(
      [contents, ...openers],
      [geometry("per-page"), listedDivisions(), allCapsHeadings(false)]
    );
    expect(headings(markdown)).toEqual([
      "## Foreword",
      '### Chapter One: "Everyone involved with the job…was completely satisfied…." The Deepwater Horizon, the Macondo Well, and Sudden Death on the Gulf of Mexico',
      '### Chapter Three: "It was like pulling teeth." Oversight—and Oversights—in Regulating Deepwater Energy Exploration and Production in the Gulf of Mexico',
      "## Part II: Explosion and Aftermath: The Causes and Consequences of the Disaster",
      '### Chapter Nine: "Develop options for guarding against, and mitigating the impact of, oil spills associated with offshore drilling." Investing in Safety, Investing in Response, Investing in the Gulf',
      "## Appendix A: Commission Members",
      "## Appendix C: Executive Order-- National Commission on the BP Deepwater Horizon Oil Spill and Offshore Drilling",
      "## Index",
    ]);
  });

  it("keeps the text under a chapter heading as prose", () => {
    const { markdown } = run([contents, ...openers], [geometry("per-page"), listedDivisions()]);
    expect(markdown).toMatch(/Sudden Death on the Gulf of Mexico\n\nAt 5:45 a\.m\. on Tuesday, April 20, 2010, a Halliburton/);
    expect(markdown).toMatch(/^## Foreword\n\nThe explosion that tore through/m);
  });
});

describe("wrappedHeadings (reportsthatmatter-a0z)", () => {
  const pages = ["deepwater-wrapped-heading-c", "deepwater-wrapped-heading"];

  it("stops a wrapped numbered heading at its line end without the pass (the defect)", () => {
    const found = headings(run(pages, [geometry("per-page")]).markdown);
    expect(found).toContain("### Strengthening Oil Spill Response, Planning, and");
    expect(found).toContain("### The Need for Increased Research and Development to Improve Spill");
  });

  it("folds the title's last short line into the heading", () => {
    const { markdown } = run(pages, [geometry("per-page"), wrappedHeadings()]);
    const found = headings(markdown);
    expect(found).toContain("### Strengthening Oil Spill Response, Planning, and Capacity");
    expect(found).toContain(
      "### The Need for Increased Research and Development to Improve Spill Response"
    );
    expect(found).toContain("### The Need for Improved Oil Spill Response Planning");
    expect(markdown).toMatch(/Improve Spill Response\n\nThe technology available for cleaning up oil spills/);
  });
});

describe('geometry("per-page") on a book set with a gutter (reportsthatmatter-eyc)', () => {
  // Deep Water's left-hand pages sit four columns further in than its
  // right-hand ones.
  const pages = [
    "deepwater-chapter-1-opening",
    "deepwater-chapter-3-opening",
    "deepwater-chapter-9-opening",
    "deepwater-verso",
  ];

  it("reads a left-hand page as quotation against one document margin (the defect)", () => {
    const { markdown } = run(pages, []);
    expect(markdown).toMatch(/^> The air smelled and tasted of some kind of fuel/m);
  });

  it("reads it as prose with each page's own margin", () => {
    const { markdown } = run(pages, [geometry("per-page")]);
    expect(markdown).not.toMatch(/^> /m);
    expect(markdown).toMatch(/^The air smelled and tasted of some kind of fuel\. A second explosion roared through, flinging Bertone/m);
  });
});
