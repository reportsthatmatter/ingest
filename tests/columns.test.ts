import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectGutter, splitColumns } from "../src/columns";
import { toBlocks } from "../src/paragraphs";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

describe("detectGutter", () => {
  it("finds the gutter on a two-column page", () => {
    const gutter = detectGutter(fixture("columbia-two-column"));
    expect(gutter).not.toBeNull();
    // Near the middle of a ~125-character line.
    expect(gutter!.start).toBeGreaterThan(50);
    expect(gutter!.start).toBeLessThan(75);
  });

  it("leaves a single-column page alone", () => {
    expect(detectGutter(fixture("columbia-single-column"))).toBeNull();
  });

  it("leaves an ordinary prose page alone", () => {
    expect(detectGutter(fixture("psi-stacked-footnote"))).toBeNull();
    expect(detectGutter(fixture("leveson-running-header"))).toBeNull();
  });

  it("needs enough lines to judge", () => {
    expect(detectGutter(["a          b", "c          d"])).toBeNull();
  });
});

describe("splitColumns", () => {
  it("reads a two-column page column by column, not line by line", () => {
    const split = splitColumns(fixture("columbia-two-column")).join("\n");

    // Read line by line, this sentence has an unrelated one welded into it.
    expect(split).toContain(
      "The Board placed emphasis on maintenance done in areas"
    );
    expect(split).toMatch(/of particular concern to the investigation\. Specifically, re-\s*$/m);

    // Both columns survive; nothing is dropped.
    expect(split).toContain("Payload Preparation");
    expect(split).toContain("Appendix D.2");
  });

  it("returns a single-column page untouched", () => {
    const lines = fixture("columbia-single-column");
    expect(splitColumns(lines)).toEqual(lines);
  });

  it("loses no words", () => {
    const lines = fixture("columbia-two-column");
    const words = (xs: string[]) =>
      xs.join(" ").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).sort();
    expect(words(splitColumns(lines))).toEqual(words(lines));
  });
});

describe("page furniture", () => {
  it("keeps a running footer at the page edge, where the furniture pass looks", () => {
    // splitColumns emits the left column then the right, so a footer left
    // mid-array is no longer at an edge and is never recognised as furniture.
    const split = splitColumns(fixture("columbia-two-column"));
    const lastText = [...split].reverse().find((line) => line.trim());
    expect(lastText).toMatch(/Report Volume I/);
  });

  it("keeps a running header at the top", () => {
    const split = splitColumns(fixture("columbia-two-column"));
    const firstText = split.find((line) => line.trim());
    expect(firstText).not.toMatch(/Board placed emphasis/);
  });
});

describe("a narrow gutter", () => {
  it("finds a three-character gutter", () => {
    // Columbia's executive summary sets its columns three characters apart.
    // Requiring four missed 86 pages, a third of the report, and they
    // shipped with their columns still welded together.
    const lines = Array.from({ length: 12 }, (_, i) =>
      `left column line number ${i} of text here   right column line ${i} of text`
    );
    const gutter = detectGutter(lines);
    expect(gutter).not.toBeNull();
    expect(gutter!.end - gutter!.start).toBeGreaterThanOrEqual(3);
  });

  it("tolerates a full-width line crossing the gutter", () => {
    // A caption or footer spans both columns on a few lines; at a stricter
    // blankness threshold those lines narrowed the band below the minimum.
    const lines = Array.from({ length: 14 }, (_, i) =>
      i === 6
        ? "a full width caption spanning both of the columns of this page here"
        : `left column line number ${i} of text here   right column line ${i} of text`
    );
    expect(detectGutter(lines)).not.toBeNull();
  });
});

describe("the column boundary is a hard break", () => {
  it("does not let a sentence run from one column into the next", () => {
    // Splitting alone is not enough: the foot of the left column and the head
    // of the right are adjacent in the block stream, and the continuation
    // rule joined them — "In the process, Columbia's control over
    // specifications and requirements, and waivers tragedy was compounded".
    const lines = Array.from({ length: 12 }, (_, i) =>
      i === 11
        ? "and in the process,                                and waivers"
        : `left column line number ${i} of text here   right column line ${i} here`
    );
    const blocks = toBlocks(splitColumns(lines));
    const joined = blocks
      .map((b) => (b.kind === "list" ? b.items.join(" ") : b.kind === "page" ? "" : b.text))
      .join(" | ");
    expect(joined).not.toMatch(/in the process,\s+and waivers/);
  });
});

describe("justified text spilling into the gutter", () => {
  it("splits at the line's own gap, not the page's nominal gutter", () => {
    // A long word at the end of the left column reaches a character or two
    // into the band. Slicing at the page gutter would cut it in half, so the
    // line was kept whole instead — which welded the two columns together.
    const lines = [
      ...Array.from({ length: 10 }, (_, i) =>
        `left column line number ${i} here      right column line ${i} here`
      ),
      "and in the process, Columbiaʼs   control over requirements",
    ];
    const out = splitColumns(lines).join("\n");
    expect(out).toMatch(/in the process, Columbiaʼs\s*$/m);
    expect(out).not.toMatch(/Columbiaʼs\s+control over/);
  });
});
