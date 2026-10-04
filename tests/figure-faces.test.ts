import { describe, expect, it } from "vitest";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { figureFaces } from "../src/passes";
import { pipeline, resolvePasses } from "../src/define";

/**
 * `figureFaces` (reportsthatmatter-7150): the Grenfell Tower Inquiry draws its figures' and charts'
 * words in Times New Roman, which its body never uses. Cases from Phase 2 Volume 1, PDF pp.58 and 81.
 */
const xml = (pages: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<pdf2xml producer="poppler" version="26.08.0">\n${pages.join("\n")}\n</pdf2xml>`;
const text = (top: number, left: number, width: number, height: number, font: number, body: string) =>
  `<text top="${top}" left="${left}" width="${width}" height="${height}" font="${font}">${body}</text>`;
// 0: body; 1: figure labels; 2: figure title; 3: caption; 4: heading
const FONTS = `<fontspec id="0" size="18" family="ABCDEF+Calibri-Light" color="#000000"/>
<fontspec id="1" size="14" family="ABCDEF+TimesNewRomanPSMT" color="#000000"/>
<fontspec id="2" size="25" family="ABCDEF+TimesNewRomanPS" color="#000000"/>
<fontspec id="3" size="18" family="ABCDEF+Calibri-Bold" color="#7a7b7a"/>
<fontspec id="4" size="23" family="ABCDEF+Calibri-Bold" color="#314c88"/>`;
const page = (n: number, lines: string[]) =>
  `<page number="${n}" position="absolute" top="0" left="0" height="1262" width="892">\n${n === 1 ? FONTS : ""}\n${lines.join("\n")}\n</page>`;

const layout = buildLayout([
  parseLayoutXml(
    xml([
      page(1, [
        text(334, 149, 600, 18, 0, "five, specimens must be tested. If more than three specimens are tested, three can be"),
        text(355, 149, 600, 18, 0, "selected to provide the test result. This is a depiction of the test apparatus, taken from"),
        text(376, 149, 200, 18, 0, "Dr Lane’s presentation:"),
        text(359, 137, 90, 25, 2, "<b>BS 476-6</b>"),
        text(488, 685, 80, 14, 1, "Chimney"),
        text(532, 684, 150, 14, 1, "Combustion chamber"),
        text(573, 629, 60, 14, 1, "Class 0"),
        text(737, 818, 12, 8, 1, "39"),
        text(726, 149, 400, 18, 3, "<b>Figure 5.1: Depiction of apparatus for BS 476-6 test.</b>"),
        text(903, 149, 300, 23, 4, "<b>Class 0</b>"),
        text(943, 85, 600, 18, 0, "5.10 The test is still in use and a product rated Class 0 passes it."),
      ]),
      page(2, [
        text(675, 85, 600, 18, 0, "6.24 A summary of the guidance given in Approved Document B 1985 on the construction of"),
        text(696, 149, 600, 18, 0, "external walls is set out in the following chart taken from Dr Lane’s presentation."),
        text(720, 160, 500, 14, 1, "External wall fire performance requirements of high-rise buildings through time"),
        text(900, 85, 600, 18, 0, "6.25 The next paragraph."),
      ]),
    ])
  ),
]);

const PAGE_58 = [
  "         five, specimens must be tested. If more than three specimens are tested, three can be",
  "         selected to provide the test result. This is a depiction of the test apparatus, taken from",
  "        BS   476-6presentation:",
  "         Dr Lane’s",
  "",
  "                                                                                               Chimney",
  "                                                                                               Combustion chamber",
  "                                                                                           Class 0",
  "          Figure 5.1: Depiction of apparatus for BS 476-6 test.                                                      39",
  "",
  "          Class 0",
  "5.10      The test is still in use and a product rated Class 0 passes it.",
];

const PAGE_81 = [
  "6.24        A summary of the guidance given in Approved Document B 1985 on the construction of",
  "            external walls",
  "            External wall    is performance",
  "                          fire  set out in the following of",
  "                                            requirements chart  takenbuildings",
  "                                                            high-rise from Drthrough",
  "                                                                               Lane’stime",
  "                                                                                      presentation.",
  "",
  "6.25        The next paragraph.",
];

describe("figureFaces", () => {
  const pass = figureFaces(["TimesNewRomanPSMT", "TimesNewRomanPS"]);

  it("drops a figure's labels and its words glued onto a body line, restores the line's order, keeps the body's same words", () => {
    expect(pass.run(PAGE_58, { layout }, { volume: 1, pdfIndex: 1, printed: 50 })).toEqual([
      "         five, specimens must be tested. If more than three specimens are tested, three can be",
      "         selected to provide the test result. This is a depiction of the test apparatus, taken from",
      // the figure's "BS 476-6" cut out, and the body's line back in the layout's word order
      "         Dr Lane’s presentation:",
      "",
      "          Figure 5.1: Depiction of apparatus for BS 476-6 test.",
      "",
      // the heading below the figure has the label's words: the second "Class 0" from the top is the heading
      "          Class 0",
      "5.10      The test is still in use and a product rated Class 0 passes it.",
    ]);
  });

  it("re-lays a body paragraph a chart's title was interleaved with, from the layout", () => {
    expect(pass.run(PAGE_81, { layout }, { volume: 1, pdfIndex: 2, printed: 73 })).toEqual([
      "6.24        A summary of the guidance given in Approved Document B 1985 on the construction of",
      "            external walls is set out in the following chart taken from Dr Lane’s presentation.",
      "",
      "6.25        The next paragraph.",
    ]);
  });

  it("keeps everything without a layout, or for a family not declared", () => {
    expect(pass.run(PAGE_58, {}, { volume: 1, pdfIndex: 1, printed: 50 })).toEqual(PAGE_58);
    expect(figureFaces(["Arial"]).run(PAGE_58, { layout }, { volume: 1, pdfIndex: 1, printed: 50 })).toEqual(PAGE_58);
  });

  it("is a body pass the report declares", () => {
    const resolved = resolvePasses(pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [pass] }));
    expect(resolved.bodyPasses.map((p) => p.name)).toEqual(["figureFaces"]);
  });
});
