import { describe, expect, it } from "vitest";
import { mergeAcrossPages, type Block } from "../src/paragraphs";

/**
 * A graphics firm's name under each figure (Deepwater's "TrialGraphix",
 * reportsthatmatter-sbnn): no slash for `isPhotoCredit`, so once the page
 * breaks are joined it stood as a paragraph of its own, four times.
 */
const para = (text: string, pdfIndex: number): Block => ({ kind: "paragraph", text, at: { volume: 1, pdfIndex, printed: pdfIndex } });
const texts = (blocks: Block[]) => blocks.map((b) => (b as { text: string }).text);
const body = "The Deepwater Horizon's blowout preventer had several features that could be used to seal the well. The top two were large, donut-shaped rubber elements called annular preventers that encircled drill pipe or casing inside the riser, and below them sat the blind shear ram and the casing shear ram, which were designed to cut the pipe and seal the well.";

describe("a repeated figure credit joins its caption (photoCredits)", () => {
  const stream = (): Block[] => [
    para("FIGURE 4.1: Macondo Well Schematic", 93),
    para("TrialGraphix", 93),
    para(body, 93),
    para("Two options for the Macondo production casing.", 95),
    para("TrialGraphix", 95),
    para(body, 95),
    para("Spacer fluids (orange) leak past annular preventer.", 99),
    para("TrialGraphix", 99),
    para(body, 99),
  ];

  it("attaches the credit to the caption above it, losing no word", () => {
    expect(texts(mergeAcrossPages(stream(), { photoCredits: true }))).toEqual([
      "FIGURE 4.1: Macondo Well Schematic — TrialGraphix",
      body,
      "Two options for the Macondo production casing. — TrialGraphix",
      body,
      "Spacer fluids (orange) leak past annular preventer. — TrialGraphix",
      body,
    ]);
  });

  it("is opt-in: without the pass the credits stand as paragraphs", () => {
    expect(texts(mergeAcrossPages(stream(), {}))).toHaveLength(9);
  });

  it("leaves a short line that does not recur, and one below body text", () => {
    const once: Block[] = [para("FIGURE 1: A map", 1), para("Acme Maps", 1), para(body, 1)];
    expect(texts(mergeAcrossPages(once, { photoCredits: true }))).toEqual(["FIGURE 1: A map", "Acme Maps", body]);
    const belowBody: Block[] = [para(body, 1), para("Acme", 1), para(body, 2), para("Acme", 2), para(body, 3), para("Acme", 3)];
    expect(texts(mergeAcrossPages(belowBody, { photoCredits: true }))).toHaveLength(6);
  });
});
