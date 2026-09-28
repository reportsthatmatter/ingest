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
 * A rectangle in PDF user-space points (poppler's own coordinate system,
 * origin at the page's top-left corner) to extract text from, discarding
 * everything outside it before layout reconstruction runs.
 *
 * For a source whose furniture sits outside the trimmed page — a rotated
 * chapter-tab printed in the bleed margin beyond the CropBox, say — this
 * removes it before it can be threaded into the line stream, rather than
 * matching its text back out afterwards. `pdfinfo -box` prints a PDF's
 * MediaBox/CropBox so the furniture's margin can be measured once and
 * declared here, the same way a checksum is declared once and reused.
 */
export type Crop = {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** The `pdftotext` arguments for one page range, with an optional crop. */
export declare function pdftotextArgs(pdfPath: string, crop?: Crop): string[];
/**
 * Extracts text with `pdftotext -layout`, which preserves leading whitespace.
 * The indentation is load-bearing: it is what tells us where paragraphs begin.
 */
export declare function extractPages(pdfPath: string, crop?: Crop): Page[];
/** Normalises the characters pdftotext emits that would otherwise reach output. */
export declare function normaliseWhitespace(text: string): string;
