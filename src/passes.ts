import { stripRepeatedPageFurniture, takePrintedNumber, splitFootnoteBlock, type SplitPage } from "./clean";
import { bodyIndent } from "./paragraphs";
import { splitColumns } from "./columns";

/**
 * A pass is one named decision about how to read a source.
 *
 * Passes select among implemented, tested behaviours. **A pass never takes a
 * regex or a pattern**: the moment a report's definition can express a
 * pattern it has become a second parser with no tests of its own. A report
 * that genuinely needs something bespoke writes its own pass inline — and
 * when a third report needs the same one, it moves in here.
 */

/** Runs once per page, before the document is assembled. */
export type PagePass = {
  readonly name: string;
  readonly stage: "page";
};

/** Rewrites one page's body lines, after its furniture has been taken off. */
export type BodyPass = {
  readonly name: string;
  readonly stage: "body";
  run(lines: string[]): string[];
};

/** Runs over one volume's pages together. */
export type VolumePass = {
  readonly name: string;
  readonly stage: "volume";
  run(pages: SplitPage[]): SplitPage[];
};

/** Decides the document geometry the block parser measures against. */
export type GeometryPass = {
  readonly name: string;
  readonly stage: "geometry";
  readonly scope: "per-volume" | "per-page" | "document";
};

/** Declares how far a quotation is inset from the body in this document. */
export type QuoteInsetPass = {
  readonly name: "quoteInset";
  readonly stage: "quoteInset";
  readonly columns: number;
};

/** Declares whether a standalone all-caps line may be read as a heading. */
export type AllCapsHeadingsPass = {
  readonly name: "allCapsHeadings";
  readonly stage: "allCapsHeadings";
  readonly enabled: boolean;
};

/** Declares whether a numbered or lettered line may be read as a heading. */
export type NumberedHeadingsPass = {
  readonly name: "numberedHeadings";
  readonly stage: "numberedHeadings";
  readonly enabled: boolean;
};

export type Pass =
  | NumberedHeadingsPass
  | PagePass
  | BodyPass
  | VolumePass
  | GeometryPass
  | QuoteInsetPass
  | AllCapsHeadingsPass;

/**
 * Takes the printed page number off each page. These documents are cited by
 * page ("Report at 62"), so the printed number is the citation unit readers
 * already use, and it can be checked against the original PDF.
 */
