import { describe, expect, it } from "vitest";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { splitFootnoteBlock } from "../src/clean";
import { parseFootnotes } from "../src/footnotes";
import { assembleEdition, type Edition, type PrintedPage } from "../src/edition";
import { pipeline, resolvePasses } from "../src/define";
import { footnoteRestarts, sequencedNoteOpenings, strandedMarkers } from "../src/passes";
import type { Page } from "../src/extract";

/**
 * The note-order defects the note-reference-sequence signal found (v0.22.0):
 * notes attached or ordered wrongly in the served text.
 */

const LONG = (n: number) => `Sentence ${n} of the body runs on for long enough to align without any doubt about where it sits on the page.`;
const page = (pdfIndex: number, lines: string[]): Page => ({ index: pdfIndex, volume: 1, pdfIndex, lines }) as Page;

describe("cleanEdition floats: \"by-notes\" (reportsthatmatter-gq4j)", () => {
  const printed: PrintedPage[] = [
    { volume: 1, pdfIndex: 1, number: 1 },
    { volume: 1, pdfIndex: 2, number: 2 },
  ];
  // 9/11 p.177: a box (notes 22-25 in print) interrupts the paragraph that ends on note 26
  const run: Page[] = [page(1, [`${LONG(1)} Ressam drove onto the`, "A Case Study in Terrorist Travel", "Ressam used a fraudulent passport."]), page(2, [`ferry and boarded. ${LONG(2)}`])];
  const ed = (): Edition => ({
    blocks: [
      { kind: "paragraph", text: `${LONG(1)}[^21-6] Ressam drove onto the` },
      { kind: "heading", level: 4, text: "A Case Study in Terrorist Travel", float: true },
      { kind: "paragraph", text: "Ressam used a fraudulent passport.[^22-6]", float: true },
      { kind: "paragraph", text: `ferry and boarded.[^23-6] ${LONG(2)}` },
    ],
    notes: [
      { label: "21-6", text: "a" },
      { label: "22-6", text: "b" },
      { label: "23-6", text: "c" },
    ],
  });

  it("by default the rejoined paragraph reads first and the box after it", () => {
    const parts = assembleEdition(ed(), run, printed, []).body.split("\n\n");
    expect(parts.findIndex((p) => p.includes("ferry and boarded"))).toBeLessThan(parts.indexOf("#### A Case Study in Terrorist Travel"));
  });

  it("with by-notes the box reads first only when its notes come before the tail's and the head cites none", () => {
    // the head cites 21: unchanged
    const unchanged = assembleEdition(ed(), run, printed, [], { floats: "by-notes" }).body.split("\n\n");
    expect(unchanged.findIndex((p) => p.includes("ferry and boarded"))).toBeLessThan(unchanged.indexOf("#### A Case Study in Terrorist Travel"));
    // the head cites nothing: the box first, then the whole paragraph
    const e = ed();
    (e.blocks[0] as { text: string }).text = `${LONG(1)} Ressam drove onto the`;
    const parts = assembleEdition(e, run, printed, [], { floats: "by-notes" }).body.split("\n\n");
    const box = parts.indexOf("#### A Case Study in Terrorist Travel");
    const para = parts.findIndex((p) => p.includes("Ressam drove onto the ferry and boarded.[^23-6]"));
    expect(box).toBeGreaterThan(-1);
    expect(box).toBeLessThan(para);
    expect(parts[box + 1]).toBe("Ressam used a fraudulent passport.[^22-6]");
  });
});

describe("footnoteRestarts (reportsthatmatter-n7fb)", () => {
  // Litvinenko PDF p.110: Part 6 restarts its notes at 1; the page expects Part 5's next, 85
  const lines = [
    "6.2    One task that the police undertook was to compile a schedule of all telephone calls",
    "       will refer to it hereafter as ‘the telephone schedule’.1",
    "",
    "6.3    But in addition to such conventional sources of evidence, it became apparent that",
    "       there was a highly unusual, in fact unprecedented, line of inquiry to be followed.",
    "",
    "",
    "",
    "1",
    " In fact, there are two versions of the telephone schedule in evidence: the original schedule, INQ017809;",
    "and a subsequent slightly more detailed schedule covering only the dates 31 October 2006 to 3 November",
  ];
  it("a page whose only note is a new Part's 1 keeps it in the body by default", () => {
    expect(splitFootnoteBlock(lines, 85).footnotes).toEqual([]);
  });
  it("reads it as the block with the pass", () => {
    const split = splitFootnoteBlock(lines, 85, { footnoteRestarts: true });
    expect(parseFootnotes(split.footnotes, 110).map((n) => n.number)).toEqual([1]);
    expect(split.body.join(" ")).not.toContain("two versions");
  });
  it("resolves from the declared pass", () => {
    expect(resolvePasses(pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [footnoteRestarts()] })).footnoteRestarts).toBe(true);
  });
});

