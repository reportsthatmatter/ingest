import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { applyTypographicHeadings, layoutHeadings } from "../src/typographic-headings";
import { pipeline, resolvePasses } from "../src/define";
import { typographicHeadings } from "../src/passes";
import type { Block } from "../src/paragraphs";

const xml = (pages: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<pdf2xml producer="poppler" version="26.08.0">\n${pages.join("\n")}\n</pdf2xml>`;
const text = (top: number, left: number, width: number, height: number, font: number, body: string) =>
  `<text top="${top}" left="${left}" width="${width}" height="${height}" font="${font}">${body}</text>`;
// 0: body 18pt; 1: subhead 21pt Medium maroon; 2: heading 26pt bold maroon; 3: caption 15pt italic maroon; 4: running head 14pt bold maroon
const FONTS = `<fontspec id="0" size="18" family="ABCDEF+HelveticaNeue" color="#000000"/>
<fontspec id="1" size="21" family="GHIJKL+HelveticaNeue-Medium" color="#780030"/>
<fontspec id="2" size="26" family="MNOPQR+HelveticaNeue" color="#780030"/>
<fontspec id="3" size="15" family="STUVWX+HelveticaNeue" color="#780030"/>
<fontspec id="4" size="14" family="YZABCD+HelveticaNeue" color="#780030"/>`;
const body = (top: number, s: string) => text(top, 100, 700, 18, 0, s);
const page = (n: number, lines: string[]) =>
  `<page number="${n}" position="absolute" top="0" left="0" height="1262" width="892">\n${n === 1 ? FONTS : ""}\n${lines.join("\n")}\n</page>`;

/** Three pages, each with a 26pt heading and a 21pt subhead (one wrapped over two lines) among body lines. */
const layout = buildLayout([
  parseLayoutXml(
    xml([
      page(1, [
        text(30, 100, 200, 16, 4, "12 The Report"),
        body(60, "2.4.19 Eye-witness accounts of the immediate aftermath confirm that all the challenges were present."),
        body(82, "should be considered within this context."),
        text(130, 100, 330, 30, 2, "<b>Recognition of the disaster</b>"),
        body(190, "2.4.20 The first essential requirement was that emergency services recognise what had happened."),
        text(300, 100, 400, 22, 1, "What happened after 3pm"),
        body(350, "2.4.23 Lack of recognition of the seriousness of the crush continued after 3pm."),
        text(420, 100, 400, 16, 3, "<i>Figure 1: Map of the stadium</i>"),
      ]),
      page(2, [
        body(60, "The ambulances were sent. It was too late."),
        text(120, 100, 520, 22, 1, "The Police Federation responds to"),
        text(144, 100, 300, 22, 1, "the Taylor Interim Report"),
        body(200, "2.12.5 The Federation said nothing."),
        text(260, 100, 300, 22, 1, "Conclusion"),
        body(300, "2.12.6 There were no further findings."),
        text(340, 100, 200, 30, 2, "<b>Part</b>"),
      ]),
      page(3, [
        text(100, 100, 330, 30, 2, "<b>Chapter heading here</b>"),
        body(150, "2.5.1 Something is said in the ordinary body face of the report."),
        text(220, 100, 400, 22, 1, "A third subhead"),
        body(260, "2.5.2 More is said."),
        text(300, 100, 400, 22, 1, "Ends with a sentence."),
        text(340, 100, 100, 22, 1, "2.5.3"),
      ]),
    ])
  ),
]);

const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
const para = (t: string, pdfIndex: number): Block => ({ kind: "paragraph", text: t, at: at(pdfIndex) });

describe("layoutHeadings", () => {
  const { headings, faces } = layoutHeadings(layout, { firstLevel: 3, minLines: 3 });

  it("ranks the recurring heading faces by size: the largest takes firstLevel", () => {
    expect(faces.map((f) => [f.face, f.level])).toEqual([
      ["HelveticaNeue|26|#780030|b", 3],
      ["HelveticaNeue-Medium|21|#780030", 4],
    ]);
  });

  it("finds the heading lines, joins a wrapped heading, and leaves out captions, running heads, labels and sentences", () => {
    expect(headings.map((h) => [h.pdfIndex, h.level, h.text])).toEqual([
      [1, 3, "Recognition of the disaster"],
      [1, 4, "What happened after 3pm"],
      [2, 4, "The Police Federation responds to the Taylor Interim Report"],
      [2, 4, "Conclusion"],
      [2, 3, "Part"],
      [3, 3, "Chapter heading here"],
      [3, 4, "A third subhead"],
    ]);
  });

  it("takes only the declared sizes, the first at firstLevel", () => {
    const only = layoutHeadings(layout, { firstLevel: 4, minLines: 3, sizes: [21] });
    expect(only.faces.map((f) => [f.face, f.level])).toEqual([["HelveticaNeue-Medium|21|#780030", 4]]);
    expect(only.headings.map((h) => h.text)).toEqual(["What happened after 3pm", "The Police Federation responds to the Taylor Interim Report", "Conclusion", "A third subhead"]);
    const both = layoutHeadings(layout, { firstLevel: 4, minLines: 3, sizes: [26, 21] });
    expect(both.faces.map((f) => f.level)).toEqual([4, 5]);
  });

  it("takes a face only when it recurs", () => {
    expect(layoutHeadings(layout, { minPages: 4 }).headings).toEqual([]);
  });

  it("takes exactly the declared faces, one list per level, italic and one-off faces included (Post Office Horizon)", () => {
    const declared = layoutHeadings(layout, {
      firstLevel: 2,
      faces: [["HelveticaNeue-Medium|21|#780030"], ["HelveticaNeue|15|#780030|i"]],
    });
    expect(declared.faces.map((f) => [f.face, f.level])).toEqual([
      ["HelveticaNeue-Medium|21|#780030", 2],
      ["HelveticaNeue|15|#780030|i", 3],
    ]);
    expect(declared.headings.map((h) => [h.pdfIndex, h.level, h.text])).toEqual([
      [1, 2, "What happened after 3pm"],
      [1, 3, "Figure 1: Map of the stadium"],
      [2, 2, "The Police Federation responds to the Taylor Interim Report"],
      [2, 2, "Conclusion"],
      [3, 2, "A third subhead"],
    ]);
  });
});

describe("applyTypographicHeadings", () => {
  const blocks = (): Block[] => [
    para("2.4.19 Eye-witness accounts of the immediate aftermath confirm that all the challenges were present. should be considered within this context.", 1),
    para("Recognition of the disaster 2.4.20 The first essential requirement was that emergency services recognise what had happened.", 1),
    para("What happened after 3pm 2.4.23 Lack of recognition of the seriousness of the crush continued after 3pm.", 1),
    para("The ambulances were sent. It was too late. The Police Federation responds to the Taylor Interim Report 2.12.5 The Federation said nothing.", 2),
    para("Conclusion", 2),
    para("2.12.6 There were no further findings.", 2),
    { kind: "heading", level: 3, text: "Chapter heading here", at: at(3) },
    para("A third subhead 2.5.2 More is said.", 3),
  ];

  it("cuts a heading run into the start of a paragraph out of it, at the level its face has", () => {
    const b = blocks();
    const stats = applyTypographicHeadings(b, layout, { firstLevel: 3, minLines: 3 });
    expect(b.map((x) => [x.kind, "level" in x ? x.level : "", "text" in x ? x.text.slice(0, 37) : ""])).toEqual([
      ["paragraph", "", "2.4.19 Eye-witness accounts of the im"],
      ["heading", 3, "Recognition of the disaster"],
      ["paragraph", "", "2.4.20 The first essential requiremen"],
      ["heading", 4, "What happened after 3pm"],
      ["paragraph", "", "2.4.23 Lack of recognition of the ser"],
      ["paragraph", "", "The ambulances were sent. It was too "],
      ["heading", 4, "The Police Federation responds to the"],
      ["paragraph", "", "2.12.5 The Federation said nothing."],
      ["heading", 4, "Conclusion"],
      ["paragraph", "", "2.12.6 There were no further findings"],
      ["heading", 3, "Chapter heading here"],
      ["heading", 4, "A third subhead"],
      ["paragraph", "", "2.5.2 More is said."],
    ]);
    expect(stats).toMatchObject({ headings: 7, split: 5, already: 1, unplaced: 1 });
    // each heading it cut says so, and keeps its page
    expect(b.filter((x) => x.kind === "heading" && x.layoutHeading).length).toBe(5);
    expect(b[1].at).toEqual(at(1));
    // the heading's words are not lost
    expect(b.filter((x) => "text" in x).map((x) => (x as { text: string }).text).join(" ")).toContain("The Police Federation responds to the Taylor Interim Report 2.12.5");
  });

  it("does not cut a heading's words out of the middle of a sentence", () => {
    const b: Block[] = [para("He spoke of the Conclusion that the court reached, 2.12.6 and nothing else.", 2)];
    applyTypographicHeadings(b, layout, { minLines: 3 });
    expect(b.map((x) => x.kind)).toEqual(["paragraph"]);
  });

  it("promotes a block that is only the heading's words, and leaves a list alone", () => {
    const b: Block[] = [para("Conclusion", 2), { kind: "list", items: ["Conclusion", "x"], quoted: false, at: at(2) }];
    applyTypographicHeadings(b, layout, { minLines: 3 });
    expect(b.map((x) => x.kind)).toEqual(["heading", "list"]);
  });
});

describe("relevel (Grenfell Tower Inquiry, gqsy.4)", () => {
  // the text reading made "Conclusion" a division-level heading ("Part 3:"-style, level 2) with a colon it added
  const read = (): Block[] => [
    { kind: "heading", level: 2, text: "Conclusion:", at: at(2) },
    para("2.12.6 There were no further findings.", 2),
  ];
  const faces = [["HelveticaNeue-Medium|21|#780030"]];

  it("gives a heading the text reading made the level its face declares, matched on letters and digits", () => {
    const b = read();
    const stats = applyTypographicHeadings(b, layout, { firstLevel: 4, faces, relevel: true });
    expect(b[0]).toMatchObject({ kind: "heading", level: 4, text: "Conclusion:" });
    expect(stats.relevelled).toBe(1);
  });

  it("leaves it alone without relevel, or without faces", () => {
    const b = read();
    applyTypographicHeadings(b, layout, { firstLevel: 4, faces });
    expect(b[0]).toMatchObject({ level: 2 });
    const c = read();
    applyTypographicHeadings(c, layout, { firstLevel: 4, minLines: 3, relevel: true });
    expect(c[0]).toMatchObject({ level: 2 });
  });
});

describe("on a real page", () => {
  it("Hillsborough p.34 (reportsthatmatter-a8l): both maroon subheads, read as paragraphs, are headings", () => {
    const f = JSON.parse(readFileSync(new URL("./fixtures/oracle/hillsborough-p34.json", import.meta.url), "utf8"));
    const real = buildLayout([parseLayoutXml(f.xml)]);
    const b = f.blocks as Block[];
    const stats = applyTypographicHeadings(b, real, { minPages: 1, minLines: 2 });
    const headings = b.filter((x) => x.kind === "heading");
    expect(headings.map((h) => "text" in h && h.text)).toEqual(["Ibrox Park 1971 and the Wheatley Report", "Bradford 1985 and the Popplewell Report"]);
    expect(stats.unplaced).toBe(0);
    expect(b.filter((x) => x.kind === "paragraph")).toHaveLength(10);
  });
});

describe("the pass", () => {
  it("is opt-in and carries its options", () => {
    const def = pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [typographicHeadings({ firstLevel: 3 })] });
    expect(resolvePasses(def).typographicHeadings).toEqual({ firstLevel: 3 });
    expect(resolvePasses(pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [] })).typographicHeadings).toBeUndefined();
  });

  it("quotedRemainder: a heading opening a quotation leaves the paragraph below it whole, not a quotation and a stump (PSI p.174)", () => {
    const quoted = (): Block[] => [
      { kind: "quote", text: "What happened after 3pm Lack of recognition of the seriousness of the crush, which the", at: at(1) },
      para("police continued to treat as disorder after 3pm.", 1),
      { kind: "quote", text: "What happened after 3pm \"A real quotation\".", at: at(1) },
      para("Next paragraph.", 1),
    ];
    const plain = quoted();
    applyTypographicHeadings(plain, layout, { firstLevel: 3, minLines: 3 });
    expect(plain.map((x) => x.kind)).toEqual(["heading", "quote", "paragraph", "quote", "paragraph"].slice(0, plain.length));
    const joined = quoted();
    applyTypographicHeadings(joined, layout, { firstLevel: 3, minLines: 3, quotedRemainder: true });
    expect(joined.map((x) => [x.kind, "text" in x ? x.text.slice(0, 30) : ""])).toEqual([
      ["heading", "What happened after 3pm"],
      ["paragraph", "Lack of recognition of the ser"],
      ["quote", "What happened after 3pm \"A rea"],
      ["paragraph", "Next paragraph."],
    ]);
    expect((joined[1] as { text: string }).text).toBe("Lack of recognition of the seriousness of the crush, which the police continued to treat as disorder after 3pm.");
  });
});

describe("skipRunIns (wck)", () => {
  // "A third subhead" is a face line that may open a sentence that runs on in lower case.
  const opts = { firstLevel: 4, faces: [["HelveticaNeue-Medium|21|#780030"]] };

  it("cuts a face line out of the paragraph it opens by default", () => {
    const b: Block[] = [para("A third subhead 2.5.2 More is said.", 3)];
    applyTypographicHeadings(b, layout, opts);
    expect(b.map((x) => x.kind)).toEqual(["heading", "paragraph"]);
  });

  it("leaves a lead-in whose rest begins in lower case in its paragraph", () => {
    const b: Block[] = [para("A third subhead of the report runs on in lower case, the way a bold first line does.", 3)];
    applyTypographicHeadings(b, layout, { ...opts, skipRunIns: true });
    expect(b.map((x) => x.kind)).toEqual(["paragraph"]);
    const c: Block[] = [para("A third subhead 2.5.2 More is said.", 3)];
    applyTypographicHeadings(c, layout, { ...opts, skipRunIns: true });
    expect(c.map((x) => x.kind)).toEqual(["heading", "paragraph"]);
  });
});
