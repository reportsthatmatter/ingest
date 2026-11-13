import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown";
import { splitSections } from "../src/sections";

// reportsthatmatter-owre: a Part's one-page introduction (under the sliver threshold) folded forward onto its first
// chapter, and a chapter whose sections sit one level down is a single part, so the whole chapter was taken into the
// Part's section and had no entry of its own in the contents (the Stern Review's Part III and Chapter 9).
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} of the filler text, long enough to count.`).join(" ");

const doc = (partBody: string) =>
  [
    "## Summary of Conclusions",
    "",
    filler(60),
    "",
    "## Part III: The Economics of Stabilisation",
    "",
    partBody,
    "",
    "### 9 Identifying the Costs of Mitigation",
    "",
    filler(20),
    "",
    "#### 9.1 Introduction",
    "",
    filler(80),
    "",
    "### 10 Macroeconomic Models of Costs",
    "",
    filler(100),
  ].join("\n");

describe("a Part with its own introduction does not swallow its first chapter", () => {
  const sections = splitSections(renderMarkdown(doc("Part III of the Review considers the costs of stabilisation. " + filler(5))));
  const titles = sections.map((s) => [s.title, s.level]);

  it("lists the Part and the chapter as sections of their own", () => {
    expect(titles).toEqual([
      ["Summary of Conclusions", 2],
      ["Part III: The Economics of Stabilisation", 2],
      ["9 Identifying the Costs of Mitigation", 3],
      ["10 Macroeconomic Models of Costs", 3],
    ]);
  });

  it("keeps the Part's introduction in the Part's section", () => {
    const part = sections.find((s) => s.title.startsWith("Part III"))!;
    expect(part.html).toContain("considers the costs of stabilisation");
    expect(part.html).not.toContain("9.1 Introduction");
  });
});

describe("a bare Part banner still heads its first chapter", () => {
  it("folds a Part with no text of its own forward onto the chapter", () => {
    const sections = splitSections(renderMarkdown(doc("")));
    expect(sections.map((s) => s.title)).toEqual(["Summary of Conclusions", "Part III: The Economics of Stabilisation", "10 Macroeconomic Models of Costs"]);
    expect(sections[1].html).toContain("9 Identifying the Costs of Mitigation");
  });
});

describe("a Part whose next part is short still gathers it", () => {
  const intro = "Part III of the Review considers the costs of stabilisation. " + filler(5);

  it("gathers a short chapter, then stands alone before a whole one", () => {
    const short = doc(intro).replace(/#### 9\.1 Introduction\n\n.*\n/, "");
    const sections = splitSections(renderMarkdown(short));
    expect(sections.map((s) => s.title)).toEqual(["Summary of Conclusions", "Part III: The Economics of Stabilisation", "10 Macroeconomic Models of Costs"]);
    expect(sections[1].html).toContain("9 Identifying the Costs of Mitigation");
  });

  it("gathers a part under twice the sliver threshold (a short opening, a stray contents heading)", () => {
    const opening = doc(intro).replace(filler(80), filler(30));
    const sections = splitSections(renderMarkdown(opening));
    expect(sections.map((s) => s.title)).toEqual(["Summary of Conclusions", "Part III: The Economics of Stabilisation", "10 Macroeconomic Models of Costs"]);
  });

  it("treats a heading with only a printed-page label as a bare banner", () => {
    const sections = splitSections(renderMarkdown(doc("%%page 168%%")));
    expect(sections.map((s) => s.title)).toEqual(["Summary of Conclusions", "Part III: The Economics of Stabilisation", "10 Macroeconomic Models of Costs"]);
  });
});
