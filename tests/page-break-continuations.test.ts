import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeAcrossPages, type Block } from "../src/paragraphs";
import { pageBreakSplits } from "../src/fidelity";
import { ingestPageGroups } from "../src/pipeline";
import { pageBreakContinuations } from "../src/passes";
import { pipeline, resolvePasses } from "../src/define";

/**
 * A sentence broken across a page break and left as two blocks
 * (reportsthatmatter-ca3, reportsthatmatter-kb4; jack-smith-report#1).
 *
 * `mergeAcrossPages` already joins a lower-case paragraph onto a paragraph
 * that stops mid-sentence, but it looks past one page marker only. A
 * paragraph that runs over a whole page leaves its first page marker behind
 * it, so on the page after, the previous block is a marker, not the
 * paragraph, and nothing joins. And a skewed scan insets a page's first lines,
 * so the continuation arrives as a quotation, which was never joined at all.
 */

const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
const para = (text: string, page: number): Block => ({ kind: "paragraph", text, at: at(page) });
const quote = (text: string, page: number): Block => ({ kind: "quote", text, at: at(page) });
const marker = (page: number): Block => ({ kind: "page", number: page, at: at(page) });
const texts = (blocks: Block[]) =>
  blocks.filter((block) => block.kind !== "page").map((block) => ("text" in block ? block.text : block.kind));

const ON = { continuations: true };

describe("pageBreakContinuations: a paragraph running over a whole page", () => {
  // Jack Smith p.2-4: the paragraph starting on p.2 fills p.3, so p.3's
  // marker sits after it, and p.4's continuation meets two markers.
  const blocks = [
    para("As set forth in the original and superseding indictments, he resorted to", 2),
    marker(3),
    para("a series of criminal efforts. The throughline was deceit-knowingly false claims of election", 3),
    marker(4),
    para("fraud-and the evidence shows that Mr. Trump used these lies as a weapon.", 4),
  ];

  it("is left split without the pass (today's output)", () => {
    expect(texts(mergeAcrossPages(structuredClone(blocks)))).toHaveLength(2);
  });

  it("joins the continuation onto the paragraph with the pass", () => {
    const merged = mergeAcrossPages(structuredClone(blocks), ON);
    expect(texts(merged)).toEqual([
      "As set forth in the original and superseding indictments, he resorted to a series of criminal efforts. The throughline was deceit-knowingly false claims of election fraud-and the evidence shows that Mr. Trump used these lies as a weapon.",
    ]);
    // Both markers are kept, after the paragraph whose sentence began before them.
    expect(merged.filter((block) => block.kind === "page")).toHaveLength(2);
  });

  it("still leaves a capitalised opening on the next page alone (reportsthatmatter-q0m)", () => {
    const merged = mergeAcrossPages(
      [para("a paragraph that stops without a full stop", 2), marker(3), marker(4), para("The next paragraph.", 4)],
      ON
    );
    expect(texts(merged)).toHaveLength(2);
  });
});

