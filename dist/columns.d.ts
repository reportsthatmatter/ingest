/**
 * Two-column page handling.
 *
 * `pdftotext -layout` preserves horizontal position, which means a two-column
 * page arrives with both columns on the same physical line, separated by a
 * band of whitespace:
 *
 *     of particular concern to the investigation. Specifically, re-    thin slice of Earth's horizon is visible
 *
 * Read line by line, that welds an unrelated sentence into the middle of
 * every paragraph — unreadable, and invisible to the fidelity checks, which
 * count words rather than order them.
 *
 * The gutter is found from the text itself: a band of columns that is blank
 * on nearly every content line, with substantial text on both sides of it.
 */
/** A vertical band of whitespace separating two columns of text. */
export type Gutter = {
    start: number;
    end: number;
};
/**
 * Finds the column gutter on one page, or null if the page is single-column.
 *
 * Deliberately conservative: a page it is unsure about is left alone, because
 * splitting a single-column page shreds it, while failing to split a
 * two-column one leaves it no worse than it is today.
 */
export declare function detectGutter(lines: string[]): Gutter | null;
/**
 * Reads a page column by column instead of line by line.
 *
 * Each column keeps its own leading whitespace, because indentation is what
 * tells the block parser where a paragraph begins. Pages with no detectable
 * gutter are returned untouched.
 */
export declare function splitColumns(lines: string[]): string[];
