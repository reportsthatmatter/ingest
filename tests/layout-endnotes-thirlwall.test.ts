import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { LayoutEndnotesReader, chapterOfBlocks, type EndnoteChapter } from "../src/layout-endnotes";
import { resolvePasses, pipeline } from "../src/define";
import { layoutEndnotes } from "../src/passes";
import { layoutHeadings } from "../src/typographic-headings";
import type { Block } from "../src/paragraphs";

/**
 * The Thirlwall Inquiry's Volume I (reportsthatmatter-gqsy.16.7): each chapter's notes follow it under a bare
 * "Endnotes" sub-heading, numbered from 1 in the body's own size and not raised, many set wholly as a link in
 * semibold blue. Fixture: `pdftohtml -xml` of Volume I PDF pp.34-37 (the end of Chapter 2's body, then its notes
 * 1-30, 31-65 and 66-100), each expectation read against the page's text layer.
 */
const layout = buildLayout([
  parseLayoutXml(readFileSync(new URL("./fixtures/layout-endnotes/thirlwall-vol1-p34-37.xml", import.meta.url), "utf8")),
]);
const at = (pdfIndex: number) => ({ index: pdfIndex, volume: 1, pdfIndex, printed: null });

describe("layoutEndnotes({ unraised, precedingChapter, anyWeight }) on Thirlwall Vol I pp.34-37", () => {
  const reader = new LayoutEndnotesReader(layout, { unraised: true, precedingChapter: true, anyWeight: true });
  const pages = [34, 35, 36, 37].map((p) => reader.page(at(p), ["a line of the page"]));

  it("p.34 is body; p.35 opens the section under the bare heading, notes 1-30 labelled for the chapter before it", () => {
    expect(pages[0]).toBeUndefined();
    expect(pages[1]!.heading).toEqual(["Endnotes", ""]);
    expect(pages[1]!.body).toEqual([]);
    expect(pages[1]!.notes.map((n) => n.number)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(pages[1]!.notes.every((n) => n.label === `${n.number}-1`)).toBe(true);
    expect(pages[1]!.notes[0].text).toBe("Witness statement of Jane Tomkinson OBE INQ0017158/6/para 19.2.4");
  });

  it("the following pages continue it (31-65, 66-100), the semibold link notes included", () => {
    expect(pages[2]!.notes.map((n) => n.number)).toEqual(Array.from({ length: 35 }, (_, i) => i + 31));
    expect(pages[2]!.notes[0].text).toBe("Witness statement of Christopher Booth INQ0098315/1/para 5");
    expect(pages[3]!.notes.map((n) => n.number)).toEqual(Array.from({ length: 35 }, (_, i) => i + 66));
    expect(reader.chapters).toHaveLength(1);
    expect(reader.chapters[0]).toMatchObject({ key: 1, notesAt: { volume: 1, pdfIndex: 35 }, preceding: true });
    expect(reader.chapters[0].name).toBeUndefined();
  });

  it("without the options nothing on these pages is read as notes (Deepwater and Columbia unchanged)", () => {
    const plain = new LayoutEndnotesReader(layout);
    expect([34, 35, 36, 37].map((p) => plain.page(at(p), ["x"]))).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("chapterOfBlocks with precedingChapter", () => {
  it("a block cites the first section at or after its page, in its own volume", () => {
    const chapter = (key: number, volume: number, pdfIndex: number): EndnoteChapter => ({
      key,
      numbers: new Set([1]),
      notesAt: { volume, pdfIndex },
      preceding: true,
    });
    const chapters = [chapter(1, 2, 17), chapter(2, 2, 35), chapter(3, 3, 10)];
    const block = (volume: number, pdfIndex: number): Block => ({ kind: "paragraph", text: "x", at: { volume, pdfIndex, printed: null } }) as Block;
    const blocks = [block(1, 44), block(2, 10), block(2, 17), block(2, 18), block(2, 35), block(2, 40), block(3, 5)];
    const map = chapterOfBlocks(blocks, chapters);
    expect(blocks.map((b) => map.get(b)?.key)).toEqual([undefined, 1, 1, 2, 2, undefined, 3]);
  });
});

describe("declaring the options", () => {
  it("resolve; with none the pass is what it was", () => {
    expect(layoutEndnotes()).toEqual({ name: "layoutEndnotes", stage: "page" });
    const passes = [layoutEndnotes({ volumes: [2, 3, 4], unraised: true, precedingChapter: true, anyWeight: true })];
    const resolved = resolvePasses(pipeline({ id: "x", title: "x", repo: ".", volumes: [{ path: "x.pdf" }], passes }));
    expect(resolved.layoutEndnotes).toBe(true);
    expect(resolved.layoutEndnotesOptions).toEqual({ volumes: [2, 3, 4], unraised: true, precedingChapter: true, anyWeight: true });
    expect(() => layoutEndnotes({ volumes: [0] })).toThrow(/volume 0/);
  });
});

describe("typographicHeadings({ semicolonWraps })", () => {
  it("a banner wrapped after a semicolon is one heading (Thirlwall Vol I p.105 shape)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><pdf2xml producer="poppler" version="26.08.0">
<page number="1" position="absolute" top="0" left="0" height="1262" width="892">
<fontspec id="1" size="38" family="AAAAAA+Merriweather-Black" color="#ffffff"/>
<fontspec id="2" size="18" family="BBBBBB+SourceSans3" color="#000000"/>
<text top="83" left="128" width="500" height="40" font="1"><b>Chapter 6. August 2015 to</b></text>
<text top="128" left="128" width="500" height="40" font="1"><b>February 2016: Baby I and Baby J;</b></text>
<text top="173" left="128" width="500" height="40" font="1"><b>concerns increase; reviews</b></text>
<text top="339" left="145" width="600" height="21" font="2">6.1 Baby I was born at the Countess and was cared for there.</text>
</page></pdf2xml>`;
    const l = buildLayout([parseLayoutXml(xml)]);
    const faces = [["Merriweather-Black|38|#ffffff|b"]];
    expect(layoutHeadings(l, { faces }).headings.map((h) => h.text)).toEqual(["Chapter 6. August 2015 to", "concerns increase; reviews"]);
    expect(layoutHeadings(l, { faces, semicolonWraps: true }).headings.map((h) => h.text)).toEqual([
      "Chapter 6. August 2015 to February 2016: Baby I and Baby J; concerns increase; reviews",
    ]);
  });
});
