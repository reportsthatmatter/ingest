import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { divisionLabelHeadings, ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { columns, speakerTurns, typographicHeadings, type Pass } from "../src/passes";
import { hyphenFragments } from "../src/passes";
import type { Block } from "../src/paragraphs";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");
const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };
const run = (names: string[], passes: Pass[]) =>
  ingestPageGroups(
    [names.map((name, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines: fixture(name) }))],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  ).markdown;

describe("divisionLabels (liv)", () => {
  const p = (text: string): Block => ({ kind: "paragraph", text });

  it("makes a paragraph that is only a division label a level-4 heading, colon dropped", () => {
    const out = divisionLabelHeadings([p("Findings:"), p("F3.2-1 NASA does not fully understand."), p("Recommendation"), p("Issue 3"), p("Issue III"), p("Recommendations:")]);
    expect(out.map((b) => (b.kind === "heading" ? `h${b.level} ${b.text}` : b.kind))).toEqual([
      "h4 Findings",
      "paragraph",
      "h4 Recommendation",
      "h4 Issue 3",
      "h4 Issue III",
      "h4 Recommendations",
    ]);
  });

  it("leaves a sentence that opens with the word, and a quotation, alone", () => {
    const blocks: Block[] = [p("Findings of the committee were published in August."), { kind: "quote", text: "Findings" }, p("The Issue")];
    expect(divisionLabelHeadings(blocks)).toEqual(blocks);
  });
});

describe("speakerTurns (98u) on Columbia's transcript page", () => {
  it("keeps a wrapped turn line out of a block quotation", () => {
    const without = run(["columbia-mission-control"], [columns()]);
    const withTurns = run(["columbia-mission-control"], [columns(), speakerTurns()]);
    const quotes = (md: string) => md.split("\n").filter((line) => line.startsWith(">")).length;
    expect(quotes(without)).toBeGreaterThan(0);
    expect(quotes(withTurns)).toBeLessThan(quotes(without));
  });
});

describe("hyphenFragments is a known pass", () => {
  it("is accepted in a definition", () => {
    expect(() => resolvePasses(pipeline({ ...base, passes: [hyphenFragments(), typographicHeadings({ faces: [["A|1|#000"]] })] }))).not.toThrow();
  });
});