describe("a stacked note whose text is a witness cipher (reportsthatmatter-n7fb)", () => {
  it("'4 / A1 2/114' opens note 4", () => {
    const lines = [
      "        caused by polonium 210.5",
      "",
      "",
      "2",
      "  Mascall 9/68-70",
      "3",
      "  A fuller description of A1’s CV is at 2/101-104",
      "4",
      "  A1 2/114",
      "5",
      "  A1 2/114-115",
    ];
    const split = splitFootnoteBlock(lines, 2);
    expect(parseFootnotes(split.footnotes, 111).map((n) => [n.number, n.text])).toEqual([
      [2, "Mascall 9/68-70"],
      [3, "A fuller description of A1's CV is at 2/101-104"],
      [4, "A1 2/114"],
      [5, "A1 2/114-115"],
    ]);
  });
});

describe("the expected note opening twice on a page (reportsthatmatter-kvxj)", () => {
  it("a body line opening on the number is passed over for the foot's note", () => {
    // PSI PDF p.482: "2006 and 2007 securitization…" above the foot's note 2006 (no 2007 on the page)
    const lines = [
      "In 2006 and 2007, Goldman originated 27 CDOs and 93 RMBS securitizations with a total value of",
      "about $100 billion.2006 Goldman designed the structure of each securitization, including the number",
      "2006 and 2007 securitization activities were reviewed by the Subcommittee in detail, which found",
      "that the firm sold the securities it designed to its clients.",
      ...Array(20).fill("Body text of the page goes on here in the ordinary way for many more lines."),
      "",
      "2006",
      "    The 27 CDOs securitized about $28 billion in assets. See undated chart prepared for Subcommittee.",
    ];
    const split = splitFootnoteBlock(lines, 2006);
    expect(parseFootnotes(split.footnotes, 482).map((n) => n.number)).toEqual([2006]);
    expect(split.body.join(" ")).toContain("securitization activities were reviewed");
  });
  it("of two set-off openings, the first", () => {
    // Lehman: "3122 Id. at p. 4." then "3122   Id." then 3123…
    const lines = [...Array(20).fill("Body text of the page goes on here in the ordinary way for many lines."), "", "", "3122 Id. at p. 4.", "", "3122   Id.", "3123 Id. at p. 3.", "", "3124 Examiner’s Interview of McDade."];
    const split = splitFootnoteBlock(lines, 3122);
    expect(split.footnotes[0]).toBe("3122 Id. at p. 4.");
  });
});

describe("citationRunOver stops at a paragraph that cites the page's own notes (reportsthatmatter-kvxj)", () => {
  it("a body paragraph naming securities ('FHLT 2005-A M9') is not a note's run-over", () => {
    const lines = [
      "about the same RMBS security, Mr. Lippmann labeled it a “pig.” 1400 Two days later, on",
      "",
      "In addition, on November 29, 2006, Mr. Lippmann called still another RMBS security",
      "with Fremont loans, FHLT 2005-A M9, a “pig.” 1402 Yet a month earlier, on October 30, 2006,",
      "",
      "1400",
      "     With regard to the asset, Mr. Lippmann wrote: “pig probably a 400-525 market.” 11/29/2006 email",
      "1401",
      "     Id.",
      "1402",
      "     11/29/2006 email from Greg Lippmann to Jashin Patel at Deutsche Bank, DBSI_PSI_EMAIL01234567.",
    ];
    const split = splitFootnoteBlock(lines, 1400, { citationRunOver: true });
    expect(split.body.join(" ")).toContain("FHLT 2005-A M9");
    expect(split.runOver ?? []).toEqual([]);
  });
});

