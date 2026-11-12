import { describe, expect, it } from "vitest";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { layoutHeadings } from "../src/typographic-headings";
import { splitFootnoteBlock } from "../src/clean";
import { toBlocks } from "../src/paragraphs";

/** The UK Covid-19 Inquiry's Module 2 Volume I (reportsthatmatter-gqsy.14). */

const xml = (pages: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<pdf2xml producer="poppler" version="26.08.0">\n${pages.join("\n")}\n</pdf2xml>`;
const text = (top: number, height: number, font: number, body: string) =>
  `<text top="${top}" left="85" width="600" height="${height}" font="${font}">${body}</text>`;
// 0: body 18; 1: chapter title 54 bold white
const FONTS = `<fontspec id="0" size="18" family="ABCDEF+ProximaNova" color="#000000"/>
<fontspec id="1" size="54" family="ABCDEF+ProximaNova" color="#ffffff"/>`;
const page = (n: number, lines: string[]) =>
  `<page number="${n}" position="absolute" top="0" left="0" height="1262" width="892">\n${n === 1 ? FONTS : ""}\n${lines.join("\n")}\n</page>`;
const layout = buildLayout([
  parseLayoutXml(
    xml([
      // PDF p.36: the title page, "Chapter 1:" on a line of its own
      page(1, [
        text(541, 54, 1, "<b>Chapter 1:</b>"),
        text(598, 54, 1, "<b>The context for pandemic</b>"),
        text(655, 54, 1, "<b>decision-making – key</b>"),
        text(712, 54, 1, "<b>structures and concepts</b>"),
      ]),
      // a colon line in the face that nothing carries on
      page(2, [text(541, 54, 1, "<b>Note:</b>"), text(700, 18, 0, "1.1. The body of the report, in the ordinary face, says something.")]),
    ]),
  ),
]);
const faces = [["ProximaNova|54|#ffffff|b"]];

describe("typographicHeadings({ labelWraps }): a title whose first line ends on a colon", () => {
  it("without it, the colon line is no heading and the title loses its label", () => {
    const { headings } = layoutHeadings(layout, { faces });
    expect(headings.map((h) => h.text)).toEqual(["The context for pandemic decision-making – key structures and concepts"]);
  });
  it("with it, 'Chapter 1:' opens the wrapped title", () => {
    const { headings } = layoutHeadings(layout, { faces, labelWraps: true });
    expect(headings.map((h) => h.text)).toEqual(["Chapter 1: The context for pandemic decision-making – key structures and concepts"]);
  });
  it("a colon line that nothing carries on is still no heading", () => {
    const { headings } = layoutHeadings(layout, { faces, labelWraps: true });
    expect(headings.some((h) => h.text === "Note:")).toBe(false);
  });
});

describe("footnoteRestarts with sequencedNoteOpenings: a chapter's notes start again at 1, set at a tab", () => {
  // PDF p.113: the chapter's first page, the previous chapter's notes having reached 420
  const lines = [
    "    3.1.        By 1 March 2020, it was clear that Covid-19 had reached the UK and was a",
    "                dangerous virus. The testing capacity in England was limited to only 2,100 samples per day.1",
    "                Additional testing was being carried out in the devolved nations, but this was also",
    "                limited.2",
    "",
    "    Figure 3: Daily confirmed cases from 1 to 12 March 2020 across the UK",
    "                                 75",
    "                                50",
    "                                25",
    "       2             4               6                 8                      10           12",
    "    Source: UK Health Security Agency Covid-19 data dashboard archive",
    "",
    "    1                           INQ000223394_0001",
    "    2                           INQ000223394_0001",
  ];
  it("without the restart scan, the notes stay in the body", () => {
    expect(splitFootnoteBlock(lines, 421, { sequencedNoteOpenings: true }).footnotes).toEqual([]);
    expect(splitFootnoteBlock(lines, 421, { footnoteRestarts: true }).footnotes).toEqual([]);
  });
  it("with both, the run from 1 low on the page is the block, and the chart's axis is not", () => {
    const split = splitFootnoteBlock(lines, 421, { sequencedNoteOpenings: true, footnoteRestarts: true });
    expect(split.footnotes.map((l) => l.trim())).toEqual(["1                           INQ000223394_0001", "2                           INQ000223394_0001"]);
    expect(split.body.join("\n")).toContain("Source: UK Health Security Agency");
  });
});

describe("typographicHeadings: a heading's words just after a paragraph label are not that heading", () => {
  const fonts = `<fontspec id="0" size="18" family="ABCDEF+ProximaNova" color="#000000"/>
<fontspec id="1" size="24" family="ABCDEF+ProximaNova-SemiboldIt" color="#15365a"/>`;
  const t = (top: number, font: number, body: string) => `<text top="${top}" left="85" width="600" height="20" font="${font}">${body}</text>`;
  const lay = buildLayout([
    parseLayoutXml(
      xml([
        `<page number="1" position="absolute" top="0" left="0" height="1262" width="892">\n${fonts}\n${[
          t(100, 0, "3.82. The Coronavirus: Action Plan stated:"),
          t(900, 1, "<b><i>The Coronavirus: Action Plan</i></b>"),
          t(950, 0, "3.84. As outlined in Chapter 2, the plan was commissioned on 10 February 2020."),
        ].join("\n")}\n</page>`,
      ]),
    ),
  ]);
  it("is cut above 3.84 (PDF p.136), and 3.82 keeps its words", async () => {
    const { applyTypographicHeadings } = await import("../src/typographic-headings");
    const at = { volume: 1, pdfIndex: 1 };
    const blocks = [
      { kind: "paragraph", text: "3.82. The Coronavirus: Action Plan stated:", at },
      { kind: "paragraph", text: "The Coronavirus: Action Plan 3.84. As outlined in Chapter 2, the plan was commissioned on 10 February 2020.", at },
    ] as never[];
    applyTypographicHeadings(blocks, lay, { faces: [["ProximaNova-SemiboldIt|24|#15365a|b|i"]] });
    expect((blocks as Array<{ kind: string; text: string }>).map((b) => [b.kind, b.text])).toEqual([
      ["paragraph", "3.82. The Coronavirus: Action Plan stated:"],
      ["heading", "The Coronavirus: Action Plan"],
      ["paragraph", "3.84. As outlined in Chapter 2, the plan was commissioned on 10 February 2020."],
    ]);
  });
});

describe("divisionCrossReferences: a line that names a chapter mid-sentence is not that chapter (Module 2 Volume II)", () => {
  // vol. 2 PDF p.79: "(see" / "Appendix 1: …, in this" / "volume), believed …"
  const lines = [
    "Professor David Taylor-Robinson, expert witness on child health inequalities (see",
    "Appendix 1: The background to this module and the Inquiry’s methodology, in this",
    "volume), believed that the unequal impact of the pandemic on children could have been anticipated.",
  ];
  const read = (on: boolean) =>
    toBlocks(lines, 0, undefined, false, true, false, true, undefined, undefined, undefined, undefined, undefined, false, false, false, false, false, false, false, undefined, on);
  it("without it, the cross-reference is a top-level division heading", () => {
    expect(read(false).some((b) => b.kind === "heading" && b.text.startsWith("Appendix 1:"))).toBe(true);
  });
  it("with it, the sentence stays one paragraph", () => {
    const blocks = read(true);
    expect(blocks.filter((b) => b.kind === "heading")).toEqual([]);
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph"]);
  });
  it("a division after a sentence's end is still a heading", () => {
    const blocks = toBlocks(
      ["The chapter before ends here.", "", "Chapter 9: Scientific and technical advice", "", "9.1. The first paragraph."],
      0, undefined, false, true, false, true, undefined, undefined, undefined, undefined, undefined, false, false, false, false, false, false, false, undefined, true,
    );
    expect(blocks.some((b) => b.kind === "heading" && b.text === "Chapter 9: Scientific and technical advice")).toBe(true);
  });
});

describe("typographicHeadings({ faceText }): a face shared with the contents is a heading only where its text says so", () => {
  const fonts = `<fontspec id="0" size="18" family="ABCDEF+ProximaNova" color="#000000"/>
<fontspec id="1" size="21" family="ABCDEF+ProximaNova-Semibold" color="#000000"/>`;
  const pg = (n: number, lines: string[]) =>
    `<page number="${n}" position="absolute" top="0" left="0" height="1262" width="892">\n${n === 1 ? fonts : ""}\n${lines.join("\n")}\n</page>`;
  const layout2 = buildLayout([
    parseLayoutXml(
      xml([
        // vol. 2 PDF p.5: the contents, in the face
        pg(1, [text(200, 30, 1, "<b>Chapter 9: Scientific and technical advice </b>"), text(240, 30, 1, "<b>Chapter 10: Vulnerabilities and inequalities </b>")]),
        // p.17: a recommendation box (a no-break space after "Recommendation", as most are set)
        pg(2, [text(563, 30, 1, "<b>Recommendation 1: Chief Medical Officer for Northern Ireland</b>"), text(600, 25, 0, "The Department of Health (Northern Ireland) should reconstitute the role.")]),
      ]),
    ),
  ]);
  const recFaces = [["ProximaNova-Semibold|21|#000000|b"]];
  it("without it, every contents line in the face is a heading", () => {
    const { headings } = layoutHeadings(layout2, { faces: recFaces });
    expect(headings.some((h) => h.text.startsWith("Chapter 9:"))).toBe(true);
  });
  it("with it, only the recommendation's title", () => {
    const { headings } = layoutHeadings(layout2, { faces: recFaces, faceText: { "ProximaNova-Semibold|21|#000000|b": /^Recommendation\s+\d+:/ } });
    expect(headings.map((h) => h.text)).toEqual(["Recommendation 1: Chief Medical Officer for Northern Ireland"]);
  });
});
