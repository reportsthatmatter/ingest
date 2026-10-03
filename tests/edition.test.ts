import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { align } from "../src/align";
import { tokens, tokensBefore } from "../src/tokens";
import { htmlEvents, decodeEntities } from "../src/html";
import { assembleEdition, cleanEdition, inlineMarkdown, inlineText, type Edition, type PrintedPage } from "../src/edition";
import { losslessCheck } from "../src/fidelity";
import { pipeline, resolvePasses } from "../src/define";
import type { Page } from "../src/extract";

const w = (s: string) => tokens(s).map((t) => t.word);
const SENTENCES = Array.from({ length: 40 }, (_, i) => `sentence number ${i} talks about topic ${i * 7} in plain words here`).join(" ");

// The aligner moved here from the site's scorer (src/lib/score); these are its tests, moved with it.
describe("tokens", () => {
  it("folds case and diacritics and keeps offsets", () => {
    expect(w("Café, 9/11 — Shehhi’s")).toEqual(["cafe", "9", "11", "shehhi", "s"]);
    expect(tokensBefore("one two three", 4)).toBe(1);
  });
});

describe("align", () => {
  it("maps identical streams one to one", () => {
    const a = w(SENTENCES);
    const r = align(a, a);
    expect([...r.map].every((j, i) => j === i)).toBe(true);
  });

  it("aligns around an insertion and a deletion", () => {
    const a = w(SENTENCES);
    const b = [...a.slice(0, 50), "extra", "words", ...a.slice(50, 200), ...a.slice(205)];
    const r = align(a, b);
    expect(r.map[49]).toBe(49);
    expect(r.map[50]).toBe(52);
    for (let i = 200; i < 205; i++) expect(r.map[i]).toBe(-1);
    expect(r.map[205]).toBe(202);
  });

  it("matches a word split in one stream and whole in the other", () => {
    const base = w(SENTENCES);
    const a = [...base.slice(0, 30), "tue", "sday", ...base.slice(30)];
    const b = [...base.slice(0, 30), "tuesday", ...base.slice(30)];
    const r = align(a, b);
    expect(r.map[30]).toBe(30);
    expect(r.map[31]).toBe(30);
    expect(r.map[32]).toBe(31);
  });

  it("leaves a different text unaligned instead of matching its stray words", () => {
    const base = w(SENTENCES);
    const other = w("the court of the case and the opinion of the judge is the one that the parties of the action read in the morning of the day");
    const otherB = w("minutes of the meeting of the board show that the members of the committee of the institute met in the city of the river");
    const a = [...base.slice(0, 100), ...other, ...base.slice(100)];
    const b = [...base.slice(0, 100), ...otherB, ...base.slice(100)];
    const r = align(a, b);
    for (let i = 100; i < 100 + other.length; i++) expect(r.map[i]).toBe(-1);
    expect(r.map[100 + other.length]).toBe(100 + otherB.length);
  });

  it("keeps order when boilerplate repeats (no first-anchor jumps)", () => {
    const boiler = w("the court has considered the record and the arguments of counsel");
    const base = w(SENTENCES);
    const a = [...boiler, ...base.slice(0, 150), ...boiler, ...base.slice(150)];
    const b = [...base.slice(0, 150), ...boiler, ...base.slice(150)];
    const r = align(a, b);
    for (let i = 0; i < boiler.length; i++) expect(r.map[i]).toBe(-1);
    expect(r.map[boiler.length + 150]).toBe(150);
  });
});

describe("htmlEvents", () => {
  it("reads unclosed HTML 4 paragraphs, attributes and entities, and drops comments and scripts", () => {
    const ev = htmlEvents(`<!-- nav --><p align=center>A &amp; B&nbsp;C<script>x()</script><p><strong>D</strong><br/>&#151;`);
    expect(ev.filter((e) => e.kind === "start").map((e) => (e as { tag: string }).tag)).toEqual(["p", "p", "strong", "br"]);
    expect((ev[0] as { attrs: Record<string, string> }).attrs.align).toBe("center");
    expect(ev.filter((e) => e.kind === "text").map((e) => (e as { text: string }).text)).toEqual(["A & B C", "D", "—"]);
  });

  it("decodes named, decimal and hex references", () => {
    expect(decodeEntities("&eacute;&#233;&#xE9;&unknown;")).toBe("ééé&unknown;");
  });
});

