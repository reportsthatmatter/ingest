import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { ingestPageGroups } from "../src/pipeline";
import type { Block } from "../src/paragraphs";
import { ASSERTION_KINDS, checkGoldenPage, finalBlocks, parseGolden, scoreOracle } from "../src/golden";
import { draftGolden, pageFixture, renderPage } from "../src/pageview";

const fixture = (name: string) => {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/oracle/${name}.json`, import.meta.url), "utf8"));
  return { xml: f.xml as string, layout: buildLayout([parseLayoutXml(f.xml)]), blocks: f.blocks as Block[], footnotes: f.footnotes };
};

const entry = (extra: string) =>
  parseGolden(`pages:\n  - pdf: 34\n    verified_by: "test"\n${extra}`).pages[0];

describe("parseGolden", () => {
  it("reads blocks, notes, markers and the must_* lists", () => {
    const p = entry(`    blocks:
      - heading: "Ibrox Park 1971 and the Wheatley Report"
        level: 2
      - paragraph: {start: "1.28 In January 1971", end: "the stairwell.", notes: [3]}
      - quote: {start: "I am", continues: true}
    footnotes: [3]
    markers: []
    must_contain: ["a run"]
    must_be_quote: ["I am"]
    xfail: reportsthatmatter-xyz
    xfail_only: [blocks]
`);
    expect(p.blocks).toHaveLength(3);
    expect(p.blocks![0]).toMatchObject({ type: "heading", level: 2 });
    expect(p.blocks![2]).toMatchObject({ type: "quote", continues: true });
    expect(p.markers).toEqual([]);
    expect(p.xfail_only).toEqual(["blocks"]);
    expect(p.volume).toBe(1);
  });

  it("refuses an entry that does not say who verified it, an unterminated block, or an unknown xfail_only kind", () => {
    expect(() => parseGolden("pages:\n  - pdf: 3\n")).toThrow(/verified_by/);
    expect(() => entry(`    blocks:\n      - paragraph: {start: "a"}\n`)).toThrow(/needs an end/);
    expect(() => entry(`    xfail: x\n    xfail_only: [looks]\n`)).toThrow(/unknown kind/);
  });

  it("an assertion left out is not asserted: [] and absent differ", () => {
    const p = entry(`    must_contain: []\n`);
    expect(p.blocks).toBeUndefined();
    expect(p.footnotes).toBeUndefined();
    expect(p.markers).toBeUndefined();
  });
});

describe("checkGoldenPage on Hillsborough PDF p.34 (printed 30)", () => {
  const { blocks, footnotes } = fixture("hillsborough-p34");

  it("fails the two maroon subheads the pipeline read as body, and says which kind of assertion failed", () => {
    const r = checkGoldenPage(
      entry(`    blocks:
      - heading: "Ibrox Park 1971 and the Wheatley Report"
      - paragraph: {start: "1.28 In January 1971", end: "foot of the stairwell."}
`),
      blocks,
      footnotes
    );
    expect(r.failing).toEqual(["blocks"]);
    expect(r.problems[0]).toMatch(/block\(s\) start here|pipeline made a paragraph/);
    expect(r.truth["headings-missed"]).toBe(1);
  });

  it("passes the facts that hold, so an xfail page still guards them", () => {
    const r = checkGoldenPage(
      entry(`    footnotes: []
    markers: []
    headings: []
    must_contain: ["1.28 In January 1971 66 spectators died after a crush at Ibrox stadium"]
    must_not_be_quote: ["66 spectators died"]
`),
      blocks,
      footnotes
    );
    // (headings: [] is what the pipeline made; the page itself has two, which a real entry would list)
    expect(r.failing).toEqual([]);
  });

  it("must_be_quote and separate catch a quotation or two table rows run together", () => {
    const r = checkGoldenPage(
      entry(`    must_be_quote: ["1.29 The Ibrox tragedy"]
    separate: ["1.28 In January 1971", "1.29 The Ibrox tragedy"]
`),
      blocks,
      footnotes
    );
    expect(r.failing).toEqual(["must_be_quote"]);
  });

  it("compares a heading without its enumerator", () => {
    const heading = (text: string) =>
      checkGoldenPage(entry(`    headings: ["${text}"]\n`), [{ kind: "heading", level: 2, text: "THE RESULTS OF THE INVESTIGATION", at: { volume: 1, pdfIndex: 34, printed: 1 } }], []).failing;
    expect(heading("I. THE RESULTS OF THE INVESTIGATION")).toEqual([]);
    expect(heading("(3) THE RESULTS OF THE INVESTIGATION")).toEqual([]);
    expect(heading("THE RESULTS")).toEqual(["headings"]);
  });
});

describe("scoreOracle", () => {
  const zero = { "headings-missed": 0, "headings-spurious": 0, "markers-unlinked": 0, "markers-spurious": 0, "paragraphs-oversplit": 0, "paragraphs-merged": 0, "quotes-spurious": 0, "quotes-missed": 0 };
  it("matches counts one for one per page and skips a signal the entry does not speak to", () => {
    const rows = [
      { oracle: { ...zero, "headings-missed": 3 }, truth: { "headings-missed": 2 } },
      { oracle: { ...zero, "headings-missed": 1 }, truth: { "headings-missed": 4 } },
      { oracle: undefined, truth: { "headings-missed": 1 } },
      { oracle: { ...zero, "paragraphs-merged": 9 }, truth: {} },
    ];
    const s = scoreOracle(rows).find((x) => x.signal === "headings-missed")!;
    expect([s.tp, s.fp, s.fn]).toEqual([2 + 1, 1, 0 + 3 + 1]);
    expect(scoreOracle(rows).find((x) => x.signal === "paragraphs-merged")).toMatchObject({ tp: 0, fp: 0, fn: 0 });
  });
});

describe("the page inspection kit", () => {
  const { xml, layout, blocks, footnotes } = fixture("hillsborough-p34");

  it("prints layout lines beside the blocks, pinning each block to the line it opens", () => {
    const text = renderPage("uk-hillsborough-panel", layout, blocks, footnotes, 1, 34);
    expect(text).toContain("PDF page 34 · printed 30");
    expect(text).toMatch(/B2 paragraph\s+Ibrox Park 1971 and the Wheatley Report/);
    expect(text).toContain("BLOCKS the pipeline made starting on this page");
  });

  it("drafts a golden entry that is plainly not yet verified", () => {
    const draft = draftGolden(blocks, footnotes, layout, 1, 34);
    expect(draft).toContain("- pdf: 34");
    expect(draft).toContain('verified_by: ""');
    expect(draft).toContain('- paragraph: {start: "Ibrox Park 1971 and the Wheatley"');
  });

  it("cuts a fixture in the shape the oracle tests read, from one page of a larger layout XML", () => {
    const two = xml.replace("</pdf2xml>", "") + xml.replace(/^[\s\S]*?<page /, "<page ").replace('number="34"', 'number="35"');
    const f = pageFixture("test", `${two}</pdf2xml>`, blocks, footnotes, 1, 34);
    expect(f.source).toBe("test");
    expect(f.xml).toContain('<page number="34"');
    expect(f.xml).not.toContain('<page number="35"');
    expect(f.blocks.every((b) => b.at?.pdfIndex === 34)).toBe(true);
  });
});

describe("finalBlocks and the pipeline's linkedText", () => {
  const page = (lines: string[], index: number) => ({ index, volume: 1, pdfIndex: index, lines });

  it("carries the text the reader gets: a flush marker linked, one block per chunk", () => {
    const result = ingestPageGroups(
      [
        [
          page(["Some body text sits on this page here.", "More body text keeps the column here.", "A third body line fills the page here.1", "", "1 A note about the third line."], 1),
        ],
      ],
      { title: "t" }
    );
    expect(result.linkedText).toBeDefined();
    expect(result.linkedText!.length).toBe(result.blocks!.length);
    const merged = finalBlocks(result).map((b) => (b.kind === "paragraph" ? b.text : "")).join(" ");
    expect(merged).toMatch(/here\.\[\^1\]|here\.1/);
  });

  it("falls back to the raw blocks without linkedText, and leaves a block the hyphen rejoin closed up as it was", () => {
    const blocks: Block[] = [{ kind: "paragraph", text: "raw" }];
    expect(finalBlocks({ blocks })).toBe(blocks);
    const two: Block[] = [{ kind: "paragraph", text: "fol-" }, { kind: "paragraph", text: "lowing" }];
    const out = finalBlocks({ blocks: two, linkedText: ["following", undefined] });
    expect(out[0]).toMatchObject({ text: "following" });
    expect(out[1]).toBe(two[1]);
  });

  it("undoes the escapes blocksToMarkdown adds to a numbered paragraph and a leading hash", () => {
    const blocks: Block[] = [{ kind: "paragraph", text: "x" }, { kind: "paragraph", text: "y" }];
    const out = finalBlocks({ blocks, linkedText: ["3437\\. Projects", "\\# not a heading"] });
    expect(out.map((b) => (b.kind === "paragraph" ? b.text : ""))).toEqual(["3437. Projects", "# not a heading"]);
  });

  it("names every kind of assertion once", () => {
    expect(new Set(ASSERTION_KINDS).size).toBe(ASSERTION_KINDS.length);
  });
});
