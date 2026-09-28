import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitPage } from "../src/clean";
import { parseFootnotes } from "../src/footnotes";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8")
    .replace(/\f$/, "")
    .split("\n");

const page = (lines: string[], index: number) => ({ index, volume: 1, pdfIndex: index, lines });

describe("PSI note running over two whole pages (reportsthatmatter-626)", () => {
  const p438 = splitPage(page(fixture("psi-note-runover-p438"), 438), 1769, { citationRunOver: true });
  it("p438: note 1770 starts but does not finish", () => {
    const notes = parseFootnotes(p438.footnotes, 438);
    expect(notes.map((n) => n.number)).toEqual([1769, 1770]);
    expect(p438.body.filter((l) => l.trim()).pop()).toContain("implications would be pretty severe");
  });

  const expectedNote = 1771;
  const p439 = splitPage(page(fixture("psi-note-runover-p439"), 439), expectedNote, { citationRunOver: true });
  it("p439: the note's citation-dense prose is run-over, not body", () => {
    const bodyText = p439.body.join(" ");
    // The dialogue quotation itself carries no citation of its own, so the
    // walk stops there and leaves it as body (an existing, separately
    // tracked defect — it is not counted as a leaked note, since the
    // measure in reportsthatmatter-626 excludes quotations).
    expect(bodyText).toContain("Mr. Lehman: Told Egol");
    // But the source line and the two citation-dense paragraphs that follow
    // it — what actually printed as loose body "paragraphs" full of Bates
    // numbers — are the run-over, not the body.
    expect(bodyText).not.toContain("BSAM mark recap");
    expect(bodyText).not.toContain("6/7/2007 email exchange between Mr. Swenson");
    expect(bodyText).toContain("On June 8, 2007, Mr. Sparks received");
    expect(bodyText).toContain("effectively triggered the funds");
    expect(p439.runOver?.join(" ")).toContain("BSAM mark recap");
    expect(p439.runOver?.join(" ")).toContain("6/7/2007 email exchange between Mr. Swenson");
  });

  it("p439: its own new notes still parse", () => {
    const notes = parseFootnotes(p439.footnotes, 439);
    expect(notes.map((n) => n.number)).toEqual([1771, 1772, 1773, 1774, 1775]);
  });
});
