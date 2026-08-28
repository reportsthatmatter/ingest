export type Page = {
    /** 1-based index across the whole report, not the printed page number. */
    index: number;
    /** Which source volume this page came from, 1-based. */
    volume: number;
    /** 1-based index within its own PDF. What you open the file at to check. */
    pdfIndex: number;
    lines: string[];
};
/**
 * Extracts text with `pdftotext -layout`, which preserves leading whitespace.
 * The indentation is load-bearing: it is what tells us where paragraphs begin.
 */
export declare function extractPages(pdfPath: string): Page[];
/** Normalises the characters pdftotext emits that would otherwise reach output. */
export declare function normaliseWhitespace(text: string): string;