describe("inlineMarkdown", () => {
  it("collapses space, keeps emphasis readable and closes markers up to their word", () => {
    expect(inlineMarkdown([{ text: "the USS " }, { text: " Cole ", em: true }, { text: " was hit. " }, { marker: "3-1" }])).toBe("the USS *Cole* was hit.[^3-1]");
  });

  it("moves punctuation out of emphasis that a letter follows, so Markdown still closes it", () => {
    expect(inlineMarkdown([{ text: "the " }, { text: "Economist'", em: true }, { text: "s point" }])).toBe("the *Economist*'s point");
  });

  it("merges adjacent runs and nests emphasis in bold", () => {
    expect(inlineMarkdown([{ text: "A", strong: true }, { text: " B", strong: true, em: true }, { text: ". rest" }])).toBe("**A *B***. rest");
  });

  it("escapes what Markdown would read as syntax", () => {
    expect(inlineMarkdown([{ text: "dialing *349 [^x] a_b" }])).toBe("dialing \\*349 \\[^x] a\\_b");
  });

  it("gives notes plain text: the renderer sets a note as it stands", () => {
    expect(inlineText([{ text: "See " }, { text: "Boston Globe", em: true }, { text: ", *349" }])).toBe("See Boston Globe, *349");
  });
});

/** A PDF page as pdftotext lays it out, after the furniture passes. */
const page = (pdfIndex: number, lines: string[]): Page => ({ index: pdfIndex, volume: 1, pdfIndex, lines });

const LONG = (n: number) => Array.from({ length: 12 }, (_, i) => `filler ${n} clause ${i} of the record`).join(" ");

describe("assembleEdition", () => {
  const pages = [
    page(1, ["CHAPTER ONE", `${LONG(1)} The hijackers—five men in all—`, "boarded at 7:40. The flight was sched-", "uled to depart at 7:45."]),
    page(2, [`${LONG(2)} It left the gate at 7:59.`, `${LONG(3)} Atta’s team took the first-class seats.”`, "said the agent,” Dec. 5."]),
  ];
  const printed: PrintedPage[] = [
    { volume: 1, pdfIndex: 1, number: 1 },
    { volume: 1, pdfIndex: 2, number: 2 },
  ];
  const edition = (): Edition => ({
    blocks: [
      { kind: "heading", level: 2, text: "CHAPTER ONE" },
      { kind: "paragraph", text: `${LONG(1)} The hijackers-five men in all-boarded at 7:40. The flight was sched-uled to depart at 7:45.[^1-1]` },
      { kind: "paragraph", text: `${LONG(2)} It left the gate at 7:59.` },
      { kind: "paragraph", text: `${LONG(3)} Atta's team took the first-class seats." said the agent,"Dec. 5.` },
    ],
    notes: [{ label: "1-1", text: "A note." }],
  });

  it("stamps each block with the page its first word is printed on", () => {
    const { body } = assembleEdition(edition(), pages, printed, []);
    const lines = body.split("\n\n");
    expect(lines[0]).toBe("%%page 1%%");
    expect(lines[1]).toBe("## CHAPTER ONE");
    expect(lines.indexOf("%%page 2%%")).toBe(lines.findIndex((l) => l.includes("It left the gate")) - 1);
  });

  it("marks a page that starts inside a block after that block", () => {
    const run: Page[] = [page(1, [`${LONG(1)} and the paragraph runs`]), page(2, [`on over the page. ${LONG(2)}`])];
    const ed: Edition = { blocks: [{ kind: "paragraph", text: `${LONG(1)} and the paragraph runs on over the page.` }, { kind: "paragraph", text: LONG(2) }], notes: [] };
    const { body } = assembleEdition(ed, run, printed, []);
    expect(body.split("\n\n")).toEqual(["%%page 1%%", `${LONG(1)} and the paragraph runs on over the page.`, "%%page 2%%", LONG(2)]);
  });

  it("restores the PDF's dashes, the space after punctuation and closes a line-end hyphen the edition kept", () => {
    const ed = edition();
    // "scheduled" printed whole elsewhere in the edition, so "sched-uled" is a line-end hyphen
    ed.blocks.push({ kind: "paragraph", text: "The flight was scheduled." });
    const { body, report } = assembleEdition(ed, pages, printed, []);
    expect(body).toContain("The hijackers—five men in all—boarded");
    expect(body).toContain("was scheduled to depart");
    expect(body).toContain('said the agent," Dec. 5.');
    expect(report.dashesRestored).toBe(2);
    expect(report.hyphensClosed).toBe(1);
    expect(report.spacesRestored).toBe(1);
  });

  it("keeps hyphens the PDF prints as hyphens", () => {
    const { body } = assembleEdition(edition(), pages, printed, []);
    expect(body).toContain("first-class seats");
  });

  it("reports edition text the PDF does not print, without changing it", () => {
    const ed = edition();
    ed.blocks.splice(2, 0, { kind: "paragraph", text: "An inserted sentence the printed report never carried at all." });
    const { body, suspects, report } = assembleEdition(ed, pages, printed, []);
    expect(body).toContain("An inserted sentence the printed report never carried at all.");
    expect(suspects.some((s) => s.pattern === "edition text not in the PDF" && s.match.startsWith("An inserted sentence"))).toBe(true);
    expect(report.disagreements.editionNotInPdf).toBeGreaterThan(0);
  });

  it("joins a paragraph a float interrupted mid-sentence and sets the float after it", () => {
    const run: Page[] = [page(1, [`${LONG(1)} the plot was`, "Photograph of the plotters"]), page(2, [`discovered in time. ${LONG(2)}`])];
    const ed: Edition = {
      blocks: [
        { kind: "paragraph", text: `${LONG(1)} the plot was` },
        { kind: "paragraph", text: "*Photograph of the plotters*", float: true },
        { kind: "paragraph", text: `discovered in time. ${LONG(2)}` },
      ],
      notes: [],
    };
    const { body, report } = assembleEdition(ed, run, printed, []);
    expect(body.split("\n\n")).toEqual([
      "%%page 1%%",
      `${LONG(1)} the plot was discovered in time. ${LONG(2)}`,
      "*Photograph of the plotters*",
      "%%page 2%%",
    ]);
    expect(report.alignedWords).toBe(report.editionWords);
  });

  it("writes notes as definitions and escapes a paragraph that opens like a list", () => {
    const ed: Edition = { blocks: [{ kind: "paragraph", text: `1. ${LONG(1)}[^1-1]` }], notes: [{ label: "1-1", text: "A note." }] };
    const { body, notes } = assembleEdition(ed, [page(1, [`1. ${LONG(1)}`])], printed, []);
    expect(body.split("\n\n")[1]).toBe(`1\\. ${LONG(1)}[^1-1]`);
    expect(notes).toBe("[^1-1]: A note.");
  });
});

