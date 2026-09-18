import { stripRepeatedPageFurniture, takePrintedNumber, splitFootnoteBlock } from "./clean.js";
import { bodyIndent } from "./paragraphs.js";
import { splitColumns } from "./columns.js";
/**
 * Takes the printed page number off each page. These documents are cited by
 * page ("Report at 62"), so the printed number is the citation unit readers
 * already use, and it can be checked against the original PDF.
 */
export const printedPageNumber = () => ({
    name: "printedPageNumber",
    stage: "page",
});
/**
 * Links footnote markers that OCR fused to the preceding word (#103).
 *
 * Opt-in, and it must stay that way. It is safe only where a note number
 * identifies one note: Leveson restarts its numbering per chapter, so "20"
 * names a different note in every one of them, and linking every fused "20"
 * pointed 54 references at a single note. Where numbering is not unique
 * across the document, a bare number is the honest output.
 */
export const flushFootnoteMarkers = () => ({
    name: "flushFootnoteMarkers",
    stage: "page",
});
/**
 * Reads this report's own "7.1", "10.14"-style paragraph numbering as a
 * paragraph break, not just an indent past the margin (reportsthatmatter-hzf).
 *
 * Opt-in, and it must stay that way: a report that does not number its
 * paragraphs this way still has plenty of lines that coincidentally open
 * with a decimal-shaped number wrapped onto its own line — a measurement
 * like "5.8 to\n7.0 percent" would sever mid-sentence at "7.0" rather than
 * merely stay merged, which is worse than the defect this fixes. Confirmed
 * empirically: applying it unconditionally moved every report in the
 * corpus, most of them by severing sentences that were never numbered
 * paragraphs at all.
 */
export const numberedParagraphs = () => ({
    name: "numberedParagraphs",
    stage: "page",
});
/**
 * Reads notes set beneath the paragraph they belong to, numbered afresh for
 * each paragraph, in two columns read down each one (Saville,
 * reportsthatmatter-0rx). Replaces the page-foot footnote reading for the
 * report that declares it — see `paragraph-notes.ts`.
 *
 * Opt-in: in a report whose notes sit at the page foot and number through,
 * the same shape turns up in numbered lists, and a note taken from the wrong
 * place is worse than one left where it was printed.
 */
export const paragraphNotes = () => ({
    name: "paragraphNotes",
    stage: "page",
});
/**
 * Reads the contents list each chapter opens with, whose entries are located
 * by paragraph ("Internment   8.35"), and takes the report's structure from
 * it: a body line exactly matching an entry is that subsection's heading, and
 * a chapter title cut at a line wrap is completed from the contents (Saville,
 * whose subsections are set in plain sentence case). See `contentsHeadings`.
 */
export const chapterContents = () => ({
    name: "chapterContents",
    stage: "page",
});
/**
 * Whether a numbered or lettered line ("1. Withdrawing the Army", "C. The
 * Scarman Inquiry") may be read as a heading. On by default — Jack Smith's
 * report is structured that way. A report whose structure comes from its
 * divisions and contents (Saville) quotes documents with numbered items of
 * their own, and as headings they would lose their numbers.
 */
export const numberedHeadings = (enabled) => ({
    name: "numberedHeadings",
    stage: "numberedHeadings",
    enabled,
});
/** Separates the footnote block at the foot of each page from the body. */
export const footnoteBlock = () => ({ name: "footnoteBlock", stage: "page" });
/**
 * Removes running headers and footers that recur at a page edge.
 *
 * PDF text extraction cannot distinguish these from the body, but their
 * repeated position can: a real line of prose should not appear at the top or
 * bottom of three distinct pages. Opt in — a report whose furniture does not
 * repeat gets nothing from this, and a short report could lose a real
 * repeated line to it.
 */
export const runningFurniture = () => ({
    name: "runningFurniture",
    stage: "volume",
    run: stripRepeatedPageFurniture,
});
/**
 * Reads a two-column page column by column rather than line by line.
 *
 * `pdftotext -layout` puts both columns on the same physical line, so without
 * this an unrelated sentence is welded into the middle of every paragraph —
 * unreadable, and invisible to the fidelity checks, which count words rather
 * than order them.
 *
 * Opt-in, and per page: a report declares it, and each page is judged on its
 * own, because front matter and appendices are routinely single-column in an
 * otherwise two-column document. Pages with no detectable gutter are left
 * untouched.
 *
 * A caveat worth knowing: a wide two-column *table* looks much like
 * two-column prose, and this will split one. That is why it is opt-in rather
 * than a universal heuristic.
 */
export const columns = () => ({
    name: "columns",
    stage: "body",
    run: splitColumns,
});
/**
 * How far past the body margin a quotation sits in this document.
 *
 * The default of five suits a document that insets its quotations generously.
 * Litvinenko does not — body at 7, quotations at 10 — and at five every one of
 * its quotations reads as ordinary prose. Lowering it globally is not the
 * answer: at three, Challenger turns 442 paragraphs into quotations.
 *
 * It is a fact about the document's typography, which is exactly the kind of
 * thing a report declares rather than the parser guesses.
 */
export const quoteInset = (columns) => ({
    name: "quoteInset",
    stage: "quoteInset",
    columns,
});
/**
 * Whether a standalone line set in capitals is read as a heading.
 *
 * On by default: most reports in the corpus title their sections in caps
 * ("EXECUTIVE SUMMARY") and nothing else marks them. Saville does not — its
 * structure is its Chapter divisions, found on their own — but it transcribes
 * 1972 telegrams and operation orders verbatim in capitals, and their wrapped
 * lines pass the all-caps test one by one, tearing a quotation into a run of
 * bogus headings. In the plain-text layer a quoted all-caps line and a caps
 * title look the same, so this is a fact the report declares, not one the
 * parser can infer. Division and numbered headings are unaffected.
 */
export const allCapsHeadings = (enabled) => ({
    name: "allCapsHeadings",
    stage: "allCapsHeadings",
    enabled,
});
/**
 * Where the left margin is measured.
 *
 * `document` treats the whole report as one typesetting run. `per-volume`
 * measures each source volume separately, which is what a multi-volume report
 * needs: each PDF's furniture and typesetting may differ, and one global
 * margin is not meaningful across all of them. Getting this wrong turns
 * ordinary continuation lines into block quotes.
 *
 * This replaced a `pageGroups.length > 1` test — a property of the document
 * inferred from how many arguments were typed on the command line.
 */
export const geometry = (scope) => ({
    name: `geometry(${scope})`,
    stage: "geometry",
    scope,
});
/** Re-exported so a report can compose the page-local passes directly. */
export { takePrintedNumber, splitFootnoteBlock, bodyIndent };
