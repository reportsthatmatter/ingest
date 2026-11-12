import { describe, expect, it } from "vitest";
import { mergeAcrossPages, type Block } from "../src/paragraphs";
import { pipeline, resolvePasses } from "../src/define";
import { numberedInSequence, numberedParagraphs } from "../src/passes";

const p = (text: string): Block => ({ kind: "paragraph", text });
const page = (n: number): Block => ({ kind: "page", number: n });
const openings = (blocks: Block[]) =>
  blocks.filter((b) => b.kind === "paragraph").map((b) => (b as { text: string }).text.split(" ")[0]);

describe("numberedInSequence (reportsthatmatter-gqsy.4.2)", () => {
  it("joins a time of day wrapped to the head of a line, on the same page (Grenfell Vol 6, 97.108)", () => {
    const blocks = [
      p("97.108 At 02.01 Debbie Lamprell told CRO Jabin that the windows were cracking and at about"),
      p("02.05 she said that she had lost her friend; he had disappeared and she did not know where he was."),
      p("97.109 The next call was made at 02.10."),
    ];
    expect(openings(mergeAcrossPages(blocks, { numberedInSequence: true }))).toEqual(["97.108", "97.109"]);
    expect(openings(mergeAcrossPages(blocks))).toEqual(["97.108", "02.05", "97.109"]);
  });

  it("joins a clause reference across a page, and one opening on a capital (Grenfell Vol 2, Vol 7)", () => {
    const blocks = [
      p("22.105 Despite the BBA's evidence, the statement that K15 could be used in accordance with paragraph"),
      page(87),
      p("12.7 of Approved Document B was dangerously misleading."),
      p("104.20 The information was ready at"),
      p("04.29 Mr Norris sent the information to various members of the Home Office."),
    ];
    expect(openings(mergeAcrossPages(blocks, { numberedInSequence: true }))).toEqual(["22.105", "104.20"]);
  });

  it("leaves its own chapter's numbers, a finished sentence and a chapter's first paragraph alone", () => {
    // a quoted standard's own numbering inside its chapter (Grenfell Vol 1, 5.55)
    expect(openings(mergeAcrossPages([p("5.54 The test is run as follows"), p("5.55 The visual observations to be taken")], { numberedInSequence: true }))).toEqual(["5.54", "5.55"]);
    expect(openings(mergeAcrossPages([p("97.108 She called at 02.01."), p("02.05 was the time of the last call.")], { numberedInSequence: true }))).toEqual(["97.108", "02.05"]);
    // Leveson 1.1 after a banner read as a paragraph (reportsthatmatter-1iz4)
    expect(openings(mergeAcrossPages([p("7.22 Sir Christopher Meyer also rejected the characterisation."), p("Crossing legal boundaries: the criminal and civil law"), page(445), p("1.1 An Inquiry into the culture of the press.")], { numberedInSequence: true }))).toEqual(["7.22", "Crossing", "1.1"]);
  });

  it("is a known pass, effective only with numberedParagraphs", () => {
    const base = { id: "x", title: "x", repo: ".", volumes: [{ path: "a.pdf" }] };
    expect(resolvePasses(pipeline({ ...base, passes: [numberedParagraphs(), numberedInSequence()] })).numberedInSequence).toBe(true);
    expect(resolvePasses(pipeline({ ...base, passes: [numberedInSequence()] })).numberedInSequence).toBe(false);
  });
});

describe("letteredItems({ fromVolume }) (reportsthatmatter-gqsy.4.2)", () => {
  it("resolves the first volume, and stays as before without it", async () => {
    const { letteredItems } = await import("../src/passes");
    const base = { id: "x", title: "x", repo: ".", volumes: [{ path: "a.pdf" }] };
    expect(resolvePasses(pipeline({ ...base, passes: [letteredItems({ fromVolume: 2 })] })).letteredItemsFrom).toBe(2);
    expect(resolvePasses(pipeline({ ...base, passes: [letteredItems()] })).letteredItemsFrom).toBeUndefined();
  });

  it("merges an earlier volume's blocks as if it were not declared", () => {
    const at = (volume: number) => ({ volume, pdfIndex: 1, printed: 1 });
    const blocks = (volume: number): Block[] => [
      { kind: "paragraph", text: "the matters were these: Mr Smith said", at: at(volume) } as Block,
      { kind: "paragraph", text: "b. that he had not seen it.", at: at(volume) } as Block,
    ];
    const opts = { letteredItems: true, letteredItemsFrom: 2 };
    expect(mergeAcrossPages(blocks(1), opts)).toHaveLength(1);
    expect(mergeAcrossPages(blocks(2), opts)).toHaveLength(2);
  });
});

describe("a heading's own closing number is not a page number (reportsthatmatter-gqsy.4.2)", () => {
  it("keeps Floor N, Phase N and a year range, and still strips a page number", async () => {
    const { toBlocks } = await import("../src/paragraphs");
    const heading = (line: string) => toBlocks([line], 0).find((b) => b.kind === "heading") as { text: string } | undefined;
    expect(heading("Chapter 86: Floor 4")?.text).toMatch(/Floor 4$/);
    expect(heading("Part 11: Matters outstanding from Phase 1")?.text).toMatch(/Phase 1$/);
    expect(heading("Chapter 110: The escape of fire from Flat 16")?.text).toMatch(/Flat 16$/);
  });
});
