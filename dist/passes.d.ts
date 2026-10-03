import { takePrintedNumber, splitFootnoteBlock, type SplitPage, type FurnitureOptions } from "./clean.js";
import { bodyIndent } from "./paragraphs.js";
import type { PipelineContext } from "./context.js";
import type { Provenance } from "./paragraphs.js";
import type { EditionPass } from "./edition.js";
import type { PageBreakReferee } from "./pagebreaks.js";
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
    run(lines: string[], context?: PipelineContext, at?: Provenance): string[];
};
/** `pageBreakContinuations`, with the Leveson quotation-tail mode. */
export type PageBreakContinuationsPass = {
    readonly name: "pageBreakContinuations";
    readonly stage: "page";
    readonly quoteTails: boolean;
};
/** `layoutPageJoins`, with its optional referee for low-margin calls. */
export type LayoutPageJoinsPass = {
    readonly name: "layoutPageJoins";
    readonly stage: "page";
    readonly scanned?: boolean;
    readonly referee?: PageBreakReferee;
};
/** Runs over one volume's pages together. */
export type VolumePass = {
    readonly name: string;
    readonly stage: "volume";
    run(pages: SplitPage[], context?: PipelineContext): SplitPage[];
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
/** `layoutMarkers`, with where its notes are. */
export type LayoutMarkersPass = {
    readonly name: "layoutMarkers";
    readonly stage: "page";
    readonly scope: "page" | "document";
    readonly textFallback?: boolean;
};
export type Pass = EditionPass | NumberedHeadingsPass | LayoutMarkersPass | PageBreakContinuationsPass | LayoutPageJoinsPass | PagePass | BodyPass | VolumePass | GeometryPass | QuoteInsetPass | AllCapsHeadingsPass;
/**
 * Takes the printed page number off each page. These documents are cited by
 * page ("Report at 62"), so the printed number is the citation unit readers
 * already use, and it can be checked against the original PDF.
 */
export declare const printedPageNumber: () => PagePass;
/**
 * Links footnote markers that OCR fused to the preceding word (#103).
 *
 * Opt-in, and it must stay that way. It is safe only where a note number
 * identifies one note: Leveson restarts its numbering per chapter, so "20"
 * names a different note in every one of them, and linking every fused "20"
 * pointed 54 references at a single note. Where numbering is not unique
 * across the document, a bare number is the honest output.
 */
export declare const flushFootnoteMarkers: () => PagePass;
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
export declare const numberedParagraphs: () => PagePass;
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
 * Since reportsthatmatter-mv1t every report gets this by default: `markPrintedNumbers`
 * (printed-numbers.ts) decides from the text which numbered runs are paragraphs, so
 * declaring this pass is no longer needed (it still escapes every numbered block
 * `numberedParagraphs` split on, and stays valid for existing ingest.ts files).
 *
 * Opt-in on top of `numberedParagraphs`, and only meaningful with it —
 * declaring this without it is rejected by `pipeline()`. Not the default
 * behaviour of `numberedParagraphs` itself: Litvinenko, Leveson, Hillsborough
 * and Saville also number paragraphs "N." at the margin, and each is a
 * separate report's own choice to adopt, not a change every one of them
 * inherits unannounced.
 */
export declare const escapeNumberedParagraphs: () => PagePass;
/**
 * Escapes a paragraph, quotation or list item whose text opens with a literal
 * "#" ("# 18-7503-005, March 5, 1999." where a citation wraps after "Project";
 * a press release's "# # #" end mark), so Markdown does not read it as a
 * heading and ship it as an h1 (reportsthatmatter-6zo).
 *
 * Opt-in: a report whose text has no such line gains nothing, and the shared
 * default would move every report that does (Columbia, Psi) unannounced.
 */
export declare const escapeLeadingHash: () => PagePass;
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
export declare const paragraphNotes: () => PagePass;
/**
 * Reads the contents list each chapter opens with, whose entries are located
 * by paragraph ("Internment   8.35"), and takes the report's structure from
 * it: a body line exactly matching an entry is that subsection's heading, and
 * a chapter title cut at a line wrap is completed from the contents (Saville,
 * whose subsections are set in plain sentence case). See `contentsHeadings`.
 */
export declare const chapterContents: () => PagePass;
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
export declare const listedHeadings: () => PagePass;
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
export declare const unlistedHeadingsMinor: () => PagePass;
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
export declare const unmarkedHeadings: () => PagePass;
/**
 * Lets `unmarkedHeadings` also read a contents entry that opens a page.
 *
 * `unmarkedHeadings` needs a line above the candidate, on the same page, that
 * ends cleanly, so a sentence carried over from the page before is never
 * mistaken for a heading. A heading at the very top of a page has no such
 * line. With this pass it still stands when it matches a contents entry
 * letter for letter, opens with a capital or digit, ends on no stop, comma,
 * semicolon or colon, and the next line is a numbered paragraph or another
 * contents-listed heading (Chilcot's "Negotiation of resolution 1441" over
 * "119. There were…"). Opt-in, and inert without `unmarkedHeadings`.
 */
export declare const recoverListedHeadings: () => PagePass;
/**
 * Reads an item set with a hanging indent under a short numbered label —
 * Columbia's "F6.3-1", "R6.4-1", "O10.7-1" findings, recommendations and
 * observations — as one paragraph, label and all (reportsthatmatter-tk8).
 * Without it the wrapped lines, indented to the item's text, read as a
 * quotation cut from its first line, and consecutive items ran together.
 * Opt-in: a label-and-gap line followed by indented lines is also the shape
 * of a table row. See `hangingItems`.
 */
export declare const hangingIndents: () => PagePass;
/**
 * Reads a lettered sub-item ("a.", "(b)", "iv.") set with a hanging indent as
 * one paragraph of its own (reportsthatmatter-56s).
 *
 * The Litvinenko Inquiry sets "a. Mr Litvinenko had been suffering from
 * abdominal pain, profuse diarrhoea and" with the wrapped lines one tab-stop
 * further in, which is where its block quotations sit, so every wrapped item
 * read as prose cut off into a quotation ("…diarrhoea and" / "> vomiting for
 * two days…"), 244 times in that report. The item is the label's line plus the
 * lines indented to its text, within a character, and only where the label
 * itself sits short of a quotation's inset, so a quotation's own lettered
 * items stay inside it. Opt-in, for the same reason as `hangingIndents`: a
 * lettered line followed by indented lines is also a table row or a
 * quotation's heading in another document.
 */
export declare const letteredItems: () => PagePass;
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
export declare const endnotes: () => PagePass;
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
export declare const citationRunOver: () => PagePass;
/**
 * Reads lowercase roman-numeral folios ("vii", set twice on one line as
 * "vii   vii" when a spread's folio is repeated) as the printed page number
 * of front matter, and takes them off the page (reportsthatmatter-cbr).
 *
 * `takePrintedNumber` only reads arabic numbers, so a roman folio stayed in
 * the text ("Fran Ulmer v v") and the page lost its anchor and its page
 * number. A page read this way gets a `%%page vii%%` marker, rendered as
 * `id="page-vii"` and `data-page="vii"`; `printed` stays null, so footnote
 * and correction page scopes are unchanged.
 *
 * Opt-in: a lone "i", "v" or "x" is also a plausible stray line, so a report
 * declares that its front matter is folioed in roman numerals.
 */
export declare const romanFolios: () => PagePass;
/**
 * A photo credit set between a paragraph and its continuation does not take
 * the continuation (reportsthatmatter-xay).
 *
 * Deep Water sets a photograph's credit ("Mark Wilson/Getty Images") on a
 * line of its own beside the caption, at a page's foot or head; the rest of
 * the sentence the page break split follows it, and `mergeAcrossPages` joined
 * the continuation to the credit, the nearest unfinished-looking paragraph.
 * With this pass the continuation rejoins the unfinished paragraph above the
 * credit (looking back past up to three complete blocks and the page marker),
 * and the credit stays a paragraph of its own. When no unfinished paragraph
 * is there, the continuation stays its own paragraph rather than joining the
 * credit.
 *
 * Opt-in: it keys on a credit's shape (a short name/agency byline), which only
 * a report with set-in photographs needs.
 */
/**
 * A lettered or numbered line inside a table is not a heading
 * (reportsthatmatter-0ij).
 *
 * Deep Water's Appendix D sets its staff in two columns, and a row that opens
 * with an initial ("C. Hobson Bryan   Jill Jonnes") reads as the lettered
 * heading "C. ..." — two bogus h3 sections in the middle of a list. A line is
 * in a table when aligned rows sit on both sides of it (`tabularContext`).
 * `numberedHeadings(false)` is too blunt for this report: its Chapter 9
 * recommendations ("A. Improving the Safety of Offshore Operations") are real
 * lettered headings.
 *
 * Opt-in: making this the default moved seven reports, and a lettered heading
 * set between aligned rows is sometimes real.
 */
export declare const numberedOutsideTables: () => PagePass;
export declare const photoCredits: () => PagePass;
/**
 * Reads a footnote block set off by a wide gap, wherever it falls
 * (reportsthatmatter-74p). Two shapes the ordinary reading misses, both in
 * PSI around embedded charts: the page's expected note sits below a chart's
 * empty space with no later note to corroborate it (its text printed in the
 * body), and a previous note's tail opens the block below a gap while the body
 * above stops mid-sentence (several paragraphs of it printed in the body).
 *
 * Opt-in: a wide gap above a lone number is also how a table or heading sits,
 * so only a report whose footnotes are checked against it declares this.
 */
export declare const footnoteGap: () => PagePass;
/**
 * How the report numbers its page-foot notes, where that is not the usual bare
 * "104 Letter from…": `"period"` reads "104. Letter from…" (Hillsborough,
 * reportsthatmatter-ivg.3), whose notes were otherwise printed in the body as
 * a paragraph with every marker bare. Opt-in: a numbered list item at a page
 * foot has the same shape.
 */
export declare const footnoteNumbers: (numbers: "period") => PagePass & {
    numbers: "period";
};
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
export declare const numberedSections: () => PagePass;
/**
 * Lays out the contents pages `numberedSections` reads as their entries
 * (reportsthatmatter-5fn).
 *
 * The 9/11 Commission Report's contents sets a plain space before each page
 * number, with no leaders and no wide gap, so no contents-page test fired:
 * each chapter entry became a heading ('## 8. "THE SYSTEM WAS BLINKING RED"')
 * and each chapter's sections one run-together quotation. With this, a page
 * on which the contents lists numbered sections is laid out as contents
 * entries, "8.1 The Summer of Threat — 254", chapter numbers kept, a wrapped
 * title joined, a list of illustrations ("p. 32–33   Flight paths") likewise.
 *
 * Opt-in, and only with `numberedSections`, whose reading of the contents it
 * borrows: elsewhere a page of "N.N title page" lines may be something else.
 */
export declare const contentsEntries: () => PagePass;
/**
 * Reads a short title-case line set alone above a paragraph as that
 * paragraph's subheading (reportsthatmatter-5u2).
 *
 * The 9/11 Commission Report breaks its sections with unnumbered, mixed-case
 * subheads ("The Drumbeat Begins", "Moving to Departure Positions") that no
 * heading rule reads: not capitals, not numbered, not in the contents. They
 * ran into the paragraph below ("The Drumbeat Begins In the spring of
 * 2001, the level of reporting…"). Each becomes a level-4 heading, under the
 * numbered section's level 3. See `shortSubheadAt` for the shape.
 *
 * Opt-in: in a report that sets a short title-case line over a full one for
 * any other reason (a byline over its first paragraph, a speaker's name) it
 * would invent a heading.
 */
export declare const shortSubheads: () => PagePass;
/**
 * Measures the margin of a page the scan has shifted sideways
 * (reportsthatmatter-m2y).
 *
 * The Challenger scan sets a few pages three to six columns in from the rest
 * (printed p. 5 of the Committee's conclusions, whose body sits at 3 where
 * the document's is 0). Measured against the document's margin every line of
 * such a page opens a paragraph, and the paragraphs that follow a line
 * ending mid-sentence join only where they begin in lower case: "…in the
 * Solid" / "Rocket Booster joints." stayed in two, as did "Rather," / "NASA
 * chose…". See `shiftedPageMargin` for the test; a page that does not pass it
 * takes the document's margin, so quotations and exhibits are untouched.
 * Not `geometry("per-page")`: read that way a page that is mostly testimony
 * takes the quotation's indent for its margin, and 160 of Challenger's
 * quotations became prose.
 *
 * Opt-in, for a report with such pages.
 */
export declare const shiftedPages: () => PagePass;
/**
 * A quotation that stops mid-sentence at the foot of a page and carries on, in
 * lower case, as the first paragraph of the next is one quotation
 * (reportsthatmatter-m2y).
 *
 * Challenger's Conclusions set the Committee's departure from the Rogers
 * Commission as an inset passage, "…poor technical decision-making over a
 * period of several years by top NASA" at the foot of printed p. 4 and "and
 * contractor personnel, who failed to act decisively…" at the head of p. 5,
 * where the page's lines sit at the margin and read as prose. The sentence
 * could not be quoted whole. `pageBreakContinuations` joins the other
 * direction (a page-opening quotation into the paragraph above); the two do
 * not overlap. Opt-in, for the reason that pass is: elsewhere a lower-case
 * paragraph after a quotation can be the reporter's own words.
 */
export declare const quoteRunOn: () => PagePass;
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
export declare const numberedFindings: () => PagePass;
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
export declare const listedDivisions: () => PagePass;
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
export declare const doubleSpaced: () => PagePass;
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
export declare const wrappedHeadings: () => PagePass;
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
export declare const contentsOutline: () => PagePass;
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
export declare const pageBreakContinuations: (options?: {
    quoteTails?: boolean;
}) => PageBreakContinuationsPass;
/**
 * Joins a block quotation, or a list item, that runs over the foot of a page
 * (reportsthatmatter-38s.9, from the 38s.8 aligned-pair study; cgr). Each page
 * is parsed on its own, so the rest arrives as a second quotation (or list):
 * "This group will be" / "> known as TOBACCO INDUSTRY RESEARCH COMMITTEE".
 * Quote and quote, or list and list, across a page marker, when the first
 * stops mid-sentence and the second opens in lower case (or on `,` `;`) with
 * no label of its own ("b. On 4 November", "(c) the"). A list item that ends
 * "; and" is finished. A quotation opening the page inset, after a list item
 * that stops mid-sentence, is the rest of that item (the page parser reads the
 * item's hanging indent as an inset: 9/11 p.415, reportsthatmatter-2hn). Text only, no layout; independent of
 * `pageBreakContinuations`, which it does not need.
 *
 * Opt-in because it joins into a quotation: declare it for a report whose
 * page-opening lower-case quotations are the rest of the one above, not
 * OCR noise or two separate quotations (`pnpm score` shows which).
 */
export declare const quoteListRunOns: () => PagePass;
/**
 * Joins a paragraph that runs over a page break when the PDF's layout says it
 * does, where text alone cannot (reportsthatmatter-38s.10, rules R1 and R2 of
 * the 38s.8 aligned-pair study): a continuation opening on a capital, a digit,
 * a bracket or a quotation mark ("…now Senior Vice President for" /
 * "Marketing at Philip Morris…"), and on a justified page a paragraph running
 * on past a sentence that ends a full last line.
 *
 * R1: the paragraph at the page foot stops mid-sentence and the new page's
 * first line is flush with the line under it (no first-line indent, within
 * 0.6 em), not a label ("57.", "(b)", "9.88", "•"), in the same font. R2: it
 * ends a sentence, but the page is justified, its last line runs to the right
 * margin, and the next is flush, unlabelled, same font, more than four words.
 * Paragraph and paragraph only; a numbered finding never joins. The same
 * test is applied past a footnote's run-over (a smaller-face block with no
 * number, left between the paragraph and the new page: Lehman p.59,
 * reportsthatmatter-j6qm), not past a figure's caption; the run-over stays
 * where it is. With `scanned`, a lone "°" opening a block, followed by lower
 * case, after a paragraph that stops mid-sentence, is an OCR misreading of a
 * footnote marker's digits and is dropped (Jack Smith p.44, ky1o).
 *
 * Needs the layout (`openLayout`, on the pipeline context); without it, does
 * nothing. Opt-in: declare it for a report whose paragraphs are marked by a
 * first-line indent or a gap that the layout shows (`pnpm score` and reading
 * joins against the page say whether they are). Not for a report whose new
 * paragraphs start flush with no indent and whose pages end on whole
 * paragraphs: R1 cannot tell those apart.
 *
 * `scanned`: the PDF is a scan read through its OCR text layer, which sizes
 * each line from its own glyphs, so a line may be a point bigger or smaller
 * than the one before it without changing face (Jack Smith, Challenger).
 *
 * `referee`: an optional, deterministic second opinion on the low-margin
 * calls (an indent near the threshold, an R2 join, no line under the first
 * line to compare with) — in practice a lookup in a committed cache keyed by
 * `PageBreakCase.key` (38s.11). An `undefined` answer leaves the rules' call.
 */
/**
 * Links the footnote markers the PDF sets as small raised digits
 * (reportsthatmatter-b94): "companies.7", "Corp,12", "community.”1",
 * "IS.”1410", which the text-only linkers leave bare because nothing but a
 * word or a quotation mark sits before them. Each raised run is found in the
 * page's blocks by the words printed before it, and linked only when a note
 * with its number was collected (`scope: "page"`, near the page, for
 * footnotes; `"document"`, anywhere, for endnotes) and it is in sequence with
 * the page's other markers. See `markers.ts`.
 *
 * The layout is then the authority on which numbers are markers: the
 * text-only linkers (`linkInlineMarkers`, `flushFootnoteMarkers`, the
 * endnotes chapter linker) do not run, because what they would add is the
 * numbers the PDF does not raise ("105 dailies, 24 Sundays", "In short, 25
 * people"). `textFallback: true` runs them after it, for a report whose
 * layout misses markers.
 *
 * Opt-in: it reads `context.layout`, and a report whose markers are not
 * raised (a scan's OCR layer) gains nothing from it.
 */
export declare const layoutMarkers: (options?: {
    scope?: "page" | "document";
    textFallback?: boolean;
}) => LayoutMarkersPass;
export declare const layoutPageJoins: (options?: {
    scanned?: boolean;
    referee?: PageBreakReferee;
}) => LayoutPageJoinsPass;
/**
 * Whether a numbered or lettered line ("1. Withdrawing the Army", "C. The
 * Scarman Inquiry") may be read as a heading. On by default — Jack Smith's
 * report is structured that way. A report whose structure comes from its
 * divisions and contents (Saville) quotes documents with numbered items of
 * their own, and as headings they would lose their numbers.
 */
export declare const numberedHeadings: (enabled: boolean) => NumberedHeadingsPass;
/** Separates the footnote block at the foot of each page from the body. */
export declare const footnoteBlock: () => PagePass;
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
export declare const runningFurniture: (options?: FurnitureOptions) => VolumePass;
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
export declare const columns: () => BodyPass;
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
export declare const quoteInset: (columns: number) => QuoteInsetPass;
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
export declare const allCapsHeadings: (enabled: boolean) => AllCapsHeadingsPass;
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
export declare const geometry: (scope: "per-volume" | "per-page" | "document") => GeometryPass;
/** Re-exported so a report can compose the page-local passes directly. */
export { takePrintedNumber, splitFootnoteBlock, bodyIndent };
