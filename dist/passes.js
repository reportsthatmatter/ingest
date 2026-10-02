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
 * Writes `numberedParagraphs`' own opening number so Markdown keeps it a
 * paragraph rather than reading it as an ordered list (reportsthatmatter-4qw).
 *
 * The Iraq Inquiry's Executive Summary numbers "13.", "20." straight through,
 * at the left margin — `numberedParagraphs` already reads that as a paragraph
 * break, but a paragraph reaching the markdown as bare "20. …" is an ordered
 * list to Markdown: every one of the report's 892 numbered paragraphs
 * rendered as an `<li>` with no id, so only ~60 of ~950 paragraphs could be
 * cited, quoted or linked. `numberedFindings` solves the same problem for a
 * report whose numbers sit indented past the margin (Philip Morris), by
 * escaping the finding's own leading number — "3437\. …" — once it has
 * matched a finding to the sequence it expects. A margin-set numbering has no
 * such sequence to confirm against; escaping is safe here because
 * `numberedParagraphs` has already decided the line opens a paragraph, so
 * whatever number happens to be there is the paragraph's own.
 *
 * Opt-in on top of `numberedParagraphs`, and only meaningful with it —
 * declaring this without it is rejected by `pipeline()`. Not the default
 * behaviour of `numberedParagraphs` itself: Litvinenko, Leveson, Hillsborough
 * and Saville also number paragraphs "N." at the margin, and each is a
 * separate report's own choice to adopt, not a change every one of them
 * inherits unannounced.
 */
