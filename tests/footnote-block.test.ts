import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitPage } from "../src/clean";
import { parseFootnotes, linkInlineMarkers } from "../src/footnotes";
import { ingestPageGroups } from "../src/pipeline";

/**
 * Footnote text that leaked into the body (reportsthatmatter-g1f).
 *
 * Two shapes of real page foot, both from the Jack Smith report, where
 * `pdftotext -layout` puts note text *above* the first numbered note, so a
 * block anchored on that number left it in the body — where it became a
 * paragraph of raw citations, and split the paragraph it landed inside.
 */
const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8")
    .replace(/\f$/, "")
    .split("\n");

const page = (lines: string[], index: number) => ({ index, volume: 1, pdfIndex: index, lines });

const citations = (lines: string[]) => lines.filter((line) => /SCO-\d/.test(line));

describe("a note running over from the previous page (Jack Smith PDF p.21)", () => {
  const split = splitPage(page(fixture("jack-smith-note-p21"), 21), 45);

  it("takes the run-over lines out of the body", () => {
    expect(citations(split.body)).toEqual([]);
    expect(split.runOver?.[0]).toContain("Co-Conspirator 5 to Co-Conspirator 1 12/13/2020)");
  });

  it("keeps the body's last line, which ends mid-sentence", () => {
    const body = split.body.filter((line) => line.trim());
    expect(body[body.length - 1]).toContain("Indeed, the co-conspirators deliberately");
  });

  it("never reads a run-over line as a note: `169 (Text messages…` is a page reference", () => {
    expect(split.runOver).toHaveLength(3);
    expect(split.runOver?.[2]).toMatch(/^\s*169 \(Text messages/);
    expect(parseFootnotes(split.footnotes, 21).map((note) => note.number)).toEqual([45, 46, 47]);
  });
});

describe("run-overs at the edges of the rule (Jack Smith PDF p.14, p.66)", () => {
  it("a page with only three body lines above the notes (p.14)", () => {
    const split = splitPage(page(fixture("jack-smith-note-p14"), 14), 13);
    expect(citations(split.body)).toEqual([]);
    expect(split.runOver?.[0]).toMatch(/^Georgia election\); SCO-12998394/);
    expect(split.body.filter((line) => line.trim()).pop()).toContain("Trump and co-conspirators could not have believed");
  });

  it("a run-over only one blank line below the body, but two lines long (p.66)", () => {
    const split = splitPage(page(fixture("jack-smith-note-p66"), 66), 188);
    expect(citations(split.body)).toEqual([]);
    expect(split.runOver).toEqual([
      "12/29/2020); SCO-00039087 (Text messages among Co-Conspirator 2, Co-Conspirator 5, and Co-Conspirator 6",
      "12/28/2020).",
    ]);
    expect(split.body.filter((line) => line.trim()).pop()).toContain("was not supported by the Constitution or federal");
  });
});

describe("a note's first line set above its own number (Jack Smith PDF p.20, p.33)", () => {
  it("inline: `40 See` below the line that carries the rest of its text", () => {
    const split = splitPage(page(fixture("jack-smith-note-p20"), 20), 40);
    expect(citations(split.body)).toEqual([]);

    const notes = parseFootnotes(split.footnotes, 20);
    expect(notes[0].number).toBe(40);
    expect(notes[0].text).toBe(
      "See ECF No. 252 at 48-49 & nn.250-253; SCO-00310619 (Co-Conspirator 5 memo 11/18/2020); SCO-00310626 " +
        "(Co-Conspirator 5 memo 12/06/2020); SCO-00039311 (Co-Conspirator 5 memo 12/09/2020)."
    );
  });

  it("stacked: `104` alone below the line that carries its text", () => {
    const split = splitPage(page(fixture("jack-smith-note-p33"), 33), 104);
    expect(citations(split.body)).toEqual([]);

    const notes = parseFootnotes(split.footnotes, 33);
    expect(split.runOver).toBeUndefined();
    expect(notes[0].number).toBe(104);
    expect(notes[0].text).toBe(
      "See ECF No. 252 at 77-78 & nn.432-443; SCO-02244118 at 5, 6, 9, 22 (Remarks by Mr. Trump at Save America Rally 0 1/06/2021)."
    );
  });
});

