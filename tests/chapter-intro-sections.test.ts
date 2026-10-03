import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown";
import { splitSections } from "../src/sections";

// reportsthatmatter-n9em: text between a chapter ## heading and its first ### used to fall
// into the previous section's page (9/11's chapter 1 opening under 'preface').
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} of the filler text, long enough to count.`).join(" ");

const doc = [
  "## PREFACE",
  "",
  filler(60),
  "",
  '## "WE HAVE SOME PLANES"',
  "",
  "Tuesday, September 11, 2001, dawned temperate and nearly cloudless.",
  "",
  "For those heading to an airport, weather conditions could not have been better.",
  "",
  "### 1.1 Inside the Four Flights",
  "",
  filler(60),
  "",
  "### 1.2 Improvising a Homeland Defense",
  "",
  filler(60),
  "",
  "## THE FOUNDATION OF THE NEW TERRORISM",
  "",
  "### 2.1 A Declaration of War",
  "",
  filler(60),
].join("\n");

describe("a chapter's opening belongs to its chapter", () => {
  const sections = splitSections(renderMarkdown(doc));

  it("keeps the chapter heading and its intro out of the previous section", () => {
    const preface = sections.find((s) => s.title === "PREFACE")!;
    expect(preface.html).not.toContain("dawned temperate");
    expect(preface.html).not.toContain("WE HAVE SOME PLANES");
  });

  it("heads the chapter's first subsection with the chapter heading and intro", () => {
    const chapter = sections.find((s) => s.title.includes("WE HAVE SOME PLANES"))!;
    expect(chapter.level).toBe(2);
    expect(chapter.html).toContain("dawned temperate");
    expect(chapter.html).toContain("1.1 Inside the Four Flights");
    expect(chapter.html.indexOf("dawned temperate")).toBeGreaterThan(chapter.html.indexOf("WE HAVE SOME PLANES"));
  });

  it("still gives the next subsection its own section", () => {
    expect(sections.some((s) => s.title.startsWith("1.2 "))).toBe(true);
  });

  it("does not move a bodyless numbered banner, which already folded forward", () => {
    expect(sections.find((s) => s.title.includes("FOUNDATION"))!.html).toContain("2.1 A Declaration of War");
  });
});
