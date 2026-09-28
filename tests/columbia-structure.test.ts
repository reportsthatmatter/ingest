import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectGutter, splitColumns } from "../src/columns";
import { stripRepeatedPageFurniture, type SplitPage } from "../src/clean";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import {
  columns,
  hangingIndents,
  numberedSections,
  runningFurniture,
  unlistedHeadingsMinor,
  type Pass,
} from "../src/passes";
import { numberedContents } from "../src/paragraphs";

// The Columbia Accident Investigation Board report, Volume I
// (reportsthatmatter-tk8): real pages, chosen for the defects they carried.
const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };
const run = (names: string[], passes: Pass[]) =>
  ingestPageGroups(
    [names.map((name, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines: fixture(name) }))],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  ).markdown;

describe("columns on Columbia's transcript page (p. 42)", () => {
  it("keeps each speaker label in its own column, whole", () => {
    const split = splitColumns(fixture("columbia-mission-control")).join("\n");
    expect(split).not.toMatch(/initiated\.\s+GNC:/);
    expect(split).toMatch(/^GNC:\s+“Flight – GNC\.”/m);
    expect(split).toMatch(/^Flight:\s+“Everything look good/m);
    expect(split).toMatch(/^MMACS:\s+“The other temps are normal/m);
    expect(split).not.toMatch(/^(light|MACS|NC):/m);
  });
});

describe("columns on a page that also carries a chart (p. 102)", () => {
  it("finds the gutter the prose straddles, not the blank past a chart row", () => {
    const gutter = detectGutter(fixture("columbia-chart-page"));
    expect(gutter).not.toBeNull();
    expect(gutter!.start).toBeGreaterThan(55);
    expect(gutter!.start).toBeLessThan(72);
  });

  it("reads section 5.3's heading on its own", () => {
    const split = splitColumns(fixture("columbia-chart-page"));
    expect(split.some((line) => /^\s*5\.3 AN AGENCY TRYING TO DO TOO MUCH\s*$/.test(line))).toBe(true);
  });
});

describe("columns at the foot of a page (p. 174)", () => {
  it("keeps the last lines of each column in their columns", () => {
    const split = splitColumns(fixture("columbia-findings-foot")).join("\n");
    expect(split).not.toMatch(/unequivocally\s+undocking/);
  });
});

describe("runningFurniture({ numbersTrackPages })", () => {
  const page = (index: number, lines: string[]): SplitPage => ({
    index,
    volume: 1,
    pdfIndex: index,
    printed: null,
    body: [...lines, "", "text", "more text", "", `${index}   Report Volume I   August 2003`],
    footnotes: [],
  });
  const pages = [21, 27, 49, 85, 99].map((n, i) => page(n, [`CHAPTER ${i + 1}`, "", "Title"]));

  it("strips a chapter banner as furniture by default (the defect)", () => {
    const out = stripRepeatedPageFurniture(pages);
    expect(out[0].body).not.toContain("CHAPTER 1");
    expect(out[0].printed).toBe(1);
  });

  it("keeps a banner whose number does not advance with the page", () => {
    const out = stripRepeatedPageFurniture(pages, { numbersTrackPages: true });
    expect(out[0].body).toContain("CHAPTER 1");
    expect(out[0].printed).toBe(21);
    expect(out[0].body.some((line) => line.includes("Report Volume I"))).toBe(false);
  });
});

describe("numberedSections on Columbia's contents", () => {
  const listed = numberedContents(["columbia-contents-p4", "columbia-contents-p5"].flatMap(fixture));

  it("reads titles without their leaders, including one run into its page number", () => {
    expect(listed.sections.get("1.1")).toBe("Genesis of the Space Transportation System");
    expect(listed.sections.get("6.1")).toBe("A History of Foam Anomalies");
    expect(listed.sections.get("10.12")).toBe("Leadership/Managerial Training");
  });

  it("reads the parts, chapters and appendices it names by label", () => {
    expect(listed.divisions.get("part one")).toBe("THE ACCIDENT");
    expect(listed.divisions.get("chapter 1")).toBe("The Evolution of the Space Shuttle Program");
    expect(listed.divisions.get("chapter 11")).toBe("Recommendations");
    expect(listed.divisions.get("appendix a")).toBe("The Investigation");
  });

  it("opens a chapter on its banner and title", () => {
    const md = run(
      ["columbia-contents-p4", "columbia-contents-p5", "columbia-chapter-opening"],
      [columns(), runningFurniture({ numbersTrackPages: true }), numberedSections()]
    );
    expect(md).toMatch(/^## Chapter 1: The Evolution of the Space Shuttle Program$/m);
    expect(md).toMatch(/^## 1\.1 Genesis of the Space Transportation System$/m);
    expect(md).not.toMatch(/^> The Evolution of the/m);
  });
});

describe("hangingIndents and unlistedHeadingsMinor", () => {
  const passes = [
    columns(),
    runningFurniture({ numbersTrackPages: true }),
    numberedSections(),
    unlistedHeadingsMinor(),
    hangingIndents(),
  ];

  it("reads a finding set under a hanging label as one paragraph", () => {
    const md = run(["columbia-contents-p4", "columbia-contents-p5", "columbia-findings-foot"], passes);
    expect(md).toMatch(
      /^F6\.4-1 The repair option, while logistically viable using existing materials onboard Columbia, relied on so many uncertainties that NASA rated this option "high risk\."$/m
    );
    expect(md).not.toMatch(/^> .*existing materials onboard/m);
  });

  it("sets a heading the contents does not list as a minor one", () => {
    const md = run(["columbia-contents-p4", "columbia-contents-p5", "columbia-mission-control"], passes);
    expect(md).toMatch(/^#### MISSION CONTROL CENTER COMMUNICATIONS$/m);
  });
});