export const escapeNumberedParagraphs = () => ({
    name: "escapeNumberedParagraphs",
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
 * A heading the report's contents does not list is a minor heading — set
 * apart, but not a section of its own (reportsthatmatter-tk8).
 *
 * Columbia boxes sidebars through its chapters — "MISSED OPPORTUNITY", "THE
 * CREW", "ENGINEERING BY VIEWGRAPHS" — and its figures, emails and charts
 * carry caps lines of their own ("ORB,FWD\"", "TEMPERATURE (F)"). Read as
 * headings each opened a section, and the chapter's text that followed the
 * box was filed under it: 6.3's own summary sat in "Missed Opportunities".
 * With this pass a heading after the contents stays a section only if the
 * contents lists it (as `listedHeadings` reads a contents), it is a section or
 * division `numberedSections` took from the contents, it is numbered like
 * one ("A.1 …"), or it names a division ("ENDNOTES FOR CHAPTER 6"); anything
 * else becomes a level-4 heading where it was printed. Unlike
 * `listedHeadings` it keeps the line a heading, because a sidebar's title is
 * one. Opt-in, and meant alongside `numberedSections`: it is only as good as
 * the contents it reads.
 */
export const unlistedHeadingsMinor = () => ({
    name: "unlistedHeadingsMinor",
    stage: "page",
});
/**
 * The other half of `listedHeadings`: a line the contents names becomes a
 * heading even where nothing about its own shape says so.
 *
 * The Iraq Inquiry's Executive Summary sets its section titles in plain
 * sentence case with no capital, number or "Part"/"Chapter" label at all —
 * "UK policy before 9/11", "Why Iraq? Why now?" — so `isHeadingLine` never
 * proposes them as heading-shaped in the first place, and 75 of the
 * Executive Summary's 88 contents-listed headings ran straight into the
 * numbered paragraph after them ("UK policy before 9/11 26. Before the
 * attacks on the US…"), because nothing marked a break between the two.
 * With this, a line at the start of a block whose text matches a contents
 * entry letter for letter — the same match `listedHeadings` already reads —
 * opens its own heading instead.
 *
 * Single physical line only: a title that wraps over two lines in the body
 * is not joined here, the way `contentsOutline` joins a labelled one. Opt-in,
 * and only additive alongside `listedHeadings`: a report whose contents
 * lists only its chapters, not every subsection, would otherwise turn a
 * chapter title's stray repetition in running prose into a heading.
 */
export const unmarkedHeadings = () => ({
    name: "unmarkedHeadings",
    stage: "page",
});
/**
 * Reads an item set with a hanging indent under a short numbered label —
 * Columbia's "F6.3-1", "R6.4-1", "O10.7-1" findings, recommendations and
 * observations — as one paragraph, label and all (reportsthatmatter-tk8).
 * Without it the wrapped lines, indented to the item's text, read as a
 * quotation cut from its first line, and consecutive items ran together.
 * Opt-in: a label-and-gap line followed by indented lines is also the shape
 * of a table row. See `hangingItems`.
 */
export const hangingIndents = () => ({ name: "hangingIndents", stage: "page" });
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
 * A footnote's run-over may be several ordinary-looking paragraphs, not one
 * unbroken run: PSI's "BSAM mark recap" note (reportsthatmatter-626) fills
 * two whole pages with a quotation, its source line, and more prose, all
 * single-spaced like the body around it, so the ordinary run-over check
 * (which needs a double-spaced page) never fires. Walking upward from a
 * footnote block's own start, a paragraph joins the run-over only while it
 * is itself dense with this report's citations — Bates numbers, hearing
 * exhibits, transcript cites — which its footnotes are built out of and its
 * body prose uses only in passing; the first paragraph that reads as
 * ordinary prose stops the walk where it is (`looksLikeCitation`).
 *
 * Opt-in only: it only ever helps a report whose footnotes are themselves
 * that citation-dense, and a first attempt at this keyed on gap width
 * instead, which moved a real section heading ("D. Ratings Deficiencies")
 * into a footnote — a heading or a table sits behind a wide gap exactly as a
 * footnote separator does, with nothing in the whitespace to tell them apart.
 */
export const citationRunOver = () => ({ name: "citationRunOver", stage: "page" });
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
export const numberedFindings = () => ({
    name: "numberedFindings",
    stage: "page",
});
/**
 * Reads the parts, chapters and appendices the report's contents lists, and
 * takes each one's heading from the body lines that spell it
 * (reportsthatmatter-a0z).
 *
 * Deep Water opens each chapter on a page of its own: "Chapter Three", then
 * a title set a word or two to a line ("“It was like / pulling teeth.” /
 * Oversight—and Oversights—in / …"), then the first paragraph with no blank
 * line between. Nothing in that shape is a heading line by line, so every
 * chapter's title was read into its first paragraph, and the report's
 * sections were its figure captions instead. The contents names each
 * division — "Chapter 3" over its title, "PART I: The Path to Tragedy",
 * "Foreword", "Endnotes", "Appendix A: Commission Members" — and a body line
 * that opens the same division, its number spelt out or not, and whose
 * letters spell the listed title across however many lines the body wraps
 * it over, is that division's heading. Parts and unlabelled entries are
 * top level, chapters nest under them.
 *
 * It only adds headings. Opt-in: a contents entry set without dot leaders
 * looks like any line with a number at its end, and only a report whose
 * contents is laid out this way says which lines are entries.
 */
export const listedDivisions = () => ({
    name: "listedDivisions",
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
export const doubleSpaced = () => ({
    name: "doubleSpaced",
    stage: "page",
});
/**
 * A numbered or lettered heading whose title runs onto a short line of its
 * own is one heading (reportsthatmatter-a0z): Deep Water's Chapter 9 sets
 * "4. The Need for Increased Research and Development to Improve Spill" over
 * "Response", then its paragraph with no blank line between, and the heading
 * stopped at "Spill". The line below is folded in when it is at most six
 * words, capitalised but for small words, and ends on no stop.
 *
 * Opt-in: elsewhere a short title-case line under a heading can be a byline,
 * a dateline or a run-in label, and only a report that wraps its headings
 * this way says which it is.
 */
export const wrappedHeadings = () => ({
    name: "wrappedHeadings",
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
export const contentsOutline = () => ({
    name: "contentsOutline",
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
 *
 * `quoteTails` (reportsthatmatter-nen) is for that Leveson shape. A quotation
 * whose first line is the last line of a page is read as prose — one line
 * cannot show its inset — and the rest of it, on the next page, as a
 * quotation. When the paragraph left at the foot of the page opens on a
 * quotation mark and was introduced by a finished sentence or a colon ("He
 * said:"), the paragraph is the head of the quotation: it is joined *into*
 * the quotation rather than the quotation into it. And a paragraph that sits
 * between a quotation stopping mid-sentence and its page-opening rest (a
 * footnote or page-edge line read into the body) is not taken for the head
 * of the sentence, so nothing is joined onto it.
 */
export const pageBreakContinuations = (options = {}) => ({
    name: "pageBreakContinuations",
    stage: "page",
    quoteTails: options.quoteTails ?? false,
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
 *
 * `{ numbersTrackPages: true }`: a line that repeats only once its digits are
 * blanked ("CHAPTER 1", "CHAPTER 2" …) is furniture only if its number
 * advances with the page, as a page number does. Without it, Columbia's
 * eleven chapter banners and its "ENDNOTES FOR CHAPTER n" heads were all
 * stripped, and each chapter's number taken for its opening page's number.
 * Opt-in for now only because it moves other reports that have not asked for
 * it (Hillsborough and Leveson recover chapter banners; 9/11, Philip Morris
 * and Hillsborough recover citation tails that had been dropped as a footer)
 * — each needs its own reading before it adopts it.
 *
 * `{ minShare }`: lines are compared with their digits masked, so "Page 302
 * of 1682" matches "Page 303 of 1682". A report that ends paragraphs on
 * record citations pays for that: "1350 at 1346 (US 63531)." and "WD,
 * 103:23-104:19." recur, masked, at the top of dozens of the Philip Morris
 * opinion's 1,682 pages, and were deleted as furniture — 270-odd lines,
 * gluing finding 648 onto the citation before it (reportsthatmatter-9ek).
 * `minShare` asks that a line recur on at least that share of the volume's
 * pages, as a running header or folio does.
 */
export const runningFurniture = (options = {}) => ({
    name: "runningFurniture",
    stage: "volume",
    run: (pages) => stripRepeatedPageFurniture(pages, options),
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
