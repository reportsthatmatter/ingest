import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { listedHeadings, unmarkedHeadings, numberedParagraphs, type Pass } from "../src/passes";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

// The Iraq Inquiry Executive Summary's own contents (PDF p.5), then a body
// page (PDF p.10) where "UK policy before 9/11" sits between two numbered
// paragraphs with no capital, number or division label of its own
// (reportsthatmatter-ixe).
const names = ["chilcot-contents", "chilcot-uk-policy"];
const pages = names.map((name, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines: fixture(name) }));

const headings = (markdown: string) =>
  markdown.split("\n").filter((line) => /^#{2,4} /.test(line) && line !== "## Notes");

const run = (passes: Pass[]) =>
  ingestPageGroups([pages], { title: "T" }, resolvePasses(pipeline({ ...base, passes }))).markdown;

describe("unmarkedHeadings (reportsthatmatter-ixe)", () => {
  it("fuses the heading into the numbered paragraph after it without the pass (the defect)", () => {
    const markdown = run([numberedParagraphs(), listedHeadings()]);
    expect(markdown).toContain(
      "UK policy before 9/11 26. Before the attacks on the US on 11 September 2001"
    );
    expect(headings(markdown).some((h) => h.includes("UK policy before 9/11"))).toBe(false);
  });

  it("reads it as its own heading, once declared", () => {
    const markdown = run([numberedParagraphs(), listedHeadings(), unmarkedHeadings()]);
    expect(headings(markdown)).toContain("### UK policy before 9/11");
    // The paragraph after it is untouched, and starts clean.
    expect(markdown).toMatch(/^26\. Before the attacks on the US on 11 September 2001/m);
    expect(markdown).not.toContain("UK policy before 9/11 26.");
  });

  it("does nothing without listedHeadings — there is no contents to match against", () => {
    const withPass = run([numberedParagraphs(), unmarkedHeadings()]);
    const without = run([numberedParagraphs()]);
    expect(withPass).toBe(without);
  });

  it("keeps two bare headings with no blank line between them separate", () => {
    // p.90: "The post‑conflict period" directly over "Occupation", its own
    // first subsection — nothing wraps a title across these two lines, so
    // neither may absorb the other the way a heading whose title runs onto
    // a second line does.
    const withOccupation = [
      pages[0],
      { index: 2, volume: 1, pdfIndex: 2, lines: fixture("chilcot-contents-2") },
      { index: 3, volume: 1, pdfIndex: 3, lines: fixture("chilcot-occupation") },
    ];
    const markdown = ingestPageGroups(
      [withOccupation],
      { title: "T" },
      resolvePasses(pipeline({ ...base, passes: [numberedParagraphs(), listedHeadings(), unmarkedHeadings()] }))
    ).markdown;
    expect(headings(markdown)).toContain("### The post‑conflict period");
    expect(headings(markdown)).toContain("### Occupation");
    expect(headings(markdown).some((h) => h.includes("period Occupation"))).toBe(false);
  });
});
