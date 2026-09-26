import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { listedHeadings } from "../src/passes";
import { contentsTitles, headingKey } from "../src/paragraphs";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

// The PSI report's own contents (PDF pp.3-4), then body pages whose quoted
// exhibits and run-in titles read as headings (reportsthatmatter-h0l).
const names = [
  "psi-contents",
  "psi-contents-p4",
  "psi-employee-goals", // p.119: a performance review's numbered goals, quoted
  "psi-section-heading", // p.150: "F. Destructive Compensation Practices", a real one
  "psi-walk-up-music", // p.153: an awards-night script, quoted
  "psi-privileged-exhibit", // p.309: a quoted S&P draft policy's caps banner
  "psi-run-in-title", // p.384: "4. Conflict Between … Trading. In 2007, Goldman"
];
const pages = names.map((name, i) => ({
  index: i + 1,
  volume: 1,
  pdfIndex: i + 1,
  lines: fixture(name),
}));

const headings = (markdown: string) =>
  markdown.split("\n").filter((line) => /^#{2,3} /.test(line) && line !== "## Notes");

const run = (passes: ReturnType<typeof listedHeadings>[]) =>
  ingestPageGroups([pages], { title: "T" }, resolvePasses(pipeline({ ...base, passes })))
    .markdown;

describe("listedHeadings (reportsthatmatter-h0l)", () => {
  it("reads quoted exhibits and run-in titles as headings without the pass (the defect)", () => {
    const found = headings(run([]));
    expect(found.some((h) => h.startsWith("## WALK-UP MUSIC FOR DAVID SCHNEIDER"))).toBe(true);
    expect(found.some((h) => h.includes("PRIVILEGED AND CONFIDENTIAL"))).toBe(true);
    expect(found.some((h) => h.includes("Customer Satisfaction (Total HL)"))).toBe(true);
    expect(found.some((h) => h.startsWith("### Conflict Between Client Interests"))).toBe(true);
  });

  it("keeps only the headings the report's own contents lists", () => {
    const markdown = run([listedHeadings()]);
    const found = headings(markdown);
    // The contents page keeps its own title; the body keeps its real section.
    expect(found).toEqual(["## TABLE OF CONTENTS", "### Destructive Compensation Practices"]);
  });

  it("leaves a demoted line's text whole and in its quotation", () => {
    const markdown = run([listedHeadings()]);
    // The marker and the "2007" a heading would have stripped are kept.
    expect(markdown).toContain("1. Achieve Net Income - $340 MM for 2007");
    // The script's cue lines stay inside the quoted script.
    expect(markdown).toMatch(/^> WALK-UP MUSIC FOR DAVID SCHNEIDER/m);
    expect(markdown).toMatch(/^> "\*\*\*PRIVILEGED AND CONFIDENTIAL/m);
    // A run-in title stays at the head of its own finding, set like the
    // findings either side of it ("> 3. Shorting the Mortgage Market. As…").
    expect(markdown).toMatch(
      /^> 4\. Conflict Between Client Interests and Proprietary Trading\. In 2007, Goldman/m
    );
  });

  it("changes nothing when the report has no dot-leader contents", () => {
    const body = pages.slice(2);
    const resolved = resolvePasses(pipeline({ ...base, passes: [listedHeadings()] }));
    const withPass = ingestPageGroups([body], { title: "T" }, resolved).markdown;
    const without = ingestPageGroups(
      [body],
      { title: "T" },
      resolvePasses(pipeline({ ...base, passes: [] }))
    ).markdown;
    expect(withPass).toBe(without);
  });
});

describe("contentsTitles", () => {
  it("reads every entry off a contents page whose leaders are spaced dots", () => {
    const titles = contentsTitles(fixture("psi-contents"));
    expect(titles).toContain("I. EXECUTIVE SUMMARY");
    expect(titles).toContain("A. Subcommittee Investigation");
    // Only the line carrying the leaders: its label wrapped onto the line above.
    expect(titles).toContain("CASE STUDY OF WASHINGTON MUTUAL BANK");
    expect(titles).toContain("(3) Inflated Credit Ratings: Case Study of Moody’s and Standard & Poor’s");
  });

  it("reads nothing off a body page", () => {
    expect(contentsTitles(fixture("psi-section-heading"))).toEqual([]);
  });
});

describe("headingKey", () => {
  it("matches a heading to its entry whatever the marker, quotes and case", () => {
    expect(headingKey("CC. Timberwolf I")).toBe(headingKey("Timberwolf I"));
    expect(headingKey("(3) Long Beach")).toBe(headingKey("Long Beach"));
    expect(headingKey("V. CASE STUDY OF MOODY’S")).toBe(headingKey("CASE STUDY OF MOODY'S"));
    expect(headingKey("A. Subcommittee Investigation and Findings of Fact.")).toBe(
      headingKey("Subcommittee Investigation and Findings of Fact")
    );
  });
});
