import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { endnotes, numberedSections, type Pass } from "../src/passes";
import { numberedContents } from "../src/paragraphs";
import { splitFootnoteBlock } from "../src/clean";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

const run = (names: string[], passes: Pass[]) =>
  ingestPageGroups(
    [names.map((name, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines: fixture(name) }))],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  );

const runPages = (pages: string[][], passes: Pass[]) =>
  ingestPageGroups(
    [pages.map((lines, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines }))],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  );

const headings = (markdown: string) =>
  markdown.split("\n").filter((line) => /^#{2,3} /.test(line) && line !== "## Notes");

// The 9/11 Commission Report's contents (PDF pp.2-4), then chapter openings
// and section heads whose capitals the parser read wrongly.
const contents = ["911-contents-p5", "911-contents-p6", "911-contents-p7"];
const body = [
  "911-rise-of-bin-ladin", // p.72: "2.3 … (1988–1992)", lost into the paragraph below
  "911-adaptation", // p.90: "3.2 ADAPTATION—AND NONADAPTATION—IN THE" / "LAW ENFORCEMENT COMMUNITY"
  "911-chapter-4-opening", // p.125: a two-line banner, then "4.1 … KENYA" / "AND TANZANIA"
  "911-chapter-8-opening", // p.271: "THE SYSTEM WAS" / "BLINKING RED", then "8.1 THE SUMMER OF THREAT"
  "911-chapter-12-opening", // p.378: "WHAT TO DO?" / "A GLOBAL STRATEGY", then "12.1 …"
];

describe("numberedSections (reportsthatmatter-w8g)", () => {
  it("reads every numbered section and chapter the contents lists", () => {
    const listed = numberedContents([...contents.flatMap(fixture)]);
    expect(listed.sections.size).toBe(55);
    expect(listed.sections.get("8.1")).toBe("The Summer of Threat");
    expect(listed.sections.get("3.1")).toBe(
      "From the Old Terrorism to the New: The First World Trade Center Bombing"
    );
    expect(listed.sections.get("9.2")).toBe("September 11, 2001");
    expect(listed.chapters.has("whattodoaglobalstrategy")).toBe(true);
    expect(listed.chapters.has("howtodoitadifferentwayoforganizingthegovernment")).toBe(true);
  });

  it("fuses the chapter banner and its first section without the pass (the defect)", () => {
    const found = headings(run([...contents, ...body], []).markdown);
    expect(found).toContain('## "THE SYSTEM WAS BLINKING RED" 8.1 THE SUMMER OF THREAT');
    expect(found.some((h) => h.includes("2.3"))).toBe(false);
  });

  it("gives each section its own heading, spelt as the contents spells it, one level under its chapter", () => {
    const found = headings(run([...contents, ...body], [numberedSections()]).markdown);
    // Only the body's; the contents pages are laid out as before.
    const fromBody = found.slice(found.indexOf("### 2.3 The Rise of Bin Ladin and al Qaeda (1988–1992)"));
    expect(fromBody).toEqual([
      "### 2.3 The Rise of Bin Ladin and al Qaeda (1988–1992)",
      "### 3.2 Adaptation—and Nonadaptation— . . . in the Law Enforcement Community",
      "## RESPONSES TO AL QAEDA'S INITIAL ASSAULTS",
      "### 4.1 Before the Bombings in Kenya and Tanzania",
      '## "THE SYSTEM WAS BLINKING RED"',
      "### 8.1 The Summer of Threat",
      "## WHAT TO DO? A GLOBAL STRATEGY",
      "### 12.1 Reflecting on a Generational Challenge",
    ]);
  });

  it("keeps the prose under a section heading as prose", () => {
    const { markdown } = run([...contents, ...body], [numberedSections()]);
    expect(markdown).toMatch(/^### 2\.3 The Rise of Bin Ladin and al Qaeda \(1988–1992\)\n\nA decade of conflict in Afghanistan/m);
    expect(markdown).toMatch(/^### 8\.1 The Summer of Threat\n\nAs 2001 began/m);
  });
});

describe("endnotes (reportsthatmatter-vpx)", () => {
  it("reads a notes page's chapter head as note 11 when note 11 is expected (the defect)", () => {
    // In the whole report note 10 had just been read off an earlier notes page.
    const { footnotes } = splitFootnoteBlock(fixture("911-notes-chapter-11"), 11);
    expect(footnotes.join("\n")).toMatch(/^\s*11 Foresight—and Hindsight/);
  });

  it("reads no page-foot notes, and leaves the notes pages' text in place", () => {
    const { footnotes, markdown } = run(["911-notes-chapter-11"], [endnotes()]);
    expect(footnotes).toEqual([]);
    expect(markdown).toContain("11 Foresight—and Hindsight");
    expect(markdown).toContain("1. Roberta Wohlstetter, Pearl Harbor:");
  });
});

describe("endnotes appendix, chapter-restart numbering (reportsthatmatter-60p)", () => {
  const contentsPage = [
    "1.  Chapter One Title  10",
    "1.1  Section One  10",
    "1.2  Section Two  15",
    "2.  Chapter Two Title  20",
    "2.1  Section Three  20",
  ];
  const bodyChapterOne = ["Something happened here. 1 And more. 2"];
  const bodyChapterTwo = ["Something else happened. 1 Yet another thing. 2"];
  const notesChapterOne = [
    "1 Chapter One Title",
    "",
    "1. First note text for chapter one.",
    "",
    "2. Second note text for chapter one.",
  ];
  const notesChapterTwo = [
    "2 Chapter Two Title",
    "",
    "1. First note text for chapter two.",
    "",
    "2. Second note text for chapter two.",
  ];

  it("reads each chapter's notes under its own restarting numbers, off the body entirely", () => {
    const { footnotes, markdown } = runPages(
      [contentsPage, bodyChapterOne, bodyChapterTwo, notesChapterOne, notesChapterTwo],
      [endnotes(), numberedSections()]
    );

    expect(footnotes.map((n) => [n.number, n.text])).toEqual([
      [1, "First note text for chapter one."],
      [2, "Second note text for chapter one."],
      [1, "First note text for chapter two."],
      [2, "Second note text for chapter two."],
    ]);

    // Gone from the body: not read as a heading, a paragraph or a quote —
    // only as `[^N]:` definitions, in the `## Notes` block below, which
    // `stripNotesSection`/`withSidenotes` (markdown.ts) turn into sidenotes
    // at render time. (The contents page's own layout is reportsthatmatter-5fn,
    // not this bead: it is not under test here.)
    const body = markdown.slice(0, markdown.indexOf("## Notes"));
    expect(body).not.toContain("First note text");
    expect(body).not.toContain("1 Chapter One Title");
    expect(body).not.toContain("2 Chapter Two Title");

    // Both chapters' "1" and "2" markers are linked, restart and all.
    expect(markdown).toContain("here.[^1] And more.[^2]");
    expect(markdown).toContain("happened.[^1] Yet another thing.[^2]");
    // (`linkInlineMarkers` normalises "word. N" to "word.[^N]".)
    expect(markdown).toContain("[^1]: First note text for chapter one.");
    expect(markdown).toContain("[^1]: First note text for chapter two.");
  });

  it("links a flush-glued marker to its own chapter's note, restart and all", () => {
    const { markdown } = runPages(
      [
        contentsPage,
        ["CHAPTER ONE TITLE", "", "Something happened here.1 And more.2"],
        ["CHAPTER TWO TITLE", "", "Something else happened.1 Yet another thing.2"],
        notesChapterOne,
        notesChapterTwo,
      ],
      [endnotes(), numberedSections()]
    );

    expect(markdown).toContain("here.[^1] And more.[^2]");
    expect(markdown).toContain("happened.[^1] Yet another thing.[^2]");
  });
});
