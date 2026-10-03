export type Footnote = {
    number: number;
    /**
     * The note's label where its number alone does not identify it — "3-117",
     * the printed number then which block it came from (`paragraph-notes.ts`).
     * Rendered as its number; absent for every document numbered once through.
     */
    label?: string;
    text: string;
    page: number;
    volume?: number;
    pdfIndex?: number;
    /** The printed page number the note sits on — what a correction's `where` scopes against. */
    printed?: number | null;
    /**
     * `footnoteRestarts`: the note opens a numbering that starts over, so it is never the tail of a
     * note above it with the same number (a chapter with one note, then a chapter's note 1).
     */
    restart?: boolean;
};
type NoteStyle = "bare" | "period";
export declare function parseFootnotes(lines: string[], page: number, style?: NoteStyle, options?: {
    sequenced?: boolean;
}): Footnote[];
export declare function linkInlineMarkers(text: string, known: Set<number>): string;
/**
 * Whether a line is one of the appendix's own chapter headings, confirmed
 * against the chapters the contents lists (`numberedContents`) rather than
 * trusted on shape alone — the same discipline `numberedSectionAt` applies
 * to a numbered section, and for the same reason: a citation that happens to
 * open "40 U.S.C. § 1401" is not spelt like any real chapter title, so it
 * never matches the set it is checked against.
 */
export declare function isNotesChapterHead(line: string, chapters: ReadonlySet<string>): boolean;
/** One raw line from a printed "Notes" appendix, with where it came from. */
export type NotesLine = {
    volume: number;
    pdfIndex: number;
    printed: number | null;
    line: string;
};
/**
 * Reads a printed "Notes" appendix whose numbering restarts every chapter
 * (reportsthatmatter-60p). Segmented on each confirmed chapter head, because
 * `parseFootnotes`'s sequencing assumes a note's number only goes up: fed the
 * whole appendix in one run, chapter 2's note 1 reads as a wildly
 * out-of-sequence continuation of chapter 1's last note — several notes
 * fused into one, or split apart at the wrong point — rather than a fresh
 * note. Text before the first confirmed chapter head (a citation-conventions
 * preamble, in this report) is not a note and is dropped.
 *
 * The chapter head itself is not kept as a heading. Like every other
 * page-foot or paragraph note in this pipeline, these become sidenotes next
 * to their markers (`withSidenotes` in `markdown.ts`); the printed appendix
 * is never rendered as a page of its own — `stripNotesSection` and the
 * collected `[^N]:` definitions replace it entirely, exactly as for the rest
 * of the corpus. That is also what actually fixes the appendix reading as
 * plain paragraphs and run-together block quotes: the raw text stops being
 * body content at all once it is read as notes here.
 */
/** One appendix chapter's own note numbers, keyed by the confirmed title's letters. */
export type NotesChapter = {
    title: string;
    numbers: Set<number>;
};
export type NotesAppendix = {
    notes: Footnote[];
    /**
     * Each chapter's own note numbers, in the same order the chapters were
     * read — what `linkFlushMarkersByChapter` scopes a body chapter's flush
     * markers against, so chapter 3's glued "1" cannot resolve against chapter
     * 11's note 1.
     */
    chapters: NotesChapter[];
};
export declare function parseNotesAppendix(lines: NotesLine[], chapters: ReadonlySet<string>): NotesAppendix;
/**
 * Links a flush-glued marker ("Airport.1", no space before the digit —
 * `linkFlushMarkers`'s usual shape) within a report whose notes restart every
 * chapter, scoped to each body chapter's own note numbers rather than the
 * whole appendix's.
 *
 * `linkFlushMarkers` elsewhere in this pipeline confirms a candidate against
 * the notes near its *page*, because page-foot notes sit close to what cites
 * them. An endnotes appendix breaks that: chapter 1's notes sit hundreds of
 * pages from chapter 1's own body, so nothing is ever "near". Chapter
 * boundaries stand in for page locality instead: a glued "1" is only chapter
 * 3's note 1 if 3 is the chapter it was found in.
 *
 * A report's own contents page can list the same chapter titles a second
 * time as headings of its own — misread as body headings rather than a
 * contents listing (reportsthatmatter-5fn, still open) — always earlier in
 * the document than any real chapter, since the contents comes first. Rather
 * than trust every text match as a real chapter boundary, this keeps only the
 * *last* one candidate per confirmed chapter, in document order, and further
 * only applies where that candidate's own title agrees with the appendix
 * chapter it would be paired with — so a miscount never mismatches a
 * chapter's markers against a different chapter's notes; it just leaves that
 * chapter's flush markers unlinked instead (the honest "not linked" list
 * still catches them).
 */
/**
 * Links the endnote markers set flush against sentence punctuation rather than
 * a lower-case word (reportsthatmatter-w1n): after a closing quotation mark
 * (`descending."37`), a short or capitalised word (`it.44`, `CNN.180`), a
 * closing bracket (`terrorists).22`), or a number (`7:45.4`).
 *
 * `linkFlushMarkers` needs a word of three lower-case letters in front, which
 * is why about one note in five stayed unlinked. These shapes are looser, so
 * each candidate must also come in sequence: the notes of a chapter are
 * numbered in the order they are cited, so a candidate is a marker only if
 * its number is one of the chapter's and runs on from the last marker read
 * (within a dozen, since a note can be cited from a table or an unread
 * figure). A year after a full stop, or a decimal, does not.
 */
export declare function linkSequencedMarkers(text: string, plausible: ReadonlySet<number>): string;
export declare function linkFlushMarkersByChapter(body: string, chapters: ReadonlySet<string>, notesChapters: NotesChapter[]): string;
/** The notes as `renderEndnotes` prints them: consecutive notes with one label are one note (a note that runs over a page). */
export declare function mergeFootnotes(notes: Footnote[]): Footnote[];
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
export {};