describe("pageBreakContinuations: a page whose first lines were read as a quotation", () => {
  it("joins a lower-case page-opening quote that continues the sentence (kb4)", () => {
    const merged = mergeAcrossPages(
      [
        para("Conversely, a select few of Mr. Trump's agents had insight into the", 14),
        marker(15),
        quote("ultimate plan to use the fraudulent elector certificates. On December 9, after a phone call with Co-Conspirator 5,", 15),
        para("Mr. Chesebro sent a memo.", 15),
      ],
      ON
    );
    expect(texts(merged)).toEqual([
      "Conversely, a select few of Mr. Trump's agents had insight into the ultimate plan to use the fraudulent elector certificates. On December 9, after a phone call with Co-Conspirator 5,",
      "Mr. Chesebro sent a memo.",
    ]);
  });

  it("joins all three pieces of one sentence: paragraph, inset lines, paragraph (ca3 example 3)", () => {
    const blocks = [
      para("Mr. Trump and co-conspirators could not have believed the specific fraud claims that they were", 6),
      marker(7),
      quote("making because the numbers they touted frequently vacillated wildly, including Co-Conspirator 3's claims that Mr. Trump privately", 7),
      para('acknowledged sounded "crazy" before he publicly amplified them.', 7),
    ];
    expect(texts(mergeAcrossPages(structuredClone(blocks)))).toHaveLength(3);
    expect(texts(mergeAcrossPages(structuredClone(blocks), ON))).toEqual([
      'Mr. Trump and co-conspirators could not have believed the specific fraud claims that they were making because the numbers they touted frequently vacillated wildly, including Co-Conspirator 3\'s claims that Mr. Trump privately acknowledged sounded "crazy" before he publicly amplified them.',
    ]);
  });

  it("joins a capitalised page-opening quote when it runs on into a lower-case paragraph (skew)", () => {
    const merged = mergeAcrossPages(
      [
        para("the call was placed by", 6),
        marker(7),
        quote("Mr. Meadows, who told the Secretary that", 7),
        para("the President wanted to talk.", 7),
      ],
      ON
    );
    expect(texts(merged)).toEqual(["the call was placed by Mr. Meadows, who told the Secretary that the President wanted to talk."]);
  });

  it("leaves a genuine quotation introduced with a colon", () => {
    const blocks = [para("The statute provides:", 6), marker(7), quote("any person who obstructs an official proceeding", 7)];
    expect(texts(mergeAcrossPages(structuredClone(blocks), ON))).toHaveLength(2);
  });

  it("leaves a genuine quotation that opens with a quotation mark", () => {
    const blocks = [para("Mr. Trump said that", 6), marker(7), quote('"we won this election, and we won it by a landslide."', 7)];
    expect(texts(mergeAcrossPages(structuredClone(blocks), ON))).toHaveLength(2);
  });

  it("leaves a capitalised quotation that is not followed by a continuation", () => {
    const blocks = [
      para("He wrote to the Vice President in these terms", 6),
      marker(7),
      quote("You must reject the electors from the contested states", 7),
      para("Mr. Pence declined.", 7),
    ];
    expect(texts(mergeAcrossPages(structuredClone(blocks), ON))).toHaveLength(3);
  });

  it("leaves a lower-case quotation that is not at a page break", () => {
    const blocks = [para("a paragraph that stops without a full stop", 7), quote("and a quote below it on the same page", 7)];
    expect(texts(mergeAcrossPages(structuredClone(blocks), ON))).toHaveLength(2);
  });

  it("leaves a quoted list at the top of a page", () => {
    const blocks: Block[] = [
      para("the memo listed the following steps", 6),
      marker(7),
      { kind: "list", items: ["convene the electors", "transmit the certificates"], quoted: true, at: at(7) },
    ];
    const merged = mergeAcrossPages(structuredClone(blocks), ON);
    expect(merged.filter((block) => block.kind === "list")).toHaveLength(1);
  });

  it("does not join a quote onto a heading", () => {
    const blocks: Block[] = [
      { kind: "heading", level: 2, text: "THE LAW OF", at: at(6) },
      marker(7),
      quote("obstruction of an official proceeding", 7),
    ];
    expect(mergeAcrossPages(structuredClone(blocks), ON).filter((block) => block.kind === "quote")).toHaveLength(1);
  });
});

describe("the pass is opt-in", () => {
  it("is declared by name and off unless declared", () => {
    const base = { id: "t", title: "t", repo: ".", volumes: [{ path: "a.pdf" }] };
    expect(resolvePasses(pipeline(base)).pageBreakContinuations).toBe(false);
    expect(resolvePasses(pipeline({ ...base, passes: [pageBreakContinuations()] })).pageBreakContinuations).toBe(true);
  });
});

const doc = (...blocks: string[]) => `---\ntitle: "t"\n---\n\n${blocks.join("\n\n")}\n`;

