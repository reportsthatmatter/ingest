import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { LayoutEndnotesReader, chapterOfBlocks, type EndnoteChapter } from "../src/layout-endnotes";
import { linkLayoutMarkers } from "../src/markers";
import { resolvePasses, pipeline } from "../src/define";
import { layoutEndnotes, layoutMarkers } from "../src/passes";
import { hasPageNotes } from "../src/noteplace";
import type { Block } from "../src/paragraphs";

/**
 * Real pages (reportsthatmatter-b89, reportsthatmatter-izw): `pdftohtml -xml` of consecutive PDF
 * pages, from `pnpm ingest page --fixture`. Each expectation was read against the page image.
 */
const layoutOf = (name: string) =>
  buildLayout([parseLayoutXml(readFileSync(new URL(`./fixtures/layout-endnotes/${name}.xml`, import.meta.url), "utf8"))]);

const at = (pdfIndex: number) => ({ index: pdfIndex, volume: 1, pdfIndex, printed: null });

describe("LayoutEndnotesReader on Columbia's two-column chapter endnotes (izw)", () => {
  const layout = layoutOf("columbia-p119-121");
  const reader = new LayoutEndnotesReader(layout);
  const p119 = reader.page(at(119), ["   ENDNOTES FOR CHAPTER 5", "", "The citations that contain …   12 Some note text"]);
  const p120 = reader.page(at(120), ["a line of the notes"]);
  const p121 = reader.page(at(121), ["the next chapter's body"]);

  it("p.119 opens chapter 5's notes under its heading: 1 to 31 across both columns, each one note", () => {
    expect(p119).toBeDefined();
    expect(p119!.notes.map((n) => n.number)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(p119!.notes.every((n) => n.label === `${n.number}-1`)).toBe(true);
    // a wrapped citation is one note, not a paragraph per line; "66. Roger Guillemette" is note 6's
    // own text, not a heading (the '####' of izw)
    const six = p119!.notes.find((n) => n.number === 6)!.text;
    expect(six).toContain("The NRO at the Crossroads, November 2000, p. 66. Roger Guillemette");
    expect(six).toContain("First 100 Missions (Cape Canaveral, FL, Specialty Press, 2001), pp. 467- 476.");
  });

  it("the body keeps the heading and the preamble, read off the layout, and nothing else", () => {
    expect(p119!.body).toEqual([]);
    expect(p119!.heading).toEqual([
      "   ENDNOTES FOR CHAPTER 5",
      "",
      "The citations that contain a reference to \"CAIB document\" with CAB or",
      "CTF followed by seven to eleven digits, such as CAB001-0010, refer to a",
      "document in the Columbia Accident Investigation Board database maintained",
      "by the Department of Justice and archived at the National Archives.",
    ]);
  });

  it("p.120 continues the section (32 to 79); p.121, the next chapter, closes it", () => {
    expect(p120!.notes.map((n) => n.number)).toEqual(Array.from({ length: 48 }, (_, i) => i + 32));
    expect(p120!.heading).toEqual([]);
    expect(p121).toBeUndefined();
    expect(reader.chapters).toHaveLength(1);
    expect(reader.chapters[0]).toMatchObject({ key: 1, name: "CHAPTER 5", notesAt: { volume: 1, pdfIndex: 119 } });
    expect(reader.chapters[0].numbers.size).toBe(79);
  });
});

describe("LayoutEndnotesReader on Deepwater's notes appendix (b89)", () => {
  const layout = layoutOf("deepwater-p323-324");
  const reader = new LayoutEndnotesReader(layout);
  const p323 = reader.page(at(323), ["ENDNOTES", "The Commission has reviewed …", "Chapter One", "1 Internal Halliburton …"]);
  const p324 = reader.page(at(324), ["19 Testimony of Ronald Sepulvado …"]);

  it("the appendix's subhead names chapter one; its preamble stays in the body as two paragraphs", () => {
    expect(reader.chapters.map((c) => c.name)).toEqual(["Chapter One"]);
    expect(p323!.heading[0]).toBe("ENDNOTES");
    const preamble = p323!.heading.slice(2);
    expect(preamble[0]).toMatch(/^The Commission has reviewed thousands of pages/);
    expect(preamble.indexOf("")).toBeGreaterThan(0);
    expect(preamble[preamble.indexOf("") + 1]).toMatch(/^The vast majority of non-public material/);
    expect(preamble.join(" ")).not.toContain("Chapter One");
  });

  it("notes 1-18, then 19-56 over the page, numbers raised or set small on a line of their own", () => {
    expect(p323!.notes.map((n) => n.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(p324!.notes.map((n) => n.number)).toEqual(Array.from({ length: 38 }, (_, i) => i + 19));
    expect(p323!.notes[0].text).toMatch(/^Internal Halliburton document \(HAL_0011208\); Testimony of Nathaniel Chaisson/);
    expect(p323!.notes[0].text).toMatch(/assigned by the entity that provided them\.$/);
    // note 19 is set small: "19" alone, its text on the next line
    expect(p324!.notes[0]).toMatchObject({ number: 19, label: "19-1" });
    expect(p324!.notes[0].text).toMatch(/^Testimony of Ronald Sepulvado, Hearing before the Deepwater Horizon Joint Investigation Team, July 23, 2010, 7, 14, 34\.$/);
  });
});

describe("chapterOfBlocks", () => {
  const chapter = (key: number, name: string, pdfIndex: number): EndnoteChapter => ({
    key,
    name,
    numbers: new Set([1, 2, 3]),
    notesAt: { volume: 1, pdfIndex },
  });
  const block = (kind: "heading" | "paragraph", text: string, pdfIndex: number): Block =>
    kind === "heading" ? { kind, level: 2, text, at: { volume: 1, pdfIndex, printed: null } } : { kind, text, at: { volume: 1, pdfIndex, printed: null } };

  it("a chapter runs from its heading to the next chapter's heading or its own notes; not the contents, not 'Chapter 10'", () => {
    const blocks = [
      block("paragraph", "Executive summary.1", 3),
      block("heading", "Chapter 1: The Evolution of the Space Shuttle Program", 10),
      block("paragraph", "body of one.2", 11),
      block("heading", "ENDNOTES FOR CHAPTER 1", 26),
      block("heading", "Chapter 2: Columbiaʼs Final Flight", 27),
      block("paragraph", "body of two.1", 28),
      block("heading", "Chapter 10: Other Significant Observations", 213),
      block("paragraph", "body of ten.1", 214),
    ];
    const chapters = [chapter(1, "CHAPTER 1", 26), chapter(2, "CHAPTER 2", 48), chapter(3, "CHAPTER 1O", 224)];
    const of = chapterOfBlocks(blocks, chapters);
    expect(of.get(blocks[0])).toBeUndefined();
    expect(of.get(blocks[2])?.key).toBe(1);
    expect(of.get(blocks[3])).toBeUndefined();
    expect(of.get(blocks[5])?.key).toBe(2);
    // past chapter 2's own notes (p.48), and "CHAPTER 1O" opens nothing: no chapter, so nothing links
    expect(of.get(blocks[7])).toBeUndefined();
  });
});

describe("linkLayoutMarkers with chapter scope", () => {
  it("links a raised marker to its own chapter's note as [^N-C], and nothing in a block of no chapter", () => {
    const f = JSON.parse(readFileSync(new URL("./fixtures/oracle/deepwater-p100.json", import.meta.url), "utf8"));
    const layout = buildLayout([parseLayoutXml(f.xml)]);
    const blocks = (f.blocks as Block[]).map((b) => ("text" in b ? { ...b, text: b.text.replace(/\[\^(\d+)\]/g, "$1") } : b));
    const numbers = new Set(Array.from({ length: 200 }, (_, i) => i + 1));
    const stats = linkLayoutMarkers(blocks, layout, { scope: "chapter", chapterOf: () => ({ key: 4, numbers }) });
    expect(stats.linked).toBeGreaterThan(0);
    const all = blocks.flatMap((b) => ("text" in b ? [b.text] : [])).join("\n");
    expect(all.match(/\[\^\d+-4\]/g)).toHaveLength(stats.linked);
    expect(all).not.toMatch(/\[\^\d+\]/);

    const none = (f.blocks as Block[]).map((b) => ("text" in b ? { ...b, text: b.text.replace(/\[\^(\d+)\]/g, "$1") } : b));
    expect(linkLayoutMarkers(none, layout, { scope: "chapter", chapterOf: () => undefined }).linked).toBe(0);
  });
});

describe("declaring it", () => {
  it("resolves, and a report declaring it has no page-foot notes", () => {
    const passes = [layoutEndnotes(), layoutMarkers({ scope: "chapter" })];
    const resolved = resolvePasses(pipeline({ id: "x", title: "x", repo: ".", volumes: [{ path: "x.pdf" }], passes }));
    expect(resolved.layoutEndnotes).toBe(true);
    expect(resolved.layoutMarkers).toEqual({ scope: "chapter", textFallback: false });
    expect(hasPageNotes(passes)).toBe(false);
  });
});
