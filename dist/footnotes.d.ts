export type Footnote = {
    number: number;
    text: string;
    page: number;
    volume?: number;
    pdfIndex?: number;
};
/**
 * Parses a page's footnote block into individual notes, in either layout —
 * number inline with its text, or number alone on its line with the text
 * beneath. Continuation lines fold into the note above them.
 */
export declare function parseFootnotes(lines: string[], page: number): Footnote[];
export declare function linkInlineMarkers(text: string, known: Set<number>): string;
/**
 * One definition per note number.
 *
 * A number can arrive twice — most often because the note runs over a page
 * break and its tail is parsed as a fresh note. Dropping the second copy loses
 * that tail, so distinct text is appended instead; only exact repeats are
 * discarded.
 */
export declare function renderEndnotes(notes: Footnote[]): string;
