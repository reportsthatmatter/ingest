import { describe, expect, it } from "vitest";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { furnitureFaces } from "../src/passes";
import { pipeline, resolvePasses } from "../src/define";

/**
 * `furnitureFaces` (reportsthatmatter-gqsy.4): the Grenfell Tower Inquiry sets its running heads in
 * white Calibri 10pt on a banner, the recto head naming the chapter, so repetition cannot find them.
 */
const xml = (pages: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<pdf2xml producer="poppler" version="26.08.0">\n${pages.join("\n")}\n</pdf2xml>`;
const text = (top: number, left: number, width: number, height: number, font: number, body: string) =>
  `<text top="${top}" left="${left}" width="${width}" height="${height}" font="${font}">${body}</text>`;
// 0: body 18; 1: running head 15 white; 2: banner heading 30 bold white
const FONTS = `<fontspec id="0" size="18" family="ABCDEF+Calibri-Light" color="#000000"/>
<fontspec id="1" size="15" family="ABCDEF+Calibri" color="#ffffff"/>
<fontspec id="2" size="30" family="ABCDEF+Calibri-Bold" color="#ffffff"/>`;
const page = (n: number, lines: string[]) =>
  `<page number="${n}" position="absolute" top="0" left="0" height="1262" width="892">\n${n === 1 ? FONTS : ""}\n${lines.join("\n")}\n</page>`;

const layout = buildLayout([
  parseLayoutXml(
    xml([
      page(1, [
        text(22, 600, 250, 16, 1, "Part 2 | Chapter 13: The Fire Safety Order"),
        text(51, 100, 200, 30, 2, "<b>Chapter 13</b>"),
        text(97, 100, 400, 30, 2, "<b>The Fire Safety Order</b>"),
        text(242, 100, 700, 18, 0, "13.1 The Regulatory Reform (Fire Safety) Order 2005 came into force."),
        // the same words in the body, mid-page: not furniture
        text(600, 100, 700, 18, 1, "Part 2 | Chapter 13: The Fire Safety Order"),
      ]),
    ])
  ),
]);

const LINES = [
  "                                     Part 2  |  Chapter 13: The Fire Safety Order",
  "Chapter 13",
  "The Fire Safety Order",
  "13.1 The Regulatory Reform (Fire Safety) Order 2005 came into force.",
  "",
];

describe("furnitureFaces", () => {
  const pass = furnitureFaces(["Calibri|15|#ffffff"]);
  const at = { volume: 1, pdfIndex: 1, printed: 205 };

  it("drops a line set in a declared face at the page's edge, whatever its spacing", () => {
    expect(pass.run(LINES, { layout }, at)).toEqual(LINES.slice(1));
  });

  it("keeps everything without a layout, or for a face not declared", () => {
    expect(pass.run(LINES, {}, at)).toEqual(LINES);
    expect(furnitureFaces(["Calibri|14|#000000"]).run(LINES, { layout }, at)).toEqual(LINES);
  });

  it("is a body pass the report declares", () => {
    const resolved = resolvePasses(pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [pass] }));
    expect(resolved.bodyPasses.map((p) => p.name)).toEqual(["furnitureFaces"]);
  });
});