describe("cleanEdition", () => {
  const dir = mkdtempSync(join(tmpdir(), "edition-"));
  writeFileSync(join(dir, "a.htm"), "<p>Hello");
  const sha256 = createHash("sha256").update("<p>Hello").digest("hex");

  it("checks each file's checksum before its adapter reads it", () => {
    const pass = cleanEdition({ dir, files: [{ path: "a.htm", sha256 }], read: (files) => ({ blocks: [{ kind: "paragraph", text: files[0].text }], notes: [] }) });
    expect(pass.read().blocks[0]).toEqual({ kind: "paragraph", text: "<p>Hello" });
    const bad = cleanEdition({ dir, files: [{ path: "a.htm", sha256: "0".repeat(64) }], read: () => ({ blocks: [], notes: [] }) });
    expect(() => bad.read()).toThrow(/checksum mismatch/);
  });

  it("is declared like any pass, once", () => {
    const pass = cleanEdition({ dir, files: [], read: () => ({ blocks: [], notes: [] }) });
    const def = { id: "x", title: "X", repo: ".", volumes: [{ path: "a.pdf" }] };
    expect(resolvePasses(pipeline({ ...def, passes: [pass] })).edition).toBe(pass);
    expect(resolvePasses(pipeline(def)).edition).toBeUndefined();
    expect(() => pipeline({ ...def, passes: [pass, pass] })).toThrow(/more than one cleanEdition/);
  });
});

describe("losslessCheck and a clean edition", () => {
  it("accepts words the PDF runs together or breaks at a line end, and still fails an invented one", () => {
    const source = "scramble interceptors.The threat was real. His team—\nSuqami and Yousef ’s men.";
    expect(losslessCheck(source, "scramble interceptors. The threat was real. His team—Suqami and Yousef's men.").ok).toBe(true);
    expect(losslessCheck(source, "scramble interceptors. The threat was imaginary.").ok).toBe(false);
  });
});
