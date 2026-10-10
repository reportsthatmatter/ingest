import { describe, expect, it } from "vitest";
import { mergeAcrossPages, type Block } from "../src/paragraphs";
import { pipeline, resolvePasses } from "../src/define";
import { numberedOpenings, numberedParagraphs } from "../src/passes";

const p = (text: string): Block => ({ kind: "paragraph", text });

describe("numberedOpenings (reportsthatmatter-f951)", () => {
  const blocks = () => [
    p("Its design for the cavity barriers was incomplete and did not comply with the guidance in Approved Document B."),
    p("2.86 RBKC's building control department failed to perform its statutory function."),
  ];

  it("keeps a numbered paragraph after an initial apart (Grenfell 2.86)", () => {
    const merged = mergeAcrossPages(blocks(), { numberedOpenings: true });
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ text: expect.stringMatching(/^2\.86 RBKC/) });
  });

  it("keeps one opening on a quotation mark apart too", () => {
    const merged = mergeAcrossPages([p("as Mr J."), p("9.42 “In relation to the last matter”")], { numberedOpenings: true });
    expect(merged).toHaveLength(2);
  });

  it("without the pass, the initial rule still joins (the old behaviour, unchanged)", () => {
    expect(mergeAcrossPages(blocks())).toHaveLength(1);
  });

  it("still joins a name after an initial, and a measurement after an abbreviation", () => {
    expect(mergeAcrossPages([p("said Mr."), p("Trump has something else left.")], { numberedOpenings: true })).toHaveLength(1);
    expect(mergeAcrossPages([p("see para."), p("4.3 above for the details.")], { numberedOpenings: true })).toHaveLength(1);
  });

  it("joins a page opening on another chapter's paragraph number after an unfinished sentence (Grenfell p.221)", () => {
    const page = (n: number): Block => ({ kind: "page", number: n });
    const blocks = [
      p("14.8 Elspeth Grant wrote to Sir Merrick Cockell on 23 August 2011 saying that paragraphs"),
      page(221),
      p("79.9 to 79.11 of the LGA Guide encouraged readers to ignore the Fire Safety Order."),
      p("14.9 The LGA replied."),
    ];
    const merged = mergeAcrossPages(blocks, { numberedOpenings: true });
    expect(merged.filter((b) => b.kind === "paragraph").map((b) => (b as { text: string }).text.slice(0, 4))).toEqual(["14.8", "14.9"]);
    // its own chapter's next number after an unfinished sentence stays a paragraph
    const own = mergeAcrossPages([p("14.8 He said that"), page(221), p("14.9 The LGA replied.")], { numberedOpenings: true });
    expect(own.filter((b) => b.kind === "paragraph")).toHaveLength(2);
  });

  it("keeps a chapter's opening paragraph apart from a banner that ends without a full stop (Leveson 1.1, reportsthatmatter-1iz4)", () => {
    const page = (n: number): Block => ({ kind: "page", number: n });
    const blocks = [
      p("7.22 Sir Christopher Meyer also rejected the characterisation."),
      p("Crossing legal boundaries: the criminal and civil law"),
      page(445),
      p("1.1 An Inquiry into the culture, practices and ethics of the press might not be thought to engage the law."),
    ];
    const merged = mergeAcrossPages(blocks, { numberedOpenings: true });
    expect(merged.filter((b) => b.kind === "paragraph")).toHaveLength(3);
  });

  it("is resolved only together with numberedParagraphs", () => {
    const base = { id: "x", title: "x", authors: "x", published_at: "x", source_url: "x", repo: ".", volumes: [{ path: "a.pdf", sha256: "0" }] };
    expect(resolvePasses(pipeline({ ...base, passes: [numberedOpenings()] })).numberedOpenings).toBe(false);
    expect(resolvePasses(pipeline({ ...base, passes: [numberedParagraphs(), numberedOpenings()] })).numberedOpenings).toBe(true);
  });
});
