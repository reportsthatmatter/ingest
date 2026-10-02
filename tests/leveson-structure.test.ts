import { describe, expect, it } from "vitest";
import { toBlocks, type Block } from "../src/paragraphs";

/**
 * Leveson's chapter headings attached to the wrong text (reportsthatmatter-djy).
 *
 * Each volume's contents wraps a long entry onto a second line that alone
 * carries the page number, so the first line read as a heading and opened a
 * section on the contents page: "Chapter 7: Conclusions and recommendations
 * for future regulation" headed Part A's opening chapter. And a draft
 * clause's title quoted in capitals ('"GUARANTEE OF MEDIA FREEDOM') read as a
 * heading and cut the real Chapter 7 in two.
 */

const kinds = (blocks: Block[]) =>
  blocks.map((block) => `${block.kind}:${"text" in block ? block.text : ""}${block.kind === "contents" ? ` @${block.page}` : ""}`);

describe("a contents entry that wraps before its page number", () => {
  it("is one entry, not a heading and an entry (Leveson vol. 1 p.xi)", () => {
    const lines = [
      "Chapter 6: Techniques of regulation                                            1734",
      "1    Introduction                                                               1734",
      "",
      "Chapter 7: Conclusions and recommendations for future regulation",
      "of the press                                                                   1748",
      "1    Introduction                                                               1748",
    ];
    expect(kinds(toBlocks(lines, 0))).toEqual([
      "contents:Chapter 6: Techniques of regulation @1734",
      "contents:1 Introduction @1734",
      "contents:Chapter 7: Conclusions and recommendations for future regulation of the press @1748",
      "contents:1 Introduction @1748",
    ]);
  });

  it("rejoins an entry whose first line read as a paragraph", () => {
    const lines = [
      "Appendix 4: Legal materials                                                    1843",
      "Appendix 5: Evidence relevant to the generic conclusions on the relationship",
      "between politicians and the press: Part I, Chapter 8                            1955",
    ];
    expect(kinds(toBlocks(lines, 0))).toEqual([
      "contents:Appendix 4: Legal materials @1843",
      "contents:Appendix 5: Evidence relevant to the generic conclusions on the relationship between politicians and the press: Part I, Chapter 8 @1955",
    ]);
  });

  it("leaves a capitalised entry after a heading alone", () => {
    const lines = ["CONTENTS", "", "Chapter 1: Introduction                                 3"];
    expect(kinds(toBlocks(lines, 0))).toEqual(["heading:CONTENTS", "contents:Chapter 1: Introduction @3"]);
  });
});

describe("a quotation's first line set in capitals", () => {
  it("is not a heading when nothing closes it (Leveson p.1780)", () => {
    const lines = [
      "6.40 It would be possible to use a statute to place an obligation upon the Government:",
      "",
      "      “GUARANTEE OF MEDIA FREEDOM",
      "      (1) The Secretary of State for Culture, Media and Sport and other Ministers of",
      "      the Crown must uphold the freedom of the press and its independence.”",
    ];
    expect(toBlocks(lines, 0).some((block) => block.kind === "heading")).toBe(false);
  });

  it("is still a heading when it wraps and closes on its next line (the 9/11 Commission)", () => {
    const lines = ["“THE SYSTEM WAS", "BLINKING RED”", "", "Text of the chapter."];
    expect(toBlocks(lines, 0).filter((block) => block.kind === "heading")).toHaveLength(1);
  });

  it("is still a heading when it closes on the same line", () => {
    const lines = ["“TOO BIG FOR US?”", "", "Text of the section."];
    expect(toBlocks(lines, 0).filter((block) => block.kind === "heading")).toHaveLength(1);
  });
});
