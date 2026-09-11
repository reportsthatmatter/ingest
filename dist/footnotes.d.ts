export type Footnote = {
    number: number;
    text: string;
    page: number;
    volume?: number;
    pdfIndex?: number;
    /** The printed page number the note sits on — what a correction's `where` scopes against. */
    printed?: number | null;
};
/**
 * Parses a page's footnote block into individual notes, in either layout —
 * number inline with its text, or number alone on its line with the text
 * beneath. Continuation lines fold into the note above them.
 */
export declare function parseFootnotes(lines: string[], page: number): Footnote[];
export declare function linkInlineMarkers(text: string, known: Set<number>): string;
/**
 * One definition per genuinely distinct note.
 *
 * A number can repeat for two different reasons, and they need opposite
 * handling. **Adjacent** entries sharing a number are the same note: either
 * an exact repeat (the note was collected twice, nothing new) or a tail that
 * ran over a page break and got re-parsed as a fresh note — concatenated
 * back onto the entry above it rather than dropped. **Non-adjacent** entries
 * sharing a number are different notes: a report whose numbering restarts
 * (Leveson: per chapter) reuses "20" for something else once the previous
 * chapter's own "20" is many notes behind it in this array — collapsing
 * those together, as a single global `Map` keyed by number used to, meant a
 * chapter's footnote reference could resolve to a different chapter's text
 * (reportsthatmatter-ooj). Those keep separate definitions under the same
 * `[^N]` label; `markdown.ts`'s `withSidenotes` resolves each reference
 * against them positionally, in the order both were written — sound because
 * both the references in the body and the definitions collected here follow
 * the same page-by-page reading order, and a note is normally cited once.
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
