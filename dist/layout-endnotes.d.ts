import type { Footnote } from "./footnotes.js";
import type { Layout } from "./layout.js";
import type { Block } from "./paragraphs.js";
/** One chapter whose notes the report prints: its label, the words its body heading opens with, and its note numbers. */
export type EndnoteChapter = {
    /** `C` in `N-C`: 1-based, in the order the notes are printed. */
    key: number;
    /** The words that name it ("Chapter One", "CHAPTER 5"), or undefined when nothing names it. */
    name?: string;
    numbers: Set<number>;
    /** Where its notes section opens: its body ends there at the latest. */
    notesAt: {
        volume: number;
        pdfIndex: number;
    };
};
type PageAt = {
    index: number;
    volume: number;
    pdfIndex: number;
    printed: number | null;
};
export type EndnotesPage = {
    /** The text reader's own lines printed above the section heading: the page's body, to be read as before. */
    body: string[];
    /**
     * The section heading and its preamble (what precedes the first note), as the layout sets them. Added
     * to the body after the page's furniture is taken off: Columbia repeats its preamble under every
     * section heading, and on a page of notes those lines sit at the page's edge, where repetition is
     * what marks furniture.
     */
    heading: string[];
    notes: Footnote[];
};
/** Words for matching a chapter name against a heading: lower case, letters and digits. */
export declare function headingWords(s: string): string;
/**
 * Reads the notes sections page by page, in document order. Holds the open
 * section (if any) across pages.
 */
export declare class LayoutEndnotesReader {
    private readonly layout;
    readonly chapters: EndnoteChapter[];
    private open;
    private noteSize;
    private noteFamily;
    private columns;
    private prev;
    private current;
    private furnitureKeys;
    constructor(layout: Layout);
    /** Lines that recur in the same place on three or more pages of the volume (running heads, folios, banners). */
    private isFurniture;
    private placeKey;
    /** A section heading on this line, with the words after "for" when it has them. */
    private headOf;
    private inNotesFace;
    /** A number set alone in a smaller face, the note's text on the next line (Deepwater). */
    private smallNumber;
    private columnOf;
    /** A note's opening on this line: its number and the text after it. */
    private opener;
    /** The column note margins on a page: the lefts of its raised openers, clustered. */
    private learnColumns;
    private sortByColumn;
    /**
     * One page. Returns undefined when the page is not part of a notes
     * section (its body is left as the text reader made it).
     */
    page(at: PageAt, rawBody: string[]): EndnotesPage | undefined;
    /**
     * The text reader's lines that hold only the page's running head or foot (Columbia's "238   Report
     * Volume I   August 2003", Deepwater's "Endnotes   307   307"): kept, so the furniture pass finds
     * them on every page as before and reads the printed page number off them.
     */
    private furnitureLines;
    /** Where the open section's heading is: its chapters' bodies end there at the latest. */
    private sectionAt;
    private startChapter;
    private inSequence;
    private bigLine;
    /** A big line that the numbering restarts under: the next line is note 1. */
    private subheadAt;
    private closeNote;
}
/**
 * Which printed chapter each body block belongs to, for linking its markers.
 *
 * A chapter's body opens at the first heading, after the previous chapter's,
 * whose words begin with the chapter's name ("Chapter One" opens "Chapter
 * One: “Everyone involved…”"), and runs to the next chapter's heading or to
 * where its own notes are printed, whichever comes first. A chapter with no
 * name, or whose heading is not found, links nothing: a bare number is
 * visibly a gap, a marker opening another chapter's note reads as the
 * document.
 */
export declare function chapterOfBlocks(blocks: Block[], chapters: EndnoteChapter[]): Map<Block, EndnoteChapter>;
export {};
