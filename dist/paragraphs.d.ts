/**
 * Where a block came from in the source. Carried so a fidelity note or an OCR
 * suspect can say "Volume II, PDF page 412, printed 380" rather than a flat
 * index into a document that no longer exists as one file. `blocksToMarkdown`
 * ignores it: provenance is metadata about the text, not part of it.
 */
export type Provenance = {
    volume: number;
    pdfIndex: number;
    printed: number | null;
};
export type Block = ({
    kind: "paragraph";
    text: string;
    /** A numbered finding's number (`numberedFindings`). */
    finding?: number;
} | {
    kind: "list";
    items: string[];
    quoted: boolean;
} | {
    kind: "heading";
    level: number;
    text: string;
} | {
    kind: "quote";
    text: string;
} | {
    kind: "contents";
    text: string;
    page: string;
} | {
    kind: "page";
    number: number;
    /**
     * Which time this printed number has been seen. Absent for the first.
     *
     * These documents restart their pagination — front matter, then the
     * body, then appendices — so a printed number is not unique within one
     * report. Jack Smith prints "2" on three different pages. Without this
     * they all render `id="page-2"`, and `#page-2` silently resolves to the
     * first: not a broken citation, a quietly wrong one.
     */
    occurrence?: number;
}) & {
    at?: Provenance;
    /**
     * Nothing may be joined across this block. Set where one column of a page
     * ends and the next begins — they are adjacent in the stream but not in the
     * reading order of the sentence.
     */
    hardBreak?: true;
};
/**
 * How far past the body margin a line must sit to read as a quotation.
 *
 * Five suits a document that insets its quotations generously. Litvinenko
 * does not — it sets body text at 7 and quotations at 10 — so a report whose
 * typography is tighter declares its own; see `quoteInset` in the passes.
 */
export declare const DEFAULT_QUOTE_INSET = 5;
/**
 * A contents page, where entries wrap across several lines and only the last
 * carries the dot leaders. Parsing these line by line shreds one entry into a
 * heading, a block quote and a list item, so they get their own pass.
 */
export declare function isContentsPage(lines: string[]): boolean;
export declare function parseContentsPage(lines: string[]): Block[];
/**
 * The titles a contents page lists, one per line that carries leaders to a
 * page number; nothing from a page with fewer than three such lines. A title
 * that wraps is read from its last line only ("III. HIGH RISK LENDING:" /
 * "CASE STUDY OF WASHINGTON MUTUAL BANK. . . 48"), which is also the line
 * the body sets as its heading.
 */
export declare function contentsTitles(lines: string[]): string[];
/**
 * What a heading and its contents entry have in common: the title without its
 * marker (a heading is emitted without one), trailing dots, typographic quotes
 * or case.
 */
export declare function headingKey(text: string): string;
/**
 * What the contents lists for a report numbered by chapter and section
 * (`numberedSections`): each "8.1" section's title as the contents spells it,
 * and each chapter's title, so a chapter banner set over two lines can be
 * read as one.
 */
export type NumberedContents = {
    sections: Map<string, string>;
    chapters: Set<string>;
};
/**
 * The numbered sections and chapters a contents page lists, entries set
 * "8.1   The Summer of Threat 254" with a plain space before the page number.
 * An entry that wraps runs on until a line ends in its page number. Nothing
 * from a page with fewer than three section entries: this is a contents page,
 * not a page that happens to hold a numbered line.
 */
export declare function numberedContents(lines: string[]): NumberedContents;
/**
 * The divisions a contents page lists (`listedDivisions`): its parts,
 * chapters and appendices by label and number, and the unlabelled entries
 * around them ("Foreword", "Endnotes", "Index"), each with its title as the
 * contents spells it. `used` records which have been found in the body, so
 * each opens once.
 */
export type ListedDivision = {
    /** "chapter", "part", "appendix"…; absent for an unlabelled entry. */
    kind?: string;
    /** The division's number, canonical: "3" for "3", "III" or "Three"; "a" for "Appendix A". */
    number?: string;
    title: string;
};
export type ListedDivisions = {
    entries: ListedDivision[];
    used: Set<ListedDivision>;
};
/**
 * What a contents page lists, when its entries are set as divisions with a
 * page after a gap rather than dot leaders: "Chapter 3      55" over its
 * title lines, "PART II: Explosion and Aftermath:" wrapping to its page on
 * the next line, "Foreword      vi". A labelled entry whose own line carries
 * the page takes the lines below it as its title, up to the next entry; one
 * whose line has no page runs on until a line does. Nothing from a page with
 * fewer than three labelled entries.
 */
