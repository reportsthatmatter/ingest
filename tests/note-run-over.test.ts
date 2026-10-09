import { describe, expect, it } from "vitest";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { noteFaceRunOverCount } from "../src/note-run-over";

const xml = (pages: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<pdf2xml producer="poppler" version="26.08.0">\n${pages.join("\n")}\n</pdf2xml>`;
const text = (top: number, left: number, width: number, height: number, font: number, body: string) =>
  `<text top="${top}" left="${left}" width="${width}" height="${height}" font="${font}">${body}</text>`;
const FONTS = `<fontspec id="0" size="18" family="ABCDEF+Times" color="#000000"/>
<fontspec id="1" size="14" family="ABCDEF+Times" color="#000000"/>`;

// PSI p.439 in miniature: body lines, then the run-over of the page before's last note in the notes' 14pt, then note 7.
const layout = buildLayout([
  parseLayoutXml(
    xml([
      `<page number="1" position="absolute" top="0" left="0" height="1188" width="918">\n${FONTS}\n` +
        [
          text(100, 100, 700, 18, 0, "The funds also devalued their Net Asset Valuations to significantly lower levels, which"),
          text(122, 100, 700, 18, 0, "effectively triggered the funds' total collapse."),
          text(300, 100, 700, 14, 1, "Mr. Lehman: Told Egol I'm comfortable w/ the prices"),
          text(318, 100, 700, 14, 1, "Mr. Swenson: He is done."),
          text(400, 100, 700, 14, 1, "7 6/8/2007 email to Daniel Sparks, GS MBS-E-010796702."),
        ].join("\n") +
        "\n</page>",
    ])
  ),
]);

describe("noteFaceRunOverCount", () => {
  const body = [
    "The funds also devalued their Net Asset Valuations to significantly lower levels, which",
    "effectively triggered the funds' total collapse.",
    "",
    "Mr. Lehman: Told Egol I'm comfortable w/ the prices",
    "Mr. Swenson: He is done.",
    "",
  ];
  const notes = ["7 6/8/2007 email to Daniel Sparks, GS MBS-E-010796702."];

  it("counts the trailing body lines set in the first note's face, and not the body's own", () => {
    expect(noteFaceRunOverCount(layout, 1, 1, body, notes)).toBe(3); // the two note-face lines and the blank after them
  });

  it("stops at a line the layout cannot place", () => {
    expect(noteFaceRunOverCount(layout, 1, 1, [...body.slice(0, 3), "Unplaced line of text here", "Mr. Swenson: He is done.", ""], notes)).toBe(2);
  });

  it("is zero where the body ends in the body's face", () => {
    expect(noteFaceRunOverCount(layout, 1, 1, body.slice(0, 2), notes)).toBe(0);
  });
});
