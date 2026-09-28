import { describe, expect, it } from "vitest";
import { pdftotextArgs } from "../src/extract";

// A rotated chapter-tab printed in a PDF's bleed margin — beyond its CropBox,
// but inside its MediaBox — reaches `pdftotext -layout`'s default extraction
// and gets threaded into the line stream wherever its (repeated) reading
// order happens to fall, not at a predictable page edge. Excluding it needs
// `pdftotext`'s own crop rectangle, applied before layout reconstruction
// runs, not a text match after the fact (reportsthatmatter-1l4).
describe("pdftotextArgs", () => {
  it("extracts the whole page with no crop declared", () => {
    expect(pdftotextArgs("a.pdf")).toEqual(["-layout", "-enc", "UTF-8", "a.pdf", "-"]);
  });

  it("passes a declared crop rectangle ahead of -layout", () => {
    expect(pdftotextArgs("a.pdf", { x: 0, y: 0, width: 612, height: 828 })).toEqual([
      "-x",
      "0",
      "-y",
      "0",
      "-W",
      "612",
      "-H",
      "828",
      "-layout",
      "-enc",
      "UTF-8",
      "a.pdf",
      "-",
    ]);
  });
});
