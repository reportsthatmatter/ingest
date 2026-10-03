import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { measureLayout } from "../src/oracle";
import type { Block } from "../src/paragraphs";

/**
 * Three real pages: the page's `pdftohtml -xml` and the blocks (and notes) the
 * pipeline produced for it at the time, cut from the corpus. The expected
 * counts below were each read against the page, not just recorded: the notes
 * say what is wrong on the page.
 */
const fixture = (name: string) => {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/oracle/${name}.json`, import.meta.url), "utf8"));
  return { layout: buildLayout([parseLayoutXml(f.xml)]), blocks: f.blocks as Block[], footnotes: f.footnotes };
};

describe("the layout oracle on real pages", () => {
  it("Hillsborough PDF p.34 (printed 30): two maroon 21pt subheads the pipeline read as body", () => {
    const { layout, blocks, footnotes } = fixture("hillsborough-p34");
    const r = measureLayout(layout, blocks, footnotes);
    const missed = r.findings.filter((f) => f.signal === "headings-missed").map((f) => f.text);
    expect(missed).toEqual(["Ibrox Park 1971 and the Wheatley Report", "Bradford 1985 and the Popplewell Report"]);
    // its numbered paragraphs (1.28 …) are each their own block, as the layout says
    expect(r.counts["paragraphs-merged"]).toBe(0);
    expect(r.counts["paragraphs-oversplit"]).toBe(0);
    expect(r.counts["headings-spurious"]).toBe(0);
    expect(r.expected.headings).toBe(2);
  });

  it("Leveson vol.1 PDF p.111: eleven raised note numbers, none linked, and a paragraph cut into one block per line group", () => {
    const { layout, blocks, footnotes } = fixture("leveson-v1-p111");
    const r = measureLayout(layout, blocks, footnotes);
    expect(r.expected.markers).toBe(11);
    expect(r.counts["markers-unlinked"]).toBe(11); // "companies.7" is flush against its word: unlinked in the output
    expect(r.counts["markers-spurious"]).toBe(0);
    // "Murdoch would remain Chairman…" and four more lines open a block where the layout continues a paragraph
    expect(r.findings.filter((f) => f.signal === "paragraphs-oversplit").map((f) => f.text.slice(0, 14))).toEqual([
      "Murdoch would ",
      "Mr Murdoch exe",
      "Saudi Arabia o",
      "Corp,12 but at",
      "Corp Board of ",
    ]);
    expect(r.findings.filter((f) => f.signal === "headings-missed").map((f) => f.text)).toEqual([
      "The Management and Standards Committee",
      "Financial results",
    ]);
  });

  it("Deepwater PDF p.100 (an even page): four unlinked flush markers and one paragraph cut at a line", () => {
    const { layout, blocks, footnotes } = fixture("deepwater-p100");
    const r = measureLayout(layout, blocks, footnotes);
    expect(r.counts["markers-unlinked"]).toBe(4);
    expect(r.findings.filter((f) => f.signal === "markers-unlinked").map((f) => f.text)).toEqual(["158", "159", "160", "161"]);
    expect(r.counts["paragraphs-oversplit"]).toBe(1);
    expect(r.counts["paragraphs-merged"]).toBe(0);
    expect(r.counts["headings-missed"]).toBe(0);
  });
});

describe("what each signal counts, on a page built to show it", () => {
  const f = (top: number, left: number, right: number, t: string, font = 0) =>
    `<text top="${top}" left="${left}" width="${right - left}" height="${font === 2 ? 11 : 16}" font="${font}">${t}</text>`;
  const fonts = `<fontspec id="0" size="18" family="Times" color="#000000"/>
<fontspec id="1" size="30" family="Times" color="#780030"/>
<fontspec id="2" size="11" family="Times" color="#000000"/>`;
  const long = (n: string) => `${n} ${"word ".repeat(30)}`.trim();
  const page = (lines: string[]) =>
    parseLayoutXml(`<pdf2xml producer="poppler" version="26.08.0"><page number="1" position="absolute" top="0" left="0" height="1000" width="800">\n${fonts}\n${lines.join("\n")}\n</page></pdf2xml>`);
  const at = { volume: 1, pdfIndex: 1, printed: 1 };
  const para = (text: string): Block => ({ kind: "paragraph", text, at });

  // a heading, two flush paragraphs (second starts after a gap), a quotation inset both sides
  const lines = [
    f(100, 100, 400, "A Chapter Heading", 1),
    f(160, 100, 700, long("The first paragraph opens here")),
    f(181, 100, 700, long("and carries on across a second line")),
    f(202, 100, 360, "and ends short."),
    f(244, 100, 700, long("The second paragraph opens after a gap")),
    f(265, 100, 700, long("and carries on")),
    f(286, 100, 300, "to its end."),
    f(328, 160, 640, long("A quotation set in from both sides")),
    f(349, 160, 640, long("and running for two lines at least")),
    f(370, 160, 400, "before it stops."),
    ...[0, 1, 2, 3, 4, 5].map((i) => f(412 + i * 21, 100, 700, long(`filler line ${i} of the body that fills the page`))),
  ];
  const layout = buildLayout([page(lines)]);

  const filler = [0, 1, 2, 3, 4, 5].map((i) => long(`filler line ${i} of the body that fills the page`)).join(" ");
  const clean: Block[] = [
    { kind: "heading", level: 2, text: "A Chapter Heading", at },
    para(long("The first paragraph opens here") + " and carries on across a second line and ends short."),
    para(long("The second paragraph opens after a gap") + " and carries on to its end."),
    { kind: "quote", text: long("A quotation set in from both sides") + " and running for two lines at least before it stops.", at },
    para(filler),
  ];

  it("a faithful reading disagrees with the layout nowhere on the structure it covers", () => {
    const r = measureLayout(layout, clean);
    expect(r.counts["headings-missed"]).toBe(0);
    expect(r.counts["headings-spurious"]).toBe(0);
    expect(r.counts["paragraphs-merged"]).toBe(0);
    expect(r.counts["quotes-spurious"]).toBe(0);
    expect(r.counts["quotes-missed"]).toBe(0);
  });

  it("headings-missed: a heading in a bigger, coloured face read as body", () => {
    const blocks = clean.map((b) => (b.kind === "heading" ? para("A Chapter Heading") : b));
    expect(measureLayout(layout, blocks).counts["headings-missed"]).toBe(1);
  });

  it("headings-spurious: a heading made of a line set in the body's own face", () => {
    const blocks = [...clean, { kind: "heading", level: 3, text: "filler line 2 of the body that fills the page", at } as Block];
    const r = measureLayout(layout, blocks);
    expect(r.counts["headings-spurious"]).toBe(1);
    expect(r.counts["headings-missed"]).toBe(0);
  });

  it("paragraphs-merged: two paragraphs fused into one block", () => {
    const fused = [clean[0], para(`${(clean[1] as { text: string }).text} ${(clean[2] as { text: string }).text}`), clean[3], clean[4]];
    const r = measureLayout(layout, fused);
    expect(r.counts["paragraphs-merged"]).toBe(1);
    expect(r.findings.find((x) => x.signal === "paragraphs-merged")!.text).toContain("The second paragraph opens");
  });

  it("paragraphs-oversplit: a paragraph cut where the layout carries on", () => {
    const cut = [clean[0], para(long("The first paragraph opens here")), para("and carries on across a second line and ends short."), clean[2], clean[3], clean[4]];
    const r = measureLayout(layout, cut);
    expect(r.counts["paragraphs-oversplit"]).toBe(1);
  });

  it("quotes-spurious: an ordinary paragraph read as a quotation; quotes-missed: a quotation read as prose", () => {
    const asQuote = clean.map((b) => (b === clean[1] ? ({ kind: "quote", text: (b as { text: string }).text, at } as Block) : b));
    expect(measureLayout(layout, asQuote).counts["quotes-spurious"]).toBe(1);
    const asProse = clean.map((b) => (b.kind === "quote" ? para(b.text) : b));
    expect(measureLayout(layout, asProse).counts["quotes-missed"]).toBe(1);
  });

  it("markers: a raised digit run is expected, and a linked [^N] consumes it; a link with no raised digit is spurious", () => {
    const marked = buildLayout([page([...lines.slice(0, 2), f(155, 700, 708, "7", 2), ...lines.slice(2)])]);
    const unlinked = measureLayout(marked, clean);
    expect(unlinked.expected.markers).toBe(1);
    expect(unlinked.counts["markers-unlinked"]).toBe(1);
    const linkedBlocks = clean.map((b) => (b === clean[1] ? para(`${(b as { text: string }).text}[^7]`) : b));
    const linked = measureLayout(marked, linkedBlocks, [{ number: 7 }]);
    expect(linked.counts["markers-unlinked"]).toBe(0);
    expect(linked.counts["markers-spurious"]).toBe(0);
    const spurious = measureLayout(layout, clean.map((b) => (b === clean[1] ? para(`${(b as { text: string }).text}[^9]`) : b)), [{ number: 9 }]);
    expect(spurious.counts["markers-spurious"]).toBe(1);
  });

  it("markers: a labelled link [^N-label] is note N, so it consumes the raised N (Saville, the hybrid path)", () => {
    const marked = buildLayout([page([...lines.slice(0, 2), f(155, 700, 708, "7", 2), ...lines.slice(2)])]);
    const labelled = clean.map((b) => (b === clean[1] ? para(`${(b as { text: string }).text}[^7-31]`) : b));
    const r = measureLayout(marked, labelled, [{ number: 7 }]);
    expect(r.counts["markers-unlinked"]).toBe(0);
    expect(r.counts["markers-spurious"]).toBe(0);
  });

  it("markers: a raised number that opens its line is a note's own number (a notes page, a footnote), not a marker", () => {
    const noteLine = [f(158, 100, 108, "7", 2), f(160, 108, 700, long("Report of the Commission, Vol. I, p. 48."))];
    const withNote = buildLayout([page([...lines.slice(0, 1), ...noteLine, ...lines.slice(2)])]);
    expect(withNote.page(1, 1)!.lines.some((l) => l.raised.length > 0 && l.text.startsWith("7"))).toBe(true);
    expect(measureLayout(withNote, clean).expected.markers).toBe(0);
    expect(measureLayout(withNote, clean).counts["markers-unlinked"]).toBe(0);
  });

  it("markers: a raised marker in an italic line at the body's size counts (a case name, Leveson vol.1 p.61)", () => {
    const fontsI = fonts + `\n<fontspec id="3" size="18" family="Times-Italic" color="#000000"/>`;
    const italic = parseLayoutXml(
      `<pdf2xml producer="poppler" version="26.08.0"><page number="1" position="absolute" top="0" left="0" height="1000" width="800">\n${fontsI}\n${[
        ...lines.slice(0, 2),
        `<text top="181" left="100" width="600" height="16" font="3">${long("Re H (Minors) (Sexual Abuse: Standard of Proof)")}</text>`,
        f(177, 700, 714, "12", 2),
        ...lines.slice(3),
      ].join("\n")}\n</page></pdf2xml>`
    );
    const r = measureLayout(buildLayout([italic]), clean);
    expect(r.expected.markers).toBe(1);
    expect(r.counts["markers-unlinked"]).toBe(1);
  });

  it("markers: with relink false the blocks' own links are read, not linkInlineMarkers' guesses", () => {
    // ", 9 people": a count the text linker reads as note 9 where note 9 exists; nothing on the page is raised
    const counted = clean.map((b) => (b === clean[1] ? para(`Of these, 9 people. ${(b as { text: string }).text}`) : b));
    expect(measureLayout(layout, counted, [{ number: 9 }]).counts["markers-spurious"]).toBe(1);
    expect(measureLayout(layout, counted, [{ number: 9 }], { relink: false }).counts["markers-spurious"]).toBe(0);
  });

  it("counts per page, only where something disagrees", () => {
    const r = measureLayout(layout, clean.slice(1));
    expect(Object.keys(r.pages)).toEqual(["1:1"]);
    expect(r.pages["1:1"]["headings-missed"]).toBe(1);
  });
});
