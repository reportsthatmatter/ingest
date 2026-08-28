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
};
/**
 * A contents page, where entries wrap across several lines and only the last
 * carries the dot leaders. Parsing these line by line shreds one entry into a
 * heading, a block quote and a list item, so they get their own pass.
 */
export declare function isContentsPage(lines: string[]): boolean;
export declare function parseContentsPage(lines: string[]): Block[];
/**
 * The most common indent among content lines — the left margin of running text.
 * Paragraph-initial lines sit measurably to the right of it.
 */
export declare function bodyIndent(lines: string[]): number;
/** A heading this pipeline emitted for a numbered division, by its text. */
export declare function isDivisionHeading(text: string): boolean;
export declare function danglesMidPhrase(text: string): boolean;
/**
 * Reflows hard-wrapped lines back into paragraphs.
 *
 * The signal is indentation: a line indented past the running left margin opens
 * a new paragraph. Blank lines are a secondary signal, and block quotes (set
 * far to the right) are kept as quotes.
 */
export declare function toBlocks(lines: string[], documentMargin?: number): Block[];
export declare function endsSentence(text: string): boolean;
export declare function mergeAcrossPages(blocks: Block[]): Block[];
export declare function blocksToMarkdown(blocks: Block[]): string;
