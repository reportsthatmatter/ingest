import { describe, expect, it } from "vitest";
import { emptyOutline, learnOutline, readContentsOutline, toBlocks } from "../src/paragraphs";

// The Senate Intelligence Committee study (reportsthatmatter-gqsy.6): a scan whose contents and body
// are both an OCR layer, so neither spells a title exactly, and whose contents has no leaders.
const contents = [
  "                                                   Table of Contents",
  "I.    Background on the Committee Study                                                       8",
  "II.   Overall History and Operation of the CIA's Detention and Interrogation Program            11",
  "        A.    September 17, 2001, Memorandum of Notification (MON) Authorizes the CIA to Capture and Detain a",
  "              Specific Category of Indi viduals                                                  11",
  "             1.     After Considering Various Clandestine Detention Locations, the CIA Determines That a U.S. Military",
  "                    Base Is the Best Option                                                      11",
  "        H.    The Growth of the CIA's Detention and Interrogation Program                        96",
  "        I.    Other Medical, Psychological, and Behavioral Issues                                 110",
];
const body = [
  "     II.   Overall History and Operation of the CIA's Detention and",
  "           Interrogation Program",
  "",
  "       A. September 17, 2001, Memorandum of Notification (MON) Authorizes the CIA to",
  "          Capture and Detain a Specific Category of Individuals",
  "",
  "       1. After Considering Various Clandestine Detention Locations, the CIA Determines That a",
  "          U.S. Military Base Is the Best Option",
  "",
  "                               On September 17, 2001, six days after the terrorist attacks of",
  "September 11, 2001, President George W. Bush signed a covert action Memorandum.",
];

describe("contentsOutline({ ocr: true }) (reportsthatmatter-gqsy.6)", () => {
  it("the defect: an OCR'd contents without leaders is not read as an outline", () => {
    expect(readContentsOutline(contents)).toEqual([]);
  });

  it("reads entries ending on a bare page number, levelled roman, letter, number; I. after H. is a letter", () => {
    const entries = readContentsOutline(contents, true);
    expect(entries.map((e) => [e.label, e.level, e.page])).toEqual([
      ["I.", 2, "8"], ["II.", 2, "11"], ["A.", 3, "11"], ["1.", 4, "11"], ["H.", 3, "96"], ["I.", 3, "110"],
    ]);
  });

  it("finds each heading across its wrapped lines, by edit distance, in the body's own words", () => {
    const outline = emptyOutline(false, false, true);
    learnOutline(outline, readContentsOutline(contents, true));
    // the first entry, I., is on an earlier page: start the reading past it
    outline.ocr!.used.add(outline.ocr!.ordered[0]);
    outline.ocr!.next = 1;
    const headings = toBlocks(body, 0, undefined, false, true, false, true, undefined, undefined, undefined, outline).filter((b) => b.kind === "heading");
    expect(headings.map((h) => [h.level, h.text])).toEqual([
      [2, "II. Overall History and Operation of the CIA's Detention and Interrogation Program"],
      [3, "A. September 17, 2001, Memorandum of Notification (MON) Authorizes the CIA to Capture and Detain a Specific Category of Individuals"],
      [4, "1. After Considering Various Clandestine Detention Locations, the CIA Determines That a U.S. Military Base Is the Best Option"],
    ]);
  });

  it("reads the report's unlabelled parts, an entry wrapped over two lines joined", () => {
    const gpo = [
      "Foreword of Chairman Feinstein .............................................................. iii",
      "Executive Summary ................................................................................... 1",
      "Minority Views of Vice Chairman Chambliss, Senators Burr, Risch,",
      "  Coats, Rubio, and Coburn ...................................................................... 520",
    ];
    expect(readContentsOutline(gpo, true).map((e) => [e.title, e.page, e.level])).toEqual([
      ["Foreword of Chairman Feinstein", "iii", 2],
      ["Executive Summary", "1", 2],
      ["Minority Views of Vice Chairman Chambliss, Senators Burr, Risch, Coats, Rubio, and Coburn", "520", 2],
    ]);
  });
});

describe("[Redacted], a box with no printed code (reportsthatmatter-gqsy.6)", () => {
  it("is exempt from the invented-word check in that exact form only", async () => {
    const { losslessCheck } = await import("../src/fidelity");
    const source = "the chief of operations of the CIA's based on an urgent requirement Country";
    const ok = losslessCheck(source, "the chief of operations of the CIA's [Redacted] based on an urgent requirement Country [Redacted]");
    expect(ok.ok).toBe(true);
    const bad = losslessCheck(source, "the chief of operations of the CIA's Redacted based on an urgent requirement");
    expect(bad.detail).toContain("redacted");
  });
});
