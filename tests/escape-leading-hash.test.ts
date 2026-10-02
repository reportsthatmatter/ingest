import { describe, expect, it } from "vitest";
import { blocksToMarkdown } from "../src/paragraphs";
import { renderMarkdown } from "../src/markdown";
import { pipeline, resolvePasses } from "../src/define";
import { escapeLeadingHash } from "../src/passes";

// Columbia's endnote "Project # 18-7503-005, March 5, 1999." wraps so a line
// opens "# 18-7503-005", and PSI's press-release end mark is "# # #". Written
// bare, Markdown reads both as an h1 (reportsthatmatter-6zo).
const blocks = [
  { kind: "paragraph", text: "# 18-7503-005, March 5, 1999. 49" },
  { kind: "paragraph", text: "# # #" },
  { kind: "paragraph", text: "#1 priority, and a # mid-line" },
  { kind: "quote", text: "# quoted" },
  { kind: "heading", level: 2, text: "Notes" },
] as never[];

describe("escapeLeadingHash (reportsthatmatter-6zo)", () => {
  it("the defect: a paragraph opening '# ' is written as a heading", () => {
    const html = renderMarkdown(blocksToMarkdown(blocks));
    expect(html).toContain("<h1");
  });

  it("escapes it once declared, leaving real headings and other hashes alone", () => {
    const md = blocksToMarkdown(blocks, { escapeLeadingHash: true });
    expect(md).toContain("\\# 18-7503-005, March 5, 1999. 49");
    expect(md).toContain("\\# # #");
    expect(md).toContain("\n#1 priority, and a # mid-line");
    expect(md).toContain("> \\# quoted");
    expect(md).toContain("## Notes");
    const html = renderMarkdown(md);
    expect(html).not.toContain("<h1");
    expect(html).toContain("# 18-7503-005");
  });

  it("resolves from the declared pass", () => {
    const def = pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [escapeLeadingHash()] });
    expect(resolvePasses(def).escapeLeadingHash).toBe(true);
  });
});
