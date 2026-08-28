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
/**
 * Footnote markers that sit flush against the word before them.
 *
 * OCR frequently drops the space before a superscript, leaving "diarrhoea112"
 * or "childhood.1" — a bare number in the prose where a reference should be.
 * The Litvinenko report carries roughly 230 of them.
 *
 * A first attempt keyed on punctuation and case, and corrupted a real
 * citation: "Section V.D.2" became a marker. That reversion is the constraint
 * on any retry — a rule that damages genuine text is worse than a bare
 * number, because a bare number is visibly a gap while corrupted text reads
 * as the document.
 *
 * So this is a lookup rather than a typographic guess. A candidate is only a
 * marker if a note with that number was actually collected **near this page**.
 * Page locality is what makes it safe: these documents number notes
 * sequentially, so a three-digit number fused to a word on page 40 is a
 * marker only if the notes around page 40 include it. A measurement or a
 * model number will not be.
 */
export declare function linkFlushMarkers(text: string, plausible: Set<number>): string;
