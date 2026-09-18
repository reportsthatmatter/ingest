import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toBlocks, contentsHeadings, type Block } from "../src/paragraphs";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { chapterContents, numberedHeadings, geometry } from "../src/passes";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

describe("chapterContents (reportsthatmatter-lnw)", () => {
  // Saville p142: Chapter 8's title wraps, then its own contents list, each
  // subsection located by paragraph ("Internment   8.35") under a
  // "Paragraph" column label.
  const lines = fixture("saville-chapter-contents");

  it("reads a paragraph-located contents list as contents entries", () => {
    const blocks = toBlocks(lines, undefined, 10, true, false, true);
    const contents = blocks.filter((b) => b.kind === "contents");
    expect(contents).toContainEqual({ kind: "contents", text: "Internment", page: "8.35" });
    // A wrapped entry is rejoined before its locator.
    expect(contents).toContainEqual({
      kind: "contents",
      text: "The meeting between the British and Northern Irish Prime Ministers on 7th October 1971",
      page: "8.89",
    });
    expect(contents).toHaveLength(26);
  });

  it("does not fold the locator column's label into the chapter title", () => {
    const blocks = toBlocks(lines, undefined, 10, true, false, true);
    const heading = blocks.find((b) => b.kind === "heading") as { text: string };
    expect(heading.text).toBe("Chapter 8: The period from August to");
    expect(blocks.some((b) => "text" in b && b.text === "Paragraph")).toBe(false);
  });

  it("reads the list as one run-on paragraph without the pass (the defect)", () => {
    const blocks = toBlocks(lines, undefined, 10, true, false);
    expect(blocks.some((b) => b.kind === "contents")).toBe(false);
  });

  const at = undefined;
  const entry = (text: string, page: string): Block => ({ kind: "contents", text, page, at });

  it("completes a chapter title cut at a wrap from the outline contents", () => {
    const out = contentsHeadings([
      entry("Chapter 8: The period from August to December 1971", "142"),
      { kind: "heading", level: 3, text: "Chapter 8: The period from August to" },
      { kind: "paragraph", text: "December 1971" },
    ]);
    expect(out[1]).toMatchObject({ kind: "heading", text: "Chapter 8: The period from August to December 1971" });
    expect(out).toHaveLength(2);
  });

  it("makes a line exactly matching a subsection entry its heading, and nothing else", () => {
    const out = contentsHeadings([
      entry("Internment", "8.35"),
      { kind: "paragraph", text: "Internment" },
      { kind: "paragraph", text: "Internment was introduced on 9th August 1971." },
    ]);
    expect(out[1]).toMatchObject({ kind: "heading", level: 4, text: "Internment" });
    expect(out[2]).toMatchObject({ kind: "paragraph" });
  });

  it("splits a subsection title joined onto the paragraph before it at a page break", () => {
    const out = contentsHeadings([
      entry('A "plan within a plan"', "9.764"),
      { kind: "paragraph", text: 'likely to have been shared by many others in 1 PARA. A "plan within a plan"' },
    ]);
    expect(out.slice(1)).toMatchObject([
      { kind: "paragraph", text: "likely to have been shared by many others in 1 PARA." },
      { kind: "heading", level: 4, text: 'A "plan within a plan"' },
    ]);
  });

  it("rejoins an outline entry whose title wraps onto its page-number line", () => {
    const out = contentsHeadings([
      entry("Chapter 1: Introduction", "45"),
      { kind: "heading", level: 3, text: "Chapter 24: The movement of Mortar Platoon Armoured Personnel Carriers into" },
      entry("the Bogside", "27"),
    ]);
    expect(out[1]).toEqual(
      entry("Chapter 24: The movement of Mortar Platoon Armoured Personnel Carriers into the Bogside", "27")
    );
  });

  it("is off unless declared", () => {
    expect(resolvePasses(pipeline(base)).chapterContents).toBe(false);
    expect(resolvePasses(pipeline({ ...base, passes: [chapterContents()] })).chapterContents).toBe(true);
  });
});

describe("numberedHeadings", () => {
  it("keeps a numbered item of a quoted document as text, number and all", () => {
    // Saville p185 quotes Sir Philip Allen's options: "1. Withdrawing the Army".
    const lines = [
      "                 1. Withdrawing the Army",
      "",
      "                 (Withdrawal could either be immediate or after a stated period. It was an option",
    ];
    const off = toBlocks(lines, 10, 10, true, false, false, false);
    expect(off.some((b) => b.kind === "heading")).toBe(false);
    expect(off[0]).toMatchObject({ text: "1. Withdrawing the Army" });
    const on = toBlocks(lines, 10, 10, true, false);
    expect(on[0]).toMatchObject({ kind: "heading", text: "Withdrawing the Army" });
  });

  it("is on unless a report opts out", () => {
    expect(resolvePasses(pipeline(base)).numberedHeadings).toBe(true);
    expect(
      resolvePasses(pipeline({ ...base, passes: [numberedHeadings(false)] })).numberedHeadings
    ).toBe(false);
  });
});

describe("geometry(per-page)", () => {
  // Saville sets a right-hand page's body at column 16 and a left-hand page's
  // at 7. One document margin reads every line of the right-hand page as a
  // fresh paragraph.
  // Left-hand pages carry more body lines in the whole document, so the one
  // document margin lands on theirs; two of them here reproduce that.
  const pages = ["saville-verso", "saville-recto", "saville-verso"].map((name, i) => ({
    index: i + 1,
    volume: 1,
    pdfIndex: i + 1,
    lines: fixture(name),
  }));
  const markdown = (scope: "per-page" | "document") => {
    const resolved = {
      ...resolvePasses(pipeline({ ...base, passes: [geometry(scope)] })),
      numberedParagraphs: true,
    };
    return ingestPageGroups([pages], { title: "T" }, resolved).markdown;
  };

  it("measures each page's own margin", () => {
    // 8.90, on the right-hand page, runs "…in order to maintain the status"
    // / "quo…" across a line. With one margin the rest of it is severed and
    // relabelled a quotation.
    expect(markdown("document")).toMatch(/maintain the status\n\n> quo/);
    expect(markdown("per-page")).toMatch(/maintain the status quo/);
  });
});
