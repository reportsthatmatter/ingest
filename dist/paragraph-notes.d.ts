import type { Footnote } from "./footnotes.js";
/**
 * Takes note blocks out of the body and links their markers in the text
 * above them. Works across a volume's pages together, because a paragraph
 * that runs over a page break carries markers on both sides of it.
 */
export declare function extractParagraphNotes(pages: Array<{
    body: string[];
    index: number;
    volume?: number;
    pdfIndex?: number;
    printed?: number | null;
}>, firstBlock?: number): {
    notes: Footnote[];
    nextBlock: number;
};