export declare function divisionContents(lines: string[]): ListedDivision[];
/**
 * The most common indent among content lines — the left margin of running text.
 * Paragraph-initial lines sit measurably to the right of it.
 */
export declare function bodyIndent(lines: string[]): number;
/** A heading this pipeline emitted for a numbered division, by its text. */
export declare function isDivisionHeading(text: string): boolean;
export declare function danglesMidPhrase(text: string): boolean;
/**
 * A page laid out as a table rather than as prose.
 *
 * Column alignment is the tell: a run of three or more spaces between text is
 * how `pdftotext -layout` renders a column boundary, and prose almost never
 * produces one. Measured across the corpus, a docket table scores 0.41 while
 * prose pages score 0.04-0.12, so the two do not overlap.
 */
export declare function isTabularPage(lines: string[]): boolean;
/**
 * Which lines sit inside a table, judged by their neighbours.
 *
 * Page-level is too blunt: a page can carry a chronology table and a real
 * division heading at once, and suppressing headings across the whole page
 * cost Litvinenko 26 of them and Leveson 16. A table row's *neighbours* are
 * column-aligned; a heading's are blank or prose.
 *
 * The row that prompted this carries no alignment of its own — the docket's
 * description column wraps onto its own line — so the line itself cannot be
 * the test.
 */
export declare function tabularContext(lines: string[]): boolean[];
/**
 * Reads the structure a report's own contents lists name (`chapterContents`).
 *
 * A body line that is exactly the title of a paragraph-located contents entry
 * is the subsection heading that entry points at — Saville's subsections are
 * set in plain sentence case, which nothing else can tell from a short
 * paragraph. And a chapter title cut at a line wrap ("Chapter 8: The period
 * from August to" / "December 1971") is completed when the two together are
 * exactly an entry in the contents. Exact matches only: the contents is the
 * document's own statement of its structure, and a near miss is not one.
 */
export declare function contentsHeadings(blocks: Block[]): Block[];
/**
 * The outline a report's contents sets out (`contentsOutline`): every entry's
 * title, by its level and letters, and every prefix of those letters, so a
 * body heading can be followed across the lines it wraps over.
 */
export type Outline = {
    entries: Map<string, {
        title: string;
        level: number;
    }>;
    prefixes: Set<string>;
};
export declare function emptyOutline(): Outline;
export type OutlineEntry = {
    label: string;
    title: string;
    page: string;
    level: number;
};
/**
 * The entries of a contents page set out as an outline, each opening on its
 * label and wrapping until its spaced leaders reach a page number:
 *
 *   C.   TIRC/CTR -- Tobacco Industry Research Committee/Council
 *        for Tobacco Research-USA . . . . . . . . . . . . 26
 *
 * Nothing from a page with fewer than three entries.
 */
export declare function readContentsOutline(lines: string[]): OutlineEntry[];
/**
 * A contents page read as an outline, laid out as its entries: each with its
 * label, as the contents numbers it, and its page. A title over the entries
 * ("TABLE OF CONTENTS") stays a heading.
 */
export declare function outlineContentsBlocks(lines: string[], entries: OutlineEntry[]): Block[];
/** Adds a contents page's entries to the outline the body is read against. */
export declare function learnOutline(outline: Outline, entries: OutlineEntry[]): void;
/** The next finding number a report numbered throughout expects (`numberedFindings`). */
export type FindingCounter = {
    next: number;
};
/**
 * Reflows hard-wrapped lines back into paragraphs.
 *
 * The signal is indentation: a line indented past the running left margin opens
 * a new paragraph. Blank lines are a secondary signal, and block quotes (set
 * far to the right) are kept as quotes.
 */
export declare function toBlocks(lines: string[], documentMargin?: number, quoteInset?: number, numberedParagraphs?: boolean, allCapsHeadings?: boolean, paragraphContents?: boolean, numberedHeadings?: boolean, listed?: Set<string>, numbered?: NumberedContents, findings?: FindingCounter, outline?: Outline, divisions?: ListedDivisions, wrappedHeadings?: boolean, unmarkedHeadings?: boolean): Block[];
export declare function endsSentence(text: string): boolean;
export type MergeOptions = {
    /**
     * The `pageBreakContinuations` pass (reportsthatmatter-ca3, -kb4): look past
     * every page marker, not just one, and read a page-opening quotation that
     * carries on a sentence as the rest of that sentence. See the pass.
     */
    continuations?: boolean;
};
export declare function mergeAcrossPages(blocks: Block[], options?: MergeOptions): Block[];
export declare function blocksToMarkdown(blocks: Block[]): string;
