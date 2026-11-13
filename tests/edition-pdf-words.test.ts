import { describe, expect, it } from "vitest";
import { assembleEdition, type Edition, type PrintedPage } from "../src/edition";
import type { Page } from "../src/extract";

/**
 * `words: "pdf"` (reportsthatmatter-ivg.4): an edition of an earlier version than the PDF (the Duelfer Report's 2004
 * web text against its revised 2005 printing) keeps its structure, and a short disagreement takes the PDF's words.
 */

const LONG = (n: number) => `Sentence ${n} of the body runs on for long enough to align without any doubt about where it sits on the page.`;
const page = (pdfIndex: number, lines: string[]): Page => ({ index: pdfIndex, volume: 1, pdfIndex, lines }) as Page;
const printed: PrintedPage[] = [{ volume: 1, pdfIndex: 1, number: 1 }];
const ed = (text: string): Edition => ({ blocks: [{ kind: "paragraph", text: LONG(1) }, { kind: "paragraph", text }, { kind: "paragraph", text: LONG(2) }], notes: [] });
const body = (edition: Edition, pages: Page[], words?: "edition" | "pdf") =>
  assembleEdition(edition, pages, printed, [], words ? { words } : {}).body.split("\n\n").filter((b) => !b.startsWith("%%"));

describe("cleanEdition words: \"pdf\"", () => {
  const edition = "The Regime’s officials told the Security Council in 1998 that Abid Hamid Mahmud had spent $990 million on the programs, according to several detainees.";
  const pdf = "The Regime’s officials told the UNSC in 1998 that ‘Abd Hamid Mahmud had spent $1.5 billion on the programs, according to several detainees.";
  const pages = [page(1, [LONG(1), pdf, LONG(2)])];

  it("serves the edition's words by default", () => {
    expect(body(ed(edition), pages)[1]).toBe(edition);
  });

  it("serves the PDF's words where the two disagree, and lists each place", () => {
    expect(body(ed(edition), pages, "pdf")[1]).toBe(pdf);
    const r = assembleEdition(ed(edition), pages, printed, [], { words: "pdf" });
    expect(r.report.servedFromPdf?.replaced).toBe(3);
    expect(r.suspects.filter((s) => s.pattern === "edition words served as the PDF prints them").map((s) => s.context)).toContain("edition: “Security Council” → PDF: “UNSC”");
  });

  it("keeps the edition's emphasis around the PDF's words", () => {
    const text = "The officials said that *the Security Council would lift the sanctions* within the year, according to several detainees.";
    const printedText = "The officials said that the UNSC would lift the sanctions within the year, according to several detainees.";
    expect(body(ed(text), [page(1, [LONG(1), printedText, LONG(2)])], "pdf")[1]).toBe(
      "The officials said that *the UNSC would lift the sanctions* within the year, according to several detainees."
    );
  });

  it("leaves a label set inside the column (a short whole line) as a disagreement, not text", () => {
    const text = "Qusay was a graduate of the military college until 1989, according to a senior Republican Guard officer who knew him well.";
    const lines = [LONG(1), "Qusay was a graduate of the military college until 1989, according", "Director, SSO", "to a senior Republican Guard officer who knew him well.", LONG(2)];
    expect(body(ed(text), [page(1, lines)], "pdf")[1]).toBe(text);
  });

  it("leaves text the edition prints elsewhere (a moved box) as a disagreement", () => {
    const box = "Saddam’s fondness for certain examples of Western culture was highly selective";
    const text = "His personal security was a constant concern of the guards and of his family, who lived in fear of a coup against him.";
    const lines = [LONG(1), "His personal security was a constant concern of the guards and of his", box, "family, who lived in fear of a coup against him.", LONG(2)];
    const edition: Edition = { blocks: [{ kind: "paragraph", text: LONG(1) }, { kind: "paragraph", text }, { kind: "paragraph", text: LONG(2) }, { kind: "paragraph", text: box, float: true }], notes: [] };
    expect(body(edition, [page(1, lines)], "pdf")[1]).toBe(text);
  });
});
