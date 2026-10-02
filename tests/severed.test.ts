import { describe, expect, it } from "vitest";
import { severedSentenceCheck } from "../src/fidelity";

const doc = (...blocks: string[]) => `---\ntitle: "t"\n---\n\n${blocks.join("\n\n")}\n`;

describe("severedSentenceCheck", () => {
  it("counts a paragraph whose tail was relabelled as a quotation", () => {
    // The defect that shipped: 865 of Litvinenko's paragraphs cut in half,
    // the remainder quoted. Every word is still present, so the lossless and
    // retention layers see nothing wrong.
    const severed = doc(
      ...Array.from({ length: 5 }, (_, i) => [
        `4.1${i} Marina Litvinenkoʼs evidence was that the decision she made to`,
        "> leave Russia was based in part on a fear of what would follow.",
      ]).flat()
    );
    // Informational since the site's per-report budget took over the gate
    // (reportsthatmatter-b78.3): it still counts the defect, but never fails.
    const check = severedSentenceCheck(severed);
    expect(check.info).toBe(true);
    expect(check.ok).toBe(true);
    expect(check.detail).toMatch(/5\/5 paragraphs run straight into a quote/);
  });

  it("passes a document whose quotations are properly introduced", () => {
    const clean = doc(
      ...Array.from({ length: 5 }, (_, i) => [
        `3.1${i} The statement was short, and was in the following terms:`,
        '> "I would like to thank many people who have helped me."',
      ]).flat()
    );
    expect(severedSentenceCheck(clean).ok).toBe(true);
  });

  it("does not count a quotation that opens with a quotation mark", () => {
    const check = severedSentenceCheck(
      doc("A paragraph that trails off without a full stop", '> "A properly opened quotation."')
    );
    expect(check.detail).toBe("none");
  });

  it("does not count a paragraph that ended its sentence", () => {
    const check = severedSentenceCheck(
      doc("A paragraph that ends properly.", "> and then a quote opening lower case")
    );
    expect(check.detail).toBe("none");
  });
});
