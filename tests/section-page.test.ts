import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown";
import { splitSections } from "../src/sections";

// reportsthatmatter-f1o1: a %%page N%% marker just before a heading ends the previous part, so the
// section used to take the next marker's page.
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} of the filler text, long enough to count.`).join(" ");
const pages = (md: string) => Object.fromEntries(splitSections(renderMarkdown(md)).map((s) => [s.title, s.page]));

describe("a section's page is the page its heading is on", () => {
  it("uses the marker immediately before the heading", () => {
    const md = ["%%page 8%%", "", "## Chapter 1", "", filler(60), "", "%%page 9%%", "", "## Chapter 2", "", filler(30), "", "%%page 10%%", "", filler(30)].join("\n");
    expect(pages(md)).toMatchObject({ "Chapter 1": "8", "Chapter 2": "9" });
  });

  it("uses the earlier page when the marker comes after the heading's first paragraph", () => {
    const md = ["%%page 8%%", "", "## Chapter 1", "", filler(60), "", "## Chapter 2", "", "Opening paragraph on page 8.", "", "%%page 9%%", "", filler(60)].join("\n");
    expect(pages(md)).toMatchObject({ "Chapter 2": "8" });
  });

  it("uses a marker inside the first part when nothing precedes it", () => {
    const md = ["## Chapter 1", "", "%%page 3%%", "", filler(60)].join("\n");
    expect(pages(md)).toMatchObject({ "Chapter 1": "3" });
  });

  it("carries a roman folio, and the arabic page after it", () => {
    const md = ["%%page v%%", "", "## Preface", "", filler(60), "", "%%page 1%%", "", "## Chapter 1", "", filler(60)].join("\n");
    expect(pages(md)).toMatchObject({ Preface: "v", "Chapter 1": "1" });
  });

  it("handles a repeated page number's suffixed anchor", () => {
    const md = ["%%page 4%%", "", "## A", "", filler(60), "", "%%page 4#2%%", "", "## B", "", filler(60)].join("\n");
    expect(pages(md)).toMatchObject({ A: "4", B: "4" });
  });
});
