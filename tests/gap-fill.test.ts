import { describe, expect, it } from "vitest";
import { assembleEdition, fillGaps, inlineMarkdown, type Edition } from "../src/edition";
import { splitPage } from "../src/clean";
import { footnoteNumbers } from "../src/passes";
import { pipeline, resolvePasses } from "../src/define";
import type { Page } from "../src/extract";
import type { Block } from "../src/paragraphs";

// Distinct sentences, so the aligner has unique anchors throughout.
const S = (i: number) => `Paragraph ${i} says something about the case numbered ${i * 13} in words of its own here`;
const page = (pdfIndex: number, lines: string[]): Page => ({ index: pdfIndex, volume: 1, pdfIndex, lines });
const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });

// Three PDF pages; the edition has pages 1 and 3 and says page 2 is missing.
const pages = [page(1, [S(1), "", S(2)]), page(2, [S(3), "", S(4)]), page(3, [S(5), "", S(6)])];
const shadow = {
  blocks: [1, 2, 3, 4, 5, 6].map((i): Block => ({ kind: "paragraph", text: S(i), at: at(Math.ceil(i / 2)) })),
  footnotes: [],
};
const printed = [1, 2, 3].map((n) => ({ volume: 1, pdfIndex: n, number: n }));

describe("fillGaps (reportsthatmatter-ivg.3)", () => {
  it("fills a declared gap with the shadow's blocks between the edition's words either side, with their page", () => {
    const edition: Edition = {
      blocks: [
        { kind: "paragraph", text: S(1) },
        { kind: "paragraph", text: S(2) },
        { kind: "gap", reason: "web page 2 not captured" },
        { kind: "paragraph", text: S(5) },
        { kind: "paragraph", text: S(6) },
      ],
      notes: [],
    };
    const { edition: out, filled } = fillGaps(edition, pages, shadow);
    expect(out.blocks.map((b) => (b as { text: string }).text)).toEqual([1, 2, 3, 4, 5, 6].map(S));
    expect(out.blocks[2].source).toEqual({ pdf: { volume: 1, pdfIndex: 2 }, gap: "web page 2 not captured" });
    expect(filled).toEqual([expect.objectContaining({ blocks: 2, from: { volume: 1, pdfIndex: 2 }, to: { volume: 1, pdfIndex: 2 } })]);
    // the page markers run on through the filled text, and the blocks say where their text came from
    const { body, blocks } = assembleEdition(out, pages, printed, []);
    expect(body.match(/%%page \d+%%/g)).toEqual(["%%page 1%%", "%%page 2%%", "%%page 3%%"]);
    expect(body.indexOf("%%page 2%%")).toBeLessThan(body.indexOf(S(3)));
    expect(blocks.map((b) => b.source)).toEqual(["edition", "edition", "pdf", "pdf", "edition", "edition"]);
  });

  it("fills nothing outside a declared gap", () => {
    const edition: Edition = { blocks: [1, 2, 5, 6].map((i) => ({ kind: "paragraph" as const, text: S(i) })), notes: [] };
    const result = fillGaps(edition, pages, shadow);
    expect(result.edition).toBe(edition);
    expect(result.filled).toEqual([]);
  });

  it("cuts a shadow block that straddles the gap's edge, so the edition's own words are not repeated", () => {
    // the shadow ran paragraphs 2 and 3 together; the edition has 2
    const fused = { ...shadow, blocks: [shadow.blocks[0], { kind: "paragraph", text: `${S(2)} ${S(3)}`, at: at(1) } as Block, ...shadow.blocks.slice(3)] };
    const edition: Edition = {
      blocks: [{ kind: "paragraph", text: S(1) }, { kind: "paragraph", text: S(2) }, { kind: "gap", reason: "gap" }, { kind: "paragraph", text: S(5) }, { kind: "paragraph", text: S(6) }],
      notes: [],
    };
    const { edition: out } = fillGaps(edition, pages, fused);
    expect(out.blocks.map((b) => (b as { text: string }).text)).toEqual([1, 2, 3, 4, 5, 6].map(S));
  });

  it("carries the notes the filled blocks cite, relabelled apart from the edition's, and drops running heads", () => {
    const withNote = {
      blocks: [...shadow.blocks.slice(0, 2), { kind: "heading", level: 3, text: "Chapter Two" } as Block, { kind: "paragraph", text: `${S(3)}`, at: at(2) } as Block, ...shadow.blocks.slice(3)],
      linkedText: [undefined, undefined, "### Chapter Two", `${S(3)}[^4]`, undefined, undefined, undefined],
      footnotes: [{ number: 4, text: "A letter of 1989.", volume: 1, pdfIndex: 2 }],
    };
    const pdfPages = [pages[0], page(2, ["Chapter Two", S(3), "", S(4)]), pages[2]];
    const edition: Edition = {
      blocks: [
        { kind: "heading", level: 3, text: "Chapter Two" },
        { kind: "paragraph", text: `${S(1)}[^1-2]` },
        { kind: "paragraph", text: S(2) },
        { kind: "gap", reason: "gap" },
        { kind: "paragraph", text: S(5) },
        { kind: "paragraph", text: S(6) },
      ],
      notes: [{ label: "1-2", text: "An edition note." }],
    };
    const { edition: out, filled } = fillGaps(edition, pdfPages, withNote);
    const texts = out.blocks.map((b) => (b as { text: string }).text);
    expect(texts).toContain(`${S(3)}[^4-9001]`);
    expect(texts.filter((t) => t === "Chapter Two")).toHaveLength(1);
    expect(out.notes).toEqual([{ label: "1-2", text: "An edition note." }, { label: "4-9001", text: "A letter of 1989." }]);
    expect(filled[0]).toEqual(expect.objectContaining({ notes: 1, dropped: 1 }));
  });
});

describe("footnoteNumbers('period') (reportsthatmatter-ivg.3)", () => {
  const lines = [
    "2.1.87 In October 1987 Sheffield City Council wrote to SWFC drawing attention to the",
    "accordingly; and that they would appoint a safety officer without delay.104",
    "",
    "    16. A numbered finding set in from the margin is the body's.",
    "",
    "",
    "",
    "104. Letter from Sheffield City Council to Sheffield Wednesday Football Club, 15 October 1987.",
    "105. Letter from Graham Mackrell to Sheffield City Council, 23 October 1987, SYP000096960001, p424.",
    "",
    "",
    "62      The Report of the Hillsborough Independent Panel",
  ];
  it("reads notes numbered '104. Letter…', flush at the edge, and gives the running foot back to the body", () => {
    const split = splitPage({ index: 65, volume: 1, pdfIndex: 65, lines }, 104, { footnoteNumbers: "period" });
    expect(split.footnotes.filter((l) => l.trim())).toHaveLength(2);
    expect(split.body).toContain("    16. A numbered finding set in from the margin is the body's.");
    expect(split.body[split.body.length - 1]).toMatch(/^62 +The Report/);
  });
  it("is opt-in: the bare style reads no notes here", () => {
    expect(splitPage({ index: 65, volume: 1, pdfIndex: 65, lines }, 104).footnotes).toEqual([]);
    const def = pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [footnoteNumbers("period")] });
    expect(resolvePasses(def).footnoteNumbers).toBe("period");
  });
});

describe("inlineMarkdown strike", () => {
  it("sets struck-through words as ~~…~~", () => {
    expect(inlineMarkdown([{ text: "these " }, { text: "animals", strike: true }, { text: " as they" }])).toBe("these ~~animals~~ as they");
  });
});
