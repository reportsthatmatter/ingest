import { describe, expect, it } from "vitest";
import { assembleEdition, type Edition, type PrintedPage } from "../src/edition";
import { takePrintedNumber } from "../src/clean";
import type { Page } from "../src/extract";

/**
 * Where cleanEdition serves floats (captions, boxes) against the page markers: a float is served under the marker
 * of the page the PDF prints it on, and no block follows the marker of a page later than the one it starts on
 * (reportsthatmatter-bqu0, smof).
 */

const LONG = (n: number) => `Sentence ${n} of the body runs on for long enough to align without any doubt about where it sits on the page.`;
const page = (pdfIndex: number, lines: string[]): Page => ({ index: pdfIndex, volume: 1, pdfIndex, lines }) as Page;
const printed: PrintedPage[] = [
  { volume: 1, pdfIndex: 1, number: 1 },
  { volume: 1, pdfIndex: 2, number: 2 },
];

describe("a caption printed at the head of the next page (reportsthatmatter-bqu0)", () => {
  // January 6th, printed p.20: the photograph and its caption head the page; the edition sets the caption before
  // the paragraph that began on p.19 and runs on to p.20
  const head = "Ultimately even the legal team acknowledged that they had no definitive evidence of fraud sufficient to change the outcome, and";
  const tail = "the lawyers who said otherwise were later sanctioned by the courts for what they had told them.";
  const caption = "*Rudolph Giuliani and Bernard Kerik hold a press conference at Four Seasons Total Landscaping. (Photo by Chris McGrath/Getty Images)*";
  const run: Page[] = [
    page(1, [LONG(1), head]),
    page(2, ["Rudolph Giuliani and Bernard Kerik hold a press conference at Four Seasons Total Landscaping. (Photo by Chris McGrath/Getty Images)", tail, LONG(2)]),
  ];
  const ed = (): Edition => ({
    blocks: [
      { kind: "paragraph", text: LONG(1) },
      { kind: "paragraph", text: caption, float: true },
      { kind: "paragraph", text: `${head} ${tail}` },
      { kind: "paragraph", text: LONG(2) },
    ],
    notes: [],
  });

  it("follows the page's marker, after the paragraph that began on the page before", () => {
    expect(assembleEdition(ed(), run, printed, []).body.split("\n\n")).toEqual(["%%page 1%%", LONG(1), `${head} ${tail}`, "%%page 2%%", caption, LONG(2)]);
  });

  it("a caption printed on the page it is set on stays where the edition sets it", () => {
    const same: Page[] = [page(1, [LONG(1), "Rudolph Giuliani and Bernard Kerik hold a press conference at Four Seasons Total Landscaping. (Photo by Chris McGrath/Getty Images)", head]), page(2, [tail, LONG(2)])];
    expect(assembleEdition(ed(), same, printed, []).body.split("\n\n")).toEqual(["%%page 1%%", LONG(1), caption, `${head} ${tail}`, "%%page 2%%", LONG(2)]);
  });
});

describe("floats: \"by-notes\" yields to the page order (reportsthatmatter-smof)", () => {
  // 9/11 p.145-146: the paragraph's head is on p.145, the box (note 2) on p.146, the paragraph's tail (note 3) after it
  const run: Page[] = [
    page(1, [`${LONG(1)} Like his nephew KSM grew up in Kuwait and following his graduation from secondary`]),
    page(2, ["Detainee Interrogation Reports", "Chapters 5 and 7 rely heavily on information obtained from captured members.", `school KSM left Kuwait to enroll at college. ${LONG(2)}`]),
  ];
  const ed: Edition = {
    blocks: [
      { kind: "paragraph", text: `${LONG(1)} Like his nephew KSM grew up in Kuwait and following his graduation from secondary` },
      { kind: "heading", level: 4, text: "Detainee Interrogation Reports", float: true },
      { kind: "paragraph", text: "Chapters 5 and 7 rely heavily on information obtained from captured members.[^2-5]", float: true },
      { kind: "paragraph", text: `school KSM left Kuwait to enroll at college.[^3-5] ${LONG(2)}` },
    ],
    notes: [
      { label: "2-5", text: "a" },
      { label: "3-5", text: "b" },
    ],
  };

  it("a box on a later page than the paragraph's head follows the paragraph and its own page's marker", () => {
    const parts = assembleEdition(ed, run, printed, [], { floats: "by-notes" }).body.split("\n\n");
    const para = parts.findIndex((p) => p.includes("secondary school KSM left Kuwait"));
    expect(para).toBe(1);
    expect(parts.slice(para + 1, para + 3)).toEqual(["%%page 2%%", "#### Detainee Interrogation Reports"]);
  });
});

describe("a paragraph that ends on a curly closing quotation mark is finished", () => {
  it("is not joined across a caption to the paragraph after it", () => {
    const a = `${LONG(1)} He said it was “pretty obvious.”[^1-1]`;
    const b = `Another advocate of the plan was a lawyer. ${LONG(2)}`;
    const run: Page[] = [page(1, [`${LONG(1)} He said it was “pretty obvious.”1`, "A photograph of the lawyer at a rally in the state capital.", b])];
    const ed: Edition = {
      blocks: [
        { kind: "paragraph", text: a },
        { kind: "paragraph", text: "*A photograph of the lawyer at a rally in the state capital.*", float: true },
        { kind: "paragraph", text: b },
      ],
      notes: [{ label: "1-1", text: "a" }],
    };
    expect(assembleEdition(ed, run, printed, []).body.split("\n\n")).toEqual(["%%page 1%%", a, "*A photograph of the lawyer at a rally in the state capital.*", b]);
  });
});

describe("pageHeadFolios foot (reportsthatmatter-5sf1)", () => {
  const head = { above: /^\s*January 6, 2025\s*$/, foot: /^\s*(?:Blanche Law PLLC|99 Wall Street, Suite 4460\b|\(212\) 716-1250\b)/ };
  it("takes the letterhead footer off the foot of the page, with the OCR'd rules between its lines", () => {
    const lines = [
      "January 6, 2025",
      "Page 3",
      "Vol. II at 60, 88; see also, e.g., id. at 89, 121. Moreover, the Draft Report makes these allegations despite",
      "                                               Blanche Law PLLC",
      "                                99 Wall Street, Suite 4460 New York, NY 10005",
      "                                                        I",
      "                                    (212) 716-1250 www.BlancheLaw.com",
      "                                                  I",
    ];
    expect(takePrintedNumber(lines, { head })).toEqual({ printed: 3, lines: ["Vol. II at 60, 88; see also, e.g., id. at 89, 121. Moreover, the Draft Report makes these allegations despite"] });
  });
  it("leaves a page without the footer, and a footer line that is not at the foot, alone", () => {
    const lines = ["Page 4", "Blanche Law PLLC wrote to the Attorney General.", "and the letter goes on."];
    expect(takePrintedNumber(lines, { head }).lines).toEqual(["Blanche Law PLLC wrote to the Attorney General.", "and the letter goes on."]);
  });
});
