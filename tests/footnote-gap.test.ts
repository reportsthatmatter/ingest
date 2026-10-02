import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitPage } from "../src/clean";
import { parseFootnotes } from "../src/footnotes";
import { pipeline, resolvePasses } from "../src/define";
import { footnoteGap } from "../src/passes";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8")
    .replace(/\f$/, "")
    .split("\n");
const page = (lines: string[], index: number) => ({ index, volume: 1, pdfIndex: index, lines });

// reportsthatmatter-74p: PSI notes displaced by an embedded chart's space.
describe("footnoteGap (reportsthatmatter-74p)", () => {
  it("p456: note 1864 sits under a chart placeholder with no later note to corroborate it", () => {
    const lines = fixture("psi-chart-note-p456");
    const before = splitPage(page(lines, 456), 1864, { citationRunOver: true });
    expect(before.footnotes).toEqual([]);
    expect(before.body.join(" ")).toContain("Goldman internal chart");

    const after = splitPage(page(lines, 456), 1864, { citationRunOver: true, footnoteGap: true });
    expect(parseFootnotes(after.footnotes, 456).map((n) => n.number)).toEqual([1864]);
    expect(after.body.join(" ")).not.toContain("Goldman internal chart");
    expect(after.body.join(" ")).toContain("zero” line");
  });

  it("p504: the tail of note 2095 below a gap, under body that stops mid-sentence, is run-over", () => {
    const lines = fixture("psi-gap-runover-p504");
    const before = splitPage(page(lines, 504), 2096, { citationRunOver: true });
    expect(before.body.join(" ")).toContain("011057632");

    const after = splitPage(page(lines, 504), 2096, { citationRunOver: true, footnoteGap: true });
    expect(after.body.join(" ")).not.toContain("011057632");
    expect(after.body.join(" ")).toContain("The same phrase appeared");
    expect(after.runOver?.join(" ")).toContain("011057632");
  });

  it("resolves from the declared pass", () => {
    const def = pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [footnoteGap()] });
    expect(resolvePasses(def).footnoteGap).toBe(true);
  });
});