describe("what the body keeps", () => {
  it("a single-spaced body sitting directly on its notes stays body", () => {
    const lines = [
      "the Subcommittee found that the bank had continued to sell the loans,",
      "and that its own risk managers had warned against it.",
      "",
      "",
      "12 See 4/16/2010 Subcommittee Hearing at 14.",
      "13 Id. at 22.",
    ];
    const split = splitPage(page(lines, 5), 12);
    expect(split.body.filter((line) => line.trim())).toHaveLength(2);
    expect(split.footnotes).toHaveLength(2);
  });

  it("a body line at the note margin above a lone note number stays body", () => {
    const lines = [
      "which the Subcommittee described in its report on the matter.",
      "",
      "the last line of a page set flush against its notes",
      "12",
      "     See 4/16/2010 Subcommittee Hearing at 14.",
      "13",
      "     Id. at 22.",
    ];
    const split = splitPage(page(lines, 5), 12);
    expect(split.body).toContain("the last line of a page set flush against its notes");
  });
});

describe("a single-spaced page set straight onto its notes (Litvinenko PDF p.27)", () => {
  // A chapter heading, then paragraphs with no blank line between them or
  // before the notes, and two blank lines under the running header: exactly
  // the run-over's shape, except that the body is single-spaced.
  const split = splitPage(page(fixture("litvinenko-notes-under-body"), 27), 63);

  it("keeps the heading and every paragraph in the body", () => {
    expect(split.body.join("\n")).toContain("Chapter 2:               Leaving Russia");
    expect(split.body.join("\n")).toContain("Moscow for Nalchik, saying that he was flying to Nalchik to visit relatives.68");
    expect(split.runOver).toBeUndefined();
  });

  it("reads its stacked notes as they are", () => {
    expect(parseFootnotes(split.footnotes, 27).map((note) => [note.number, note.text])).toEqual([
      [63, "Felshtinsky 23/141"],
      [64, "Felshtinsky 23/143 lines 14-17"],
      [65, "INQ017734 (page 22 paragraph 76); Marina Litvinenko 4/101"],
      [66, "INQ017734 (page 12 paragraph 43); Marina Litvinenko 3/90-91"],
      [67, "Felshtinsky 23/143-144"],
      [68, "Marina Litvinenko 3/94-95; Felshtinsky 23/145 lines 13-16"],
    ]);
  });
});

describe("across the page break (Jack Smith PDF pp.20-22)", () => {
  const result = ingestPageGroups(
    [[page(fixture("jack-smith-note-p20"), 20), page(fixture("jack-smith-note-p21"), 21), page(fixture("jack-smith-note-p22"), 22)]],
    { title: "Fixture" }
  );
  const [body, notes] = result.markdown.split("\n## Notes\n");

  it("leaves no paragraph of citations in the body", () => {
    const paragraphs = body.split(/\n\n+/).filter((p) => /SCO-\d/.test(p));
    expect(paragraphs).toEqual([]);
  });

  it("rejoins the sentence the leaked note used to split", () => {
    expect(body).toContain("Indeed, the co-conspirators deliberately withheld from the elector nommees");
  });

  it("gives the run-over back to the note it belongs to", () => {
    const note44 = notes.match(/^\[\^44\]: (.*)$/m)?.[1] ?? "";
    expect(note44).toMatch(/SCO-00309939 \(Email from Co-Conspirator 5 to Co-Conspirator 1 12\/13\/2020\); SCO-02296764/);
  });
});

describe("numbers that are not footnote markers (PSI)", () => {
  it("a contents page number after a dot leader (PSI PDF p.3)", () => {
    const text = "A. Subcommittee Investigation . . . .. . . . . . . . . . . . 1 B. Overview . . . .. . . . . . . 2";
    expect(linkInlineMarkers(text, new Set([1, 2]))).toBe(text);
  });

  it("a count: `75 out of 75` (PSI PDF p.13)", () => {
    const text =
      "In the case of Long Beach, 75 out of 75 AAA rated Long Beach securities issued in 2006, were later downgraded to junk status.";
    expect(linkInlineMarkers(text, new Set([75]))).toBe(text);
  });

  it("still links a real marker after a sentence", () => {
    expect(
      linkInlineMarkers("deeming them safe investments even though many relied on high risk home loans. 1 In late 2006,", new Set([1]))
    ).toBe("deeming them safe investments even though many relied on high risk home loans.[^1] In late 2006,");
  });

  it("still links a real marker after an ellipsis", () => {
    expect(linkInlineMarkers('he said it "would . . . . 7 In fact,', new Set([7]))).toContain("[^7]");
  });
});
