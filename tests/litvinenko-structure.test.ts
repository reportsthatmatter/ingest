import { describe, expect, it } from "vitest";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { applyTypographicHeadings, layoutHeadings } from "../src/typographic-headings";
import { stripRepeatedPageFurniture, type SplitPage } from "../src/clean";

/** The Litvinenko Inquiry (reportsthatmatter-8rv, reportsthatmatter-men). */

const xml = (pages: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<pdf2xml producer="poppler" version="26.08.0">\n${pages.join("\n")}\n</pdf2xml>`;
const text = (top: number, left: number, width: number, height: number, font: number, body: string) =>
  `<text top="${top}" left="${left}" width="${width}" height="${height}" font="${font}">${body}</text>`;
// 0: body 18 black; 1: chapter title 30 bold blue; 2: topic 22 blue; 3: a raised marker
const FONTS = `<fontspec id="0" size="18" family="ABCDEF+ArialMT" color="#000000"/>
<fontspec id="1" size="30" family="ABCDEF+Arial" color="#6a86b8"/>
<fontspec id="2" size="22" family="ABCDEF+ArialMT" color="#6a86b8"/>
<fontspec id="3" size="11" family="ABCDEF+ArialMT" color="#6a86b8"/>`;
const page = (n: number, lines: string[]) =>
  `<page number="${n}" position="absolute" top="0" left="0" height="1262" width="892">\n${n === 1 ? FONTS : ""}\n${lines.join("\n")}\n</page>`;
const layout = buildLayout([
  parseLayoutXml(
    xml([
      // PDF p.214: Part 9's Chapter 5, its title broken after a comma
      page(1, [
        text(79, 136, 600, 30, 1, "<b>Chapter 5:  Mario Scaramella, Chechen groups,</b>"),
        text(115, 210, 300, 30, 1, "<b>Alexander Talik</b>"),
        text(200, 136, 680, 18, 0, "9.26 There were a number of reasons why it was thought at one stage that Mr Scaramella"),
      ]),
      // PDF p.172: a figure caption in the topic face, with its note marker; and a topic, with none
      page(2, [
        text(300, 136, 200, 22, 2, "Plan of the Pine Bar"),
        text(295, 336, 30, 11, 3, "283"),
        text(600, 136, 300, 22, 2, "The pathologists"),
        text(700, 136, 680, 18, 0, "3.172 The pathologists who gave evidence to the Inquiry were Dr Cary and Dr Fegan-Earl."),
      ]),
    ]),
  ),
]);
const faces = [["Arial|30|#6a86b8|b"], ["ArialMT|22|#6a86b8"]];

describe("typographicHeadings({ commaWraps }): a title whose first line ends on a comma", () => {
  it("without it, only the title's second line is a heading", () => {
    const { headings } = layoutHeadings(layout, { faces });
    expect(headings.filter((h) => h.pdfIndex === 1).map((h) => h.text)).toEqual(["Alexander Talik"]);
  });
  it("with it, the two lines are one heading", () => {
    const { headings } = layoutHeadings(layout, { faces, commaWraps: true });
    // (the layout's own spacing: the heading block takes the text reading's words)
    expect(headings.filter((h) => h.pdfIndex === 1).map((h) => h.text)).toEqual(["Chapter 5:  Mario Scaramella, Chechen groups, Alexander Talik"]);
  });
  it("joins the blocks the text reading cut the title into", () => {
    const at = { volume: 1, pdfIndex: 1 };
    const blocks = [
      { kind: "paragraph", text: "Chapter 5: Mario Scaramella, Chechen groups,", at },
      { kind: "paragraph", text: "Alexander Talik", at },
      { kind: "paragraph", text: "9.26 There were a number of reasons why it was thought at one stage that Mr Scaramella", at },
    ] as never[];
    applyTypographicHeadings(blocks, layout, { faces, commaWraps: true });
    expect((blocks as Array<{ kind: string; level?: number; text: string }>).map((b) => [b.kind, b.level, b.text])).toEqual([
      ["heading", 2, "Chapter 5: Mario Scaramella, Chechen groups, Alexander Talik"],
      ["paragraph", undefined, "9.26 There were a number of reasons why it was thought at one stage that Mr Scaramella"],
    ]);
  });
});

describe("typographicHeadings({ skipMarked }): a caption in a heading face", () => {
  it("without it, the caption is a heading", () => {
    const { headings } = layoutHeadings(layout, { faces });
    expect(headings.filter((h) => h.pdfIndex === 2).map((h) => h.text)).toEqual(["Plan of the Pine Bar283", "The pathologists"]);
  });
  it("with it, a line carrying a note marker is not, and the topic still is", () => {
    const { headings } = layoutHeadings(layout, { faces, skipMarked: true });
    expect(headings.filter((h) => h.pdfIndex === 2).map((h) => h.text)).toEqual(["The pathologists"]);
  });
});

describe("runningFurniture({ keep })", () => {
  const page = (index: number, lines: string[]): SplitPage => ({
    index,
    volume: 1,
    pdfIndex: index,
    printed: null,
    body: [...lines, "", "text", "more text", "", `${index}`],
    footnotes: [],
  });
  // Parts 4, 5, 6, 8 and 9 each open on the same chapter heading at the head of the page
  const pages = [52, 86, 110, 184, 210].map((n) => page(n, ["The Litvinenko Inquiry", "", "Chapter 1:  Introduction"]));

  it("strips the repeated heading as furniture without it (the defect)", () => {
    const out = stripRepeatedPageFurniture(pages, { numbersTrackPages: true });
    expect(out[0].body.some((line) => line.includes("Introduction"))).toBe(false);
  });
  it("keeps a line that matches, and still strips the running title", () => {
    const out = stripRepeatedPageFurniture(pages, { numbersTrackPages: true, keep: /^Chapter 1: Introduction$/ });
    expect(out.every((p) => p.body.includes("Chapter 1:  Introduction"))).toBe(true);
    expect(out.some((p) => p.body.includes("The Litvinenko Inquiry"))).toBe(false);
  });
});