describe("sequencedNoteOpenings (reportsthatmatter-qsfc, kgpr)", () => {
  it("a note opening on a digit or after a wide gap is its own note", () => {
    const lines = ["402 Id.", "403     Standard & Poor's, Guide to the Loan Market (Sept. 2009), at p. 8.", "404 Id. at p. 9."];
    expect(parseFootnotes(lines, 112).map((n) => n.number)).toEqual([402, 404]);
    expect(parseFootnotes(lines, 112, "bare", { sequenced: true }).map((n) => n.number)).toEqual([402, 403, 404]);
    const digits = ["520 E-mail from Anna Yu.", "521 17 C.F.R. § 240.15c3-1g (e) (1) (i)."];
    expect(parseFootnotes(digits, 138, "bare", { sequenced: true }).map((n) => [n.number, n.text])).toEqual([
      [520, "E-mail from Anna Yu."],
      [521, "17 C.F.R. § 240.15c3-1g (e) (1) (i)."],
    ]);
  });
  it("only the next number: a wrapped citation opening on another stays text", () => {
    const lines = ["402 See Fed. Reg. at", "75 Fed. Reg. 185 (2010)."];
    expect(parseFootnotes(lines, 1, "bare", { sequenced: true }).map((n) => n.number)).toEqual([402]);
  });
  it("period style: a quotation mark, a bracket or a digit", () => {
    const lines = ["16. For example, see press cutting.", "17. 31 July 1990, [1991] 3 All E.R. 88.", "18. ‘SOUTH YORKSHIRE POLICE AUTHORITY’.", "19. [1992] 1 A.C. 310."];
    expect(parseFootnotes(lines, 1, "period", { sequenced: true }).map((n) => n.number)).toEqual([16, 17, 18, 19]);
  });
  it("resolves from the declared pass", () => {
    expect(resolvePasses(pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [sequencedNoteOpenings()] })).sequencedNoteOpenings).toBe(true);
  });
});

/** One page of `pdftohtml -xml`: body at 18pt (font 0), raised runs at 11pt (font 1). */
const xmlPage = (texts: string[]) =>
  buildLayout([
    parseLayoutXml(`<?xml version="1.0"?>
<pdf2xml producer="poppler" version="26.08.0">
<page number="1" position="absolute" top="0" left="0" height="1000" width="800">
<fontspec id="0" size="18" family="ABCDEF+Times" color="#000000"/>
<fontspec id="1" size="11" family="ABCDEF+Times" color="#000000"/>
${texts.join("\n")}
</page>
</pdf2xml>`),
  ]);

describe("raised fragments (reportsthatmatter-qsfc, kgpr, kvxj)", () => {
  it("a raised '232.' is marker 232", () => {
    const layout = xmlPage([
      `<text top="100" left="100" width="300" height="16" font="0">at the time it was undertaken.</text>`,
      `<text top="96" left="400" width="24" height="11" font="1">232.</text>`,
    ]);
    expect(layout.lines(1, 1)[0].raised.map((r) => r.text)).toEqual(["232"]);
  });
  it("a raised '24,25' is markers 24 and 25", () => {
    const layout = xmlPage([
      `<text top="100" left="100" width="300" height="16" font="0">in legal costs was £3.8m.</text>`,
      `<text top="96" left="400" width="30" height="11" font="1">24,25</text>`,
    ]);
    const line = layout.lines(1, 1)[0];
    expect(line.raised.map((r) => r.text)).toEqual(["24", "25"]);
    expect(line.text.slice(line.raised[1].offset, line.raised[1].offset + 2)).toBe("25");
  });
  it("a line of a short label and a longer raised marker is in the body's face", () => {
    const layout = xmlPage([
      `<text top="100" left="100" width="18" height="16" font="0">7.</text>`,
      `<text top="96" left="118" width="24" height="11" font="1">1361</text>`,
    ]);
    const line = layout.lines(1, 1)[0];
    expect(line.size).toBe(18);
    expect(line.raised.map((r) => r.text)).toEqual(["1361"]);
  });
});

describe("strandedMarkers (reportsthatmatter-kvxj)", () => {
  it("puts a marker filed on a line of its own back after the word it is raised over", () => {
    const layout = xmlPage([
      `<text top="100" left="100" width="500" height="16" font="0">OTS examinations also identified deficiencies in WaMu’s oversight</text>`,
      `<text top="122" left="100" width="63" height="16" font="0">efforts.</text>`,
      `<text top="118" left="163" width="18" height="11" font="1">288</text>`,
      `<text top="122" left="185" width="300" height="16" font="0"> For example, a 2007 OTS memorandum</text>`,
    ]);
    const lines = ["       OTS examinations also identified deficiencies in WaMu’s oversight", "       288", "efforts. For example, a 2007 OTS memorandum"];
    const out = strandedMarkers().run(lines, { layout }, { volume: 1, pdfIndex: 1, printed: 89 });
    expect(out).toEqual(["       OTS examinations also identified deficiencies in WaMu’s oversight", "efforts.288 For example, a 2007 OTS memorandum"]);
    // no layout raise for those digits: unchanged
    expect(strandedMarkers().run(["a line of text", "   289", "efforts. For"], { layout }, { volume: 1, pdfIndex: 1, printed: 89 })).toEqual(["a line of text", "   289", "efforts. For"]);
  });
});
