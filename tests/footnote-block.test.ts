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

/**
 * A note whose text opens on a number (reportsthatmatter-je7).
 *
 * PSI sets its notes stacked: the number alone, the text beneath. Text that
 * begins "2009 OTS Annual Report…" is shaped exactly like an inline note
 * "2009", and read that way the running note counter jumped to 2010, so the
 * next three pages found no note near the one expected and printed their
 * notes (604-609) in the body.
 */
describe("a note's text opening on a year (PSI PDF pp.173-175)", () => {
  it("reads the year as the note's text, not as note 2009", () => {
    const split = splitPage(page(fixture("psi-note-p173"), 173), 600);
    const notes = parseFootnotes(split.footnotes, 173);
    expect(notes.map((n) => n.number)).toEqual([600, 601, 602, 603]);
    expect(notes[0].text).toMatch(/^2009 OTS Annual Report, "Agency Profile,"/);
  });

  it("does not take a number out of sequence for a new note", () => {
    const notes = parseFootnotes(["283", "    First note text.", "284", "    Text that wraps onto a", "192 Fed. Reg. 12 page reference."], 1);
    expect(notes.map((n) => n.number)).toEqual([283, 284]);
    expect(notes[1].text).toBe("Text that wraps onto a 192 Fed. Reg. 12 page reference.");
  });

  // The pipeline's own loop: the counter arrives at 600 from earlier pages,
  // and each page's notes set the number the next page expects.
  let expected = 600;
  const splits = [173, 174, 175].map((n) => {
    const split = splitPage(page(fixture(`psi-note-p${n}`), n), expected);
    const read = parseFootnotes(split.footnotes, n);
    if (read.length) expected = Math.max(...read.map((note) => note.number)) + 1;
    return { split, read };
  });
  const numbers = splits.flatMap(({ read }) => read.map((note) => note.number));
  const body = splits.flatMap(({ split }) => split.body).join("\n");

  it("finds the notes on the pages after it", () => {
    expect(numbers).toEqual([600, 601, 602, 603, 604, 605, 606, 607]);
  });

  it("leaves none of their text in the body", () => {
    expect(body).not.toContain("2004 OTS Examination Handbook, Section 010.2");
    expect(body).not.toContain("Descriptions of these terms appeared in OTS findings memoranda");
  });
});

/**
 * Numbers inside citations (US v. Philip Morris), which the linker met once
 * the notes 35-58 the counter had lost were read again (reportsthatmatter-je7).
 */
describe("numbers in a citation are not footnote markers (Philip Morris)", () => {
  const known = new Set([11, 38, 46, 47, 50, 52, 53, 54, 2006, 2007]);
  const unchanged = [
    "See In the Matter of American Tobacco Co., 47 F.T.C. 1393 (F.T.C. 1951); R.J. Reynolds Tobacco Co., 46 F.T.C. 706 (F.T.C. 1950).",
    "41 C.F.R. §101-20.105-3, 52 Fed. Reg. 11263 at 11269 (April 8, 1987).",
    "See 14 C.F.R. §121.317, 52 F.R. 12358 (April 13, 1988)",
    "upheld on appeal Tobacco Institute (Aust) v. AFCO (1992) 38 FCR 1;",
    "LB0170038-0053 at 0038, 0042, 0044, 0050 (US 25906).",
    "RFA Resp. 5, 49-50, 54 (4/12/02) (The",
    "Berg TT, 11/15/04, 5663:14-18. Moreover, 53 of the peer reviewers were found",
    // US 9/11 Commission notes: an abbreviated month is a date.
    "identification of photos of two Sept. 11 hijackers,Aug. 9, 2002.",
    "FBI notes, notes of Nov. 11 and 13 executive conference call",
    // PSI runs to 2,849 notes, so a year after a date names a real one.
    "Investments in Subprime Mortgage Backed Securities November 24, 2006 vs. August 31, 2007 - in $ Billions",
  ];
  for (const text of unchanged) {
    it(text.slice(0, 50), () => expect(linkInlineMarkers(text, known)).toBe(text));
  }

  it("still links a marker after a year and a comma, or before an acronym (PSI)", () => {
    const psi = new Set([3, 481]);
    expect(
      linkInlineMarkers("from just over 15,000 to approximately 8,000 by 2009, 3 while at the same time", psi)
    ).toBe("from just over 15,000 to approximately 8,000 by 2009,[^3] while at the same time");
    expect(
      linkInlineMarkers("in the WMALT 2007-OA3 securitization in March 2007. 481 WMALT 2007-OA3 securities", psi)
    ).toBe("in the WMALT 2007-OA3 securitization in March 2007.[^481] WMALT 2007-OA3 securities");
  });

  it("does not link a quantity: `2008, 119 years`, `14, 16 years later`, `50, 60, 70 officers`", () => {
    const counts = new Set([16, 70, 119]);
    for (const text of [
      "On September 25, 2008, 119 years to the day of its founding",
      "something is still going I think 14, 16 years later.",
      "Would you like to devote 50, 60, 70 officers for a protracted period",
    ]) {
      expect(linkInlineMarkers(text, counts)).toBe(text);
    }
  });

  it("still links a marker after a sentence", () => {
    expect(linkInlineMarkers("the proceeds of a fraud. 47 The Court holds", known)).toBe(
      "the proceeds of a fraud.[^47] The Court holds"
    );
  });
});

describe("a quantity word after a marker that closes a quotation (Jack Smith)", () => {
  it("links a note between its neighbours even when a unit word follows", () => {
    const text = 'The reality is about 250,000"; 152 days after that, the assertion was 32,000;';
    expect(linkInlineMarkers(text, new Set([152]))).toBe(
      'The reality is about 250,000";[^152] days after that, the assertion was 32,000;'
    );
  });
});

describe("a note number repeated at the top of its own text (Jack Smith note 81)", () => {
  it("drops the repeated number rather than printing it in the note", () => {
    const notes = parseFootnotes(["80 First note.", "81 See ECF No. 252 at 65.", "81 See, e.g., ECF No. 1 at 90."], 1);
    expect(notes.map((n) => n.number)).toEqual([80, 81]);
    expect(notes[1].text).toBe("See ECF No. 252 at 65. See, e.g., ECF No. 1 at 90.");
  });
});

describe("an Ibid. note after a marker (Deepwater Horizon endnotes)", () => {
  it("links the marker before Ibid. and a number", () => {
    expect(linkInlineMarkers('(OTC Paper 20395, May 2010). 112 Ibid. 113 Laurel Calkins', new Set([112, 113]))).toBe(
      "(OTC Paper 20395, May 2010).[^112] Ibid.[^113] Laurel Calkins"
    );
  });
});
