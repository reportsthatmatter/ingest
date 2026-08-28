import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectGutter, splitColumns } from "../src/columns";

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
