import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { numberedParagraphs, escapeNumberedParagraphs, type Pass } from "../src/passes";
import { renderMarkdown } from "../src/markdown";

// The Iraq Inquiry Executive Summary numbers its paragraphs "13.", "20.", …
// straight through, at the left margin — unlike Philip Morris's findings,
// which sit indented past it. Written to markdown as a bare "20. …" that is
// an ordered-list item to Markdown, with no paragraph id: only ~60 of ~950
// paragraphs were citable (reportsthatmatter-4qw). PDF p.10 carries paragraph
// 20, "the diplomatic options had not at that stage been exhausted" — the
// live spot-check paragraph.
const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

const run = (passes: Pass[]) =>
  ingestPageGroups(
    [[{ index: 1, volume: 1, pdfIndex: 1, lines: fixture("chilcot-p10") }]],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  ).markdown;

describe("escapeNumberedParagraphs (reportsthatmatter-4qw)", () => {
  it("numberedParagraphs alone now escapes the margin number by default (reportsthatmatter-mv1t)", () => {
    const markdown = run([numberedParagraphs()]);
    expect(markdown).toMatch(/^20\\\. In the Inquiry.s view, the diplomatic options/m);
    expect(renderMarkdown(markdown)).not.toContain("<ol");
  });

  it("escapes the margin number once declared, so it renders as a paragraph with a citable id", () => {
    const markdown = run([numberedParagraphs(), escapeNumberedParagraphs()]);
    expect(markdown).toMatch(/^20\\\. In the Inquiry.s view, the diplomatic options/m);
    const html = renderMarkdown(markdown);
    expect(html).not.toContain("<ol");
    // Derived from the paragraph's own opening words, same as Philip Morris's
    // findings ("3437-projects-…") — never positional.
    expect(html).toContain('id="20-inquiry-s-view-diplomatic"');
  });

  it("throws if declared without numberedParagraphs, so a report can't opt into escaping numbers it never split on", () => {
    expect(() => pipeline({ ...base, passes: [escapeNumberedParagraphs()] })).toThrow(
      /escapeNumberedParagraphs.*numberedParagraphs/
    );
  });
});
