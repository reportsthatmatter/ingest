import type { Layout } from "./layout.js";
import type { Block } from "./paragraphs.js";
/**
 * Footnote markers linked from the PDF's own typesetting (reportsthatmatter-b94).
 *
 * The text-only linkers guess a marker from its shape in `pdftotext`'s
 * output: a number after sentence punctuation and a space
 * (`linkInlineMarkers`), or glued to a lower-case word (`linkFlushMarkers`).
 * Both miss the commonest shape in a born-digital report, a raised number
 * flush against whatever precedes it: "companies.7", "Corp,12",
 * "community.”1", "IS.”1410", "1985 62" set as "198562". And they cannot
 * tell a marker from a number without guessing, which is why every widening
 * of them has had to be undone ("Section V.D.2", "18 U.S.C.").
 *
 * The PDF says which numbers are markers: they are set small and raised
 * (`LayoutLine.raised`, from `pdftohtml -xml`). This pass reads each page's
 * raised digit runs, finds each one in the page's blocks by the words
 * printed before it, and links it, when three things agree:
 *
 * 1. the layout raises it, in a line set at (about) the body's size, after
 *    something on the same line (a raised number opening its line is a note's
 *    own number, at the page foot or on a notes page);
 * 2. a note with that number was collected where this report keeps its notes
 *    (`scope`: near the page for footnotes, anywhere for endnotes);
 * 3. it is in sequence: of the page's candidates, only the longest run of
 *    increasing numbers is kept, because notes are cited in the order they
 *    are numbered. A raised "2" in "km2" between notes 151 and 152 is not.
 *
 * A candidate whose words cannot be found in the page's blocks, or found
 * more than once out of reading order, is left alone: an unlinked marker is
 * visibly a gap; a wrong link reads as the document.
 */
export type LayoutMarkersOptions = {
    /**
     * Where a marker's note may be: `"page"` (the default), a note collected
     * on the marker's own page or either side of it (page-foot notes; a note
     * that runs over is read on the next page); `"document"`, any note the
     * report collected (endnotes at a chapter's or the report's end).
     */
    scope?: "page" | "document";
};
export type LayoutMarkerStats = {
    /** Raised digit runs after text, in body-size lines, on pages with blocks. */
    raised: number;
    /** Of those, with a note to link to (scope) and in sequence. */
    candidates: number;
    linked: number;
    /** Candidates whose anchoring words were not found in the page's blocks. */
    unplaced: number;
    /** Every link made, with the text around it: for reading a sample against the page. */
    links: Array<{
        volume: number;
        pdfIndex: number;
        note: number;
        context: string;
    }>;
    /** Every candidate left unplaced, with the words it was looked for by. */
    misses: Array<{
        volume: number;
        pdfIndex: number;
        note: number;
        anchor: string;
    }>;
};
/**
 * Folds the characters `pdftotext` and `pdftohtml` may spell differently
 * (curly quotes, dashes, ligatures, no-break spaces) and keeps, for each
 * character of the result, the index of the character it came from.
 */
export declare function foldForMatch(s: string): {
    text: string;
    from: number[];
};
/**
 * Links the raised markers of every page in `blocks` (in place).
 *
 * With page-foot notes a marker cites a note collected on its own page, or on
 * the page either side (a note block the reader put on the wrong page) when
 * that page's own markers do not cite the same number: Leveson vol. 3 p.135's
 * notes 2 and 3 went unread, and p.136's notes 2 and 3 belong to p.136's
 * markers, not to them.
 */
export type MarkerNotes = 
/** Page-foot notes: the note numbers collected on each page. */
{
    scope: "page";
    onPage: (volume: number, pdfIndex: number) => ReadonlySet<number>;
}
/** Endnotes: every note number the report collected. */
 | {
    scope: "document";
    known: ReadonlySet<number>;
};
export declare function linkLayoutMarkers(blocks: Block[], layout: Layout, notes: MarkerNotes): LayoutMarkerStats;
/**
 * Whether the layout shows a note being defined on this page: a line that opens
 * on a raised number (a footnote's own number, set like its marker) or on a
 * number in a face smaller than the body (a note set in the notes' size).
 * A contents page whose entries the page-foot reader took for notes ("1
 * Introduction 3" in the body's own face, nothing raised: Leveson's contents)
 * has neither.
 */
/**
 * `footnoteNumbers("period")`: whether the line that opens a page's note block ("104. Letter from…") is
 * set in the notes' smaller face. A body paragraph numbered the same way at the page foot (Hillsborough's
 * Appendix 1, "8. In all of the above cases, …") is in the body's face, and stays body. A line the layout
 * does not find is given the benefit of the doubt.
 */
export declare function inNoteFace(layout: Layout, volume: number, pdfIndex: number, line: string): boolean;
export declare function pageDefinesNotes(layout: Layout, volume: number, pdfIndex: number): boolean;