describe("pageBreakSplits (the measure)", () => {
  it("finds a lower-case paragraph behind two page markers — severedSentenceCheck cannot", () => {
    const splits = pageBreakSplits(
      doc("deceit-knowingly false claims of election", "%%page 3#2%%", "%%page 4#2%%", "fraud-and the evidence shows.")
    );
    expect(splits.map((split) => split.kind)).toEqual(["paragraph"]);
  });

  it("finds a lower-case page-opening quote and a skew quote", () => {
    const splits = pageBreakSplits(
      doc(
        "had insight into the",
        "%%page 15%%",
        "> ultimate plan to use the certificates.",
        "Something else.",
        "the call was placed by",
        "%%page 16%%",
        "> Mr. Meadows, who told the Secretary that",
        "the President wanted to talk."
      )
    );
    expect(splits.map((split) => split.kind)).toEqual(["quote", "skewQuote"]);
  });

  it("reads a sentence end in front of a footnote marker", () => {
    expect(pageBreakSplits(doc("election fraud.[^13]", "%%page 7%%", "and then."))).toEqual([]);
  });

  it("does not count a proper quotation, a list, a colon, or a split within a page", () => {
    const splits = pageBreakSplits(
      doc(
        "Mr. Trump said that",
        "%%page 7%%",
        '> "we won."',
        "the memo listed",
        "%%page 8%%",
        "> - convene the electors",
        "The statute provides:",
        "%%page 9%%",
        "> any person who",
        "a paragraph without a stop",
        "> on the same page"
      )
    );
    expect(splits).toEqual([]);
  });

  it("counts a capitalised continuation separately, as a candidate only", () => {
    const splits = pageBreakSplits(doc("the Rossville", "%%page 7%%", "Flats. Patrick Campbell was shot."));
    expect(splits.map((split) => split.kind)).toEqual(["capitalised"]);
  });
});

/** Real pages: Jack Smith PDF pp.10-15, printed pp.2-7 (jack-smith-report#1). */
const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8")
    .replace(/\f$/, "")
    .split("\n");
const pages = [10, 11, 12, 13, 14, 15].map((index) => ({
  index,
  volume: 1,
  pdfIndex: index,
  lines: fixture(`jack-smith-page-break-p${index}`),
}));
const DEFAULTS = {
  geometry: "document" as const,
  flushFootnoteMarkers: false,
  numberedParagraphs: false,
  allCapsHeadings: true,
  bodyPasses: [],
  volumePasses: [],
};
const body = (markdown: string) => markdown.split("\n## Notes\n")[0];
const prose = (markdown: string) => body(markdown).replace(/^> /gm, "").replace(/\[\^\d+\]/g, "").replace(/\s+/g, " ");

describe("Jack Smith printed pp.2-7, as the report prints them", () => {
  const before = ingestPageGroups([structuredClone(pages)], { title: "Fixture" }, DEFAULTS).markdown;
  const after = ingestPageGroups([structuredClone(pages)], { title: "Fixture" }, {
    ...DEFAULTS,
    pageBreakContinuations: true,
  }).markdown;

  it("splits three sentences at page breaks without the pass", () => {
    expect(pageBreakSplits(before).map((split) => split.kind).sort()).toEqual(["paragraph", "paragraph", "quote"]);
  });

  it("has no page-break splits with the pass", () => {
    expect(pageBreakSplits(after).filter((split) => split.kind !== "capitalised")).toEqual([]);
    expect(body(after)).not.toMatch(/^> /m);
  });

  it("reads all three examples as continuous prose", () => {
    const text = prose(after);
    expect(text).toContain("false claims of election fraud-and the evidence shows");
    expect(text).toContain("monitored legal developments regarding the election and was on notice");
    expect(text).toContain(
      "the specific fraud claims that they were making because the numbers they touted"
    );
    expect(text).toMatch(/Mr\. Trump privately acknowledged sounded "crazy"/);
  });

  it("loses no words and adds none", () => {
    const words = (markdown: string) => prose(markdown).replace(/%%page [^%]+%%/g, "").split(" ").filter(Boolean).sort();
    expect(words(after)).toEqual(words(before));
  });
});