export const printedPageNumber = (): PagePass => ({
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
export const flushFootnoteMarkers = (): PagePass => ({
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
export const numberedParagraphs = (): PagePass => ({
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
export const paragraphNotes = (): PagePass => ({
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
export const chapterContents = (): PagePass => ({
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
export const listedHeadings = (): PagePass => ({
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
export const endnotes = (): PagePass => ({ name: "endnotes", stage: "page" });

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
export const numberedSections = (): PagePass => ({
  name: "numberedSections",
  stage: "page",
});

/**
 * Reads the report's run of numbered paragraphs — a court's Findings of Fact,
 * "3437. Projects recommended by this Advisory Group…", numbered 1 to 4,088
 * straight through the opinion — as paragraphs (reportsthatmatter-9ek).
 *
 * Without it, each one reached the markdown as "3437. …", which Markdown reads
 * as an ordered list: every finding rendered as an `<li>` with no id, so the
 * bulk of the Philip Morris opinion could not be cited, highlighted or
 * linked. And a finding's first line, set with a hanging indent, was quoted
 * together with an indented neighbour — the heading above it or the
 * quotation below — severing the finding from its own text.
 *
 * A finding is recognised by its number coming next in the sequence (within
 * two, so one misread does not lose the rest), on a line indented past the
 * margin that is not a heading or a contents entry. It always opens its own
 * paragraph, is never quoted, and is written so Markdown keeps it a paragraph
 * — "3437\. Projects…" — whose id then carries the finding's own number:
 * `#3437-projects-recommended-advisory-group`.
 *
 * Opt-in: elsewhere a numbered paragraph may genuinely be a list, and only a
 * report numbered this way throughout says what its numbers are.
 */
export const numberedFindings = (): PagePass => ({
  name: "numberedFindings",
  stage: "page",
});

/**
 * Declares the body double-spaced on every page, so a single blank line is
 * line spacing and never a paragraph break.
 *
 * Without it, double spacing is judged page by page — most lines followed by
 * a blank — and a page carrying a long single-spaced quotation falls under
 * that bar. On 268 of the Philip Morris opinion's 1,682 pages every line of
 * the body then became a paragraph of its own: finding 1028 stopped at
 * "…titled “The Effect of Smoking”, and its next lines were separate
 * paragraphs, one of them opening "1975." and so read as a list
 * (reportsthatmatter-9ek). Paragraphs there are marked by indent, which the
 * block reader still sees; a wider gap is still a break.
 *
 * Opt-in: a single-spaced report separates its paragraphs with exactly the
 * blank line this discards.
 */
export const doubleSpaced = (): PagePass => ({
  name: "doubleSpaced",
  stage: "page",
});

/**
 * Reads the report's headings from its contents, set out as a lettered and
 * numbered outline with spaced leaders to the page ("C.   TIRC/CTR --
 * Tobacco Industry Research Committee/Council / for Tobacco Research-USA
 * . . . 26"), as `numberedSections` does for a report numbered "8.1"
 * (reportsthatmatter-72f).
 *
 * The Philip Morris opinion wraps its long titles under a hanging label, and
 * its lower levels — "a.", "(1)" — are not shapes the heading reader knows. A
 * title was cut at the line end with its tail quoted along with the first
 * line of the finding below; two levels were fused into one heading; and a
 * finding's opening words, a record citation, advertising copy in capitals
 * and a footnote's text were all read as headings. With this, a body line
 * opening on a label whose title matches an entry letter for letter, across
 * the lines it wraps over, is that heading, spelt as the contents spells it;
 * once the contents has been read, nothing else is a heading unless it is
 * centred on the page ("FINDINGS OF FACT"). The contents pages are laid out
 * as their entries.
 *
 * Opt-in: only a report whose contents lists every heading can say that
 * whatever it does not list is text.
 */
export const contentsOutline = (): PagePass => ({
  name: "contentsOutline",
  stage: "page",
});

/**
 * Whether a numbered or lettered line ("1. Withdrawing the Army", "C. The
 * Scarman Inquiry") may be read as a heading. On by default — Jack Smith's
 * report is structured that way. A report whose structure comes from its
 * divisions and contents (Saville) quotes documents with numbered items of
 * their own, and as headings they would lose their numbers.
 */
export const numberedHeadings = (enabled: boolean): NumberedHeadingsPass => ({
  name: "numberedHeadings",
  stage: "numberedHeadings",
  enabled,
});

/** Separates the footnote block at the foot of each page from the body. */
export const footnoteBlock = (): PagePass => ({ name: "footnoteBlock", stage: "page" });

/**
 * Removes running headers and footers that recur at a page edge.
 *
 * PDF text extraction cannot distinguish these from the body, but their
 * repeated position can: a real line of prose should not appear at the top or
 * bottom of three distinct pages. Opt in — a report whose furniture does not
 * repeat gets nothing from this, and a short report could lose a real
 * repeated line to it.
 *
 * Lines are compared with their digits masked, so "Page 302 of 1682" matches
 * "Page 303 of 1682". A report that ends paragraphs on record citations pays
 * for that: "1350 at 1346 (US 63531)." and "WD, 103:23-104:19." recur, masked,
 * at the top of dozens of the Philip Morris opinion's 1,682 pages, and were
 * deleted as furniture — 270-odd lines, gluing finding 648 onto the citation
 * before it (reportsthatmatter-9ek). `minShare` asks that a line recur on at
 * least that share of the volume's pages, as a running header or folio does.
 */
export const runningFurniture = (options: { minShare?: number } = {}): VolumePass => ({
  name: "runningFurniture",
  stage: "volume",
  run: (pages) => stripRepeatedPageFurniture(pages, options.minShare),
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
export const columns = (): BodyPass => ({
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
export const quoteInset = (columns: number): QuoteInsetPass => ({
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
export const allCapsHeadings = (enabled: boolean): AllCapsHeadingsPass => ({
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
export const geometry = (scope: "per-volume" | "per-page" | "document"): GeometryPass => ({
  name: `geometry(${scope})`,
  stage: "geometry",
  scope,
});

/** Re-exported so a report can compose the page-local passes directly. */
export { takePrintedNumber, splitFootnoteBlock, bodyIndent };
