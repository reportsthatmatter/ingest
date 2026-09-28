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
 * Only a heading the report's own contents lists is read as one
 * (reportsthatmatter-h0l).
 *
 * The PSI report quotes its evidence at length — an awards-night script, a
 * performance review's numbered goals, a draft policy's capitals banner — and
 * those lines pass for headings one by one: set on their own, in caps or
 * numbered title case. So do its numbered findings, which open on a run-in
 * title ("4. Conflict Between Client Interests and Proprietary Trading. In
 * 2007, Goldman…"). In the text layer nothing tells them from the report's
 * own sections, but the report says what its sections are: a full contents
 * list, every section and subsection to a page number. With this pass a
 * would-be heading after the contents stands only if an entry names it;
 * anything else stays text where it was printed, quotation and all.
 *
 * It only ever takes headings away, never adds one. Opt-in: most reports'
 * contents name their chapters and not their subsections, and gating on those
 * would strip real structure. See `contentsTitles` and `headingKey`.
 */
export const listedHeadings = () => ({
    name: "listedHeadings",
    stage: "page",
});
/**
 * This report's notes are endnotes: printed together at the back, never at a
 * page foot, so no page is searched for a footnote block (reportsthatmatter-vpx).
 *
 * The 9/11 Commission Report numbers its notes afresh in each chapter and
 * prints them in a notes section, under running heads such as "11
 * Foresight—and Hindsight". Read as page-foot blocks, those pages yielded
 * notes that nothing in the text refers to: the chapter head taken for note
 * 11, with chapter 11's first thirteen notes folded into it. Opt-in: most of
 * the corpus does set its notes at the page foot, and nothing on a notes page
 * says which kind it is.
 */
export const endnotes = () => ({ name: "endnotes", stage: "page" });
/**
 * Reads the report's chapter-and-section numbering from its contents
 * ("8.1   The Summer of Threat 254") and takes each numbered section's heading
 * from there (reportsthatmatter-w8g).
 *
 * The 9/11 Commission Report sets its sections in capitals beneath each
 * chapter's banner ("THE SYSTEM WAS / BLINKING RED" then "8.1 THE SUMMER OF
 * THREAT"). As caps lines they were fused onto the banner, lost into the
 * paragraph below when the title carried a date ("9.2 SEPTEMBER 11, 2001"),
 * or cut at a wrap. A body line opening on a listed number whose title
 * matches the entry, letter for letter across its wrapped lines, is that
 * section, spelt as the contents spells it — the report's own case, not a
 * guess at one. A chapter banner the parser read as two headings is joined
 * where the contents lists them as one chapter.
 *
 * Opt-in: in a report numbered by paragraph ("7.1", "10.14") the same shape
 * opens ordinary paragraphs, and only a contents that lists sections this
 * way says what they are.
 */
export const numberedSections = () => ({
    name: "numberedSections",
    stage: "page",
});
/**
 * Rejoins a sentence the page break left in pieces (reportsthatmatter-ca3,
 * reportsthatmatter-kb4; jack-smith-report#1).
 *
 * Two shapes the default page-break merge misses. A paragraph that runs over
 * a whole page leaves that page's marker behind it, so the continuation on
 * the page after meets two markers and is not joined. And a skewed scan
 * insets a page's first lines, so the rest of the sentence above arrives as a
 * block quotation. With this pass the merge looks past every page marker, and
 * a quotation opening a page after a paragraph that stops mid-sentence is
 * read as that sentence's continuation when it opens in lower case, or when
 * it stops mid-sentence too and runs straight into a lower-case paragraph.
 * A quotation introduced by a finished sentence ("as follows:") or opening on
 * a quotation mark is left alone, as is a capitalised paragraph opening the
 * next page (reportsthatmatter-q0m).
 *
 * Opt-in: across the rest of the corpus most page-opening lower-case
 * quotations are a real quotation whose first lines, on the page before, were
 * read as prose (Leveson), or OCR noise (Challenger), and joining them would
 * turn a quotation into the reporter's own words. `pageBreakSplits` in the
 * fidelity checks counts what is left for a report to judge by.
 */
export const pageBreakContinuations = () => ({
    name: "pageBreakContinuations",
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
