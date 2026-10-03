import type { Layout, LayoutLine, PageLayout } from "./layout.js";
/**
 * Page-break joins decided from the PDF's layout (reportsthatmatter-38s.10,
 * from the 38s.8 aligned-pair study, rules R1 and R2).
 *
 * Each page is parsed on its own, so a paragraph running over the foot of a
 * page arrives as two. `mergeAcrossPages` rejoins them on text alone: a
 * lower-case opening, or a page foot ending on an abbreviation. Text alone
 * cannot see the commonest run-ons, which open on a capital ("…now Senior
 * Vice President for" / "Marketing at Philip Morris…"), a digit or a bracket
 * (a citation string), or follow a full stop (a paragraph running on past a
 * sentence that happens to end the page). The layout can:
 *
 * - **R1**: the old page's last line does not end a sentence, and the new
 *   page's first line is *flush* with the line under it on the same page (no
 *   first-line indent: |indent| < 0.6 em) or opens in lower case; it does not
 *   open on a label ("57.", "(b)", "9.88", "•"); and the font does not change
 *   across the break.
 * - **R2**: the old page's last line ends a sentence, but the page is set
 *   justified, that line runs to the right margin (within 0.5 em), and the
 *   new page's first line is flush, unlabelled, in the same font and longer
 *   than four words.
 *
 * A first line compared with the line under it on its own page, not with the
 * old page: verso and recto text blocks can sit at different lefts (Saville).
 *
 * Deterministic: the same layout and text give the same decision. A decision
 * near a threshold is marked `ambiguous`, which is where an optional referee
 * (38s.11) may be consulted; without one the rules stand.
 */
/** |first-line indent| below this, in ems, is flush. */
export declare const FLUSH_EM = 0.6;
/** Right gap below this, in ems, runs to the margin. */
export declare const FULL_LINE_EM = 0.5;
/** A page whose lines' median right gap is below this, in ems, is justified. */
export declare const JUSTIFIED_EM = 0.5;
/** R2's next line must be longer than this, in words. */
export declare const R2_MIN_WORDS = 4;
/**
 * R1 does not join after a line that stops this many ems short of the right
 * margin: a ragged-right page's prose stays within it (Saville's, PSI's
 * widest gaps are under 5), a list, index or timeline entry does not.
 */
export declare const SHORT_LINE_EM = 5;
export type PageBreakLines = {
    /** The last line of the paragraph left at the foot of the old page. */
    prev: LayoutLine;
    /** The first line of the block opening the new page. */
    next: LayoutLine;
    /** The line under `next` on the same page, when there is one. */
    under?: LayoutLine;
    /** Whether `under` carries on the block's own text (the block has a second line on this page). */
    underContinues: boolean;
    /** The old page's layout (for whether it is set justified). */
    prevPage: PageLayout;
};
export type PageBreakOptions = {
    /** The PDF is a scan read through its OCR layer: a line's size may be a point off its neighbour's. */
    scanned?: boolean;
    /** A second opinion on the low-margin calls. */
    referee?: PageBreakReferee;
};
export type PageBreakDecision = {
    join: boolean;
    /** Which rule joined, or why not. */
    rule: "R1" | "R2" | "split";
    reason: string;
    /** The first-line indent of `next` against `under`, in ems (undefined without `under`). */
    indentEm?: number;
    /**
     * A low-margin call: the indent is within a quarter em of the flush
     * threshold, the decision rests on R2, or the line under is not the
     * block's own. A referee, when one is supplied, decides these.
     */
    ambiguous: boolean;
};
/** One page-break pair, as a referee sees it. */
export type PageBreakCase = {
    /** Stable key: a hash of the two lines' text. A cache of answers is keyed by it. */
    key: string;
    /** The paragraph at the foot of the old page (its whole text). */
    prevText: string;
    /** The block opening the new page (its whole text). */
    nextText: string;
    lines: PageBreakLines;
    /** What the rules decided. */
    decision: PageBreakDecision;
};
/**
 * An optional referee for the low-margin calls (38s.11): answers `true`
 * (join), `false` (split) or `undefined` (no answer: the rules stand). It
 * must be deterministic, which in practice means reading a committed cache
 * keyed by `PageBreakCase.key`, never calling out while ingesting.
 */
export type PageBreakReferee = (pageBreak: PageBreakCase) => boolean | undefined;
/**
 * The same face either side of the break: family, colour, weight and slant,
 * and size. On a scan (`scanned`) the size may differ by a point: an OCR text
 * layer sizes each line from its own glyphs, 16 and 17 on one page. On a
 * born-digital page it may not: 9/11 sets its map captions one point under
 * the body.
 */
export declare function sameFace(a: LayoutLine, b: LayoutLine, scanned?: boolean): boolean;
/** Whether a page is set justified: the median right gap of its body lines of some length. */
export declare function isJustified(page: PageLayout): boolean;
/**
 * The rules, on the lines either side of one page break. Pure: the test seam.
 * `prevText` and `nextText` are the blocks' text as the pipeline read them
 * (the sentence-end and label tests read those, not the layout's text).
 */
export declare function decidePageBreak(lines: PageBreakLines, prevText: string, nextText: string, options?: PageBreakOptions): PageBreakDecision;
/**
 * Letters only, lower case, ligatures and diacritics folded: the two texts
 * compare equal. Digits are left out because a footnote marker is a digit run
 * whose place differs between the two readings ("Hazmi.11").
 */
export declare function letters(s: string): string;
/**
 * Finds the layout lines either side of a page break: the paragraph's last
 * line on the old page (searched on the pages before the new one, latest
 * first) and the block's first line on the new page, by their text. Returns
 * undefined when either cannot be found, which leaves the pair to the text
 * rules.
 */
export declare function findPageBreakLines(layout: Layout, prevText: string, nextText: string, at: {
    volume?: number;
    pdfIndex: number;
}): PageBreakLines | undefined;
/** The key a referee's cache is read by: the two lines' text, hashed. */
export declare function pageBreakKey(prev: string, next: string): string;
/**
 * Whether a paragraph left at the foot of one page and a paragraph opening
 * the next are one paragraph, by the layout rules (and the referee, on a
 * low-margin call, when one is supplied). False when the lines cannot be
 * found in the layout.
 */
export declare function layoutJoins(layout: Layout, prevText: string, nextText: string, at: {
    volume?: number;
    pdfIndex: number;
}, options?: PageBreakOptions): boolean;
/**
 * Whether a block left on a page is not set in the body face: the run-over of
 * a footnote that began on the page before (no number of its own), which the
 * page's parse read as a paragraph of the body (Lehman PDF p.59,
 * reportsthatmatter-j6qm). Found by the block's text against the page's
 * lines; false when the lines cannot be found.
 */
export declare function isOffFaceBlock(layout: Layout, text: string, at: {
    volume?: number;
    pdfIndex: number;
}): boolean;
