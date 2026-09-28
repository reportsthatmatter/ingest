import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import {
  contentsOutline,
  doubleSpaced,
  numberedFindings,
  runningFurniture,
  type Pass,
} from "../src/passes";
import { blocksToMarkdown, toBlocks, readContentsOutline } from "../src/paragraphs";
import { collapseDoubleSpacing, stripRepeatedPageFurniture, type SplitPage } from "../src/clean";
import { renderMarkdown } from "../src/markdown";

// United States v. Philip Morris, amended final opinion (2006): PDF p.22 is a
// contents page; pp.1296-1297 open section V(G)(6) and findings 3434-3439;
// p.431 carries finding 1028 above a long single-spaced quotation.
const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

const run = (names: string[], passes: Pass[]) =>
  ingestPageGroups(
    [names.map((name, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines: fixture(name) }))],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  ).markdown;

const body = (name: string) => collapseDoubleSpacing(fixture(name).slice(1), 0);

describe("numberedFindings (reportsthatmatter-9ek)", () => {
  it("reads findings as paragraphs that open with their number, never as a list", () => {
    const blocks = toBlocks(body("pm-p1297"), 0, undefined, false, true, false, true, undefined, undefined, {
      next: 3437,
    });
    const findings = blocks.filter((b) => b.kind === "paragraph" && b.finding !== undefined);
    expect(findings.map((b) => (b.kind === "paragraph" ? b.finding : 0))).toEqual([3437, 3438, 3439]);

    const markdown = blocksToMarkdown(blocks);
    expect(markdown).toMatch(/^3437\\\. Projects recommended by this Advisory Group/m);
    const html = renderMarkdown(markdown);
    expect(html).not.toContain("<ol");
    expect(html).toContain('id="3437-projects-recommended-advisory-group"');
  });

  it("keeps a finding's first line out of the quotation beside it", () => {
    const blocks = toBlocks(body("pm-p1296"), 0, undefined, false, true, false, true, undefined, undefined, {
      next: 3434,
    });
    const quoted = blocks.filter((b) => b.kind === "quote").map((b) => (b.kind === "quote" ? b.text : ""));
    expect(quoted.some((text) => /343\d\./.test(text))).toBe(false);
    const opening = blocks.find((b) => b.kind === "paragraph" && b.finding === 3435);
    expect(opening?.kind === "paragraph" && opening.text).toMatch(
      /^3435\. As described above, Defendants recognized from the mid-1970s forward that the health effects/
    );
  });

  it("leaves a report without the pass as it was", () => {
    const blocks = toBlocks(body("pm-p1297"), 0);
    expect(blocks.some((b) => b.kind === "paragraph" && b.finding !== undefined)).toBe(false);
    expect(blocksToMarkdown(blocks)).toMatch(/^3437\. Projects/m);
  });
});

describe("doubleSpaced (reportsthatmatter-9ek)", () => {
  it("joins a double-spaced page's lines even where a quotation keeps it under the bar", () => {
    const lines = fixture("pm-p431").slice(1);
    const judged = toBlocks(collapseDoubleSpacing(lines), 0);
    expect(judged.some((b) => b.kind === "paragraph" && b.text.startsWith("1975. Both BATCo"))).toBe(true);

    const declared = toBlocks(collapseDoubleSpacing(lines, 0), 0);
    const finding = declared.find((b) => b.kind === "paragraph" && b.text.startsWith("1028."));
    expect(finding?.kind === "paragraph" && finding.text).toContain(
      'Smoking Deprivation on Smoking Behaviour," written by D.E. Creighton, in a report dated September 11, 1975. Both BATCo'
    );
  });

  it("keeps the break between two paragraphs of a quotation", () => {
    const declared = toBlocks(collapseDoubleSpacing(fixture("pm-p431").slice(1), 0), 0);
    const quotes = declared.filter((b) => b.kind === "quote");
    expect(quotes.some((b) => b.kind === "quote" && b.text.startsWith("Smoking is fairly irrational"))).toBe(true);
  });
});

describe("runningFurniture minShare (reportsthatmatter-9ek)", () => {
  const page = (index: number, top: string): SplitPage => ({
    index,
    volume: 1,
    pdfIndex: index,
    printed: null,
    body: [`Case 1:99-cv-02496-GK Page ${index} of 10`, top, "Body text of the page.", `-${index}-`],
    footnotes: [],
  });
  const pages = Array.from({ length: 10 }, (_, i) =>
    page(i + 1, i < 3 ? `${100 + i}-${200 + i} at ${300 + i} (US ${400 + i}).` : `Prose line ${"x".repeat(i)}.`)
  );

  it("reads a record citation that recurs, digits masked, as furniture by default", () => {
    const stripped = stripRepeatedPageFurniture(pages);
    expect(stripped[0].body.join("\n")).not.toContain("100-200 at 300 (US 400).");
  });

  it("keeps it where furniture must recur on half the pages", () => {
    const stripped = stripRepeatedPageFurniture(pages, 0.5);
    expect(stripped[0].body.join("\n")).toContain("100-200 at 300 (US 400).");
    expect(stripped[0].body.join("\n")).not.toContain("Case 1:99-cv-02496-GK");
  });

  it("is what the pass passes on", () => {
    expect(runningFurniture({ minShare: 0.5 }).run(pages)[0].body).toContain("100-200 at 300 (US 400).");
  });
});

describe("contentsOutline (reportsthatmatter-72f)", () => {
  it("reads a contents page's wrapped outline entries", () => {
    const entries = readContentsOutline(fixture("pm-p22"));
    const titles = entries.map((e) => `${e.label} ${e.title}`);
    expect(titles).toContain(
      "6. Defendants Undertook Joint Efforts to Undermine and Discredit the Scientific Consensus that ETS Causes Disease"
    );
    expect(titles).toContain(
      "a. Defendants Acted Through a Web of Coordinated and Interrelated International and Domestic Organizations"
    );
  });

  const headings = (markdown: string) => markdown.split("\n").filter((line) => /^#{2,4} /.test(line));

  it("cuts the heading at the line end and quotes its tail with the finding below, without the pass (the defect)", () => {
    const markdown = run(["pm-p1296"], [doubleSpaced()]);
    expect(headings(markdown)).toContain("### Defendants Undertook Joint Efforts to Undermine and Discredit the");
  });

  it("reads each heading whole, as the contents spells it, at its level", () => {
    const markdown = run(["pm-p22", "pm-p1296", "pm-p1297"], [doubleSpaced(), numberedFindings(), contentsOutline()]);
    const found = headings(markdown);
    expect(found).toContain(
      "### Defendants Undertook Joint Efforts to Undermine and Discredit the Scientific Consensus that ETS Causes Disease"
    );
    expect(found).toContain(
      "#### Defendants Acted Through a Web of Coordinated and Interrelated International and Domestic Organizations"
    );
    expect(found).toContain("#### 1975-1980: The Tobacco Institute ETS Advisory Group");
    // The contents page is laid out as its entries.
    expect(markdown).toMatch(/^- 6\\\. Defendants Undertook Joint Efforts .* — 1266$/m);
  });
});
