import { type Page } from "./extract";
export type SplitPage = {
    index: number;
    volume: number;
    pdfIndex: number;
    /** Printed page number, if the page carries one. */
    printed: number | null;
    body: string[];
    footnotes: string[];
};
/**
 * Two layouts, both common.
 *
 * Inline — the number sits hard against its text:
 *   `110   See 3/1/2007 Washington Mutual Inc. 10-K filing.`
 *
 * Stacked — the number is alone on its line and the text follows beneath:
 *   `110`
 *   `    See 3/1/2007 Washington Mutual Inc. 10-K filing.`
 *
 * The Jack Smith report uses the first, the PSI financial crisis report the
 * second, and supporting only one finds seven notes in a document with
 * thousands.
 */
export declare const FOOTNOTE_INLINE: RegExp;
/** Candidate note openings on a page, in either layout. */
export declare function noteCandidates(lines: string[]): Array<{
    line: number;
    note: number;
}>;
/**
 * Separates the three things a scanned report page contains: the running body,
 * the footnote block at the foot of the page, and the printed page number.
 *
 * Footnotes are found by walking up from the bottom: the block is the trailing
 * run of lines that starts with an ascending footnote number. Walking upward
 * matters because footnote numbers also appear inline in the body.
 */
/**
 * Takes the printed page number off a page, if it carries one.
 *
 * It sits alone on a line, at the foot or the head — the Jack Smith report
 * uses a footer, the PSI report a header, and looking in only one place loses
 * page anchors for half the archive.
 */
export declare function takePrintedNumber(input: string[]): {
    printed: number | null;
    lines: string[];
};
/**
 * Separates the footnote block at the foot of a page from the running body.
 *
 * The notes sit as a consecutively numbered run. Anchor on that run rather
 * than on the first number seen — wrapped case citations ("575 F.3d 726,
 * 735 …") look identical to a note opening, and only the numbering tells them
 * apart. Walking upward matters because footnote numbers also appear inline.
 */
export declare function splitFootnoteBlock(lines: string[], expectedNote: number): {
    body: string[];
    footnotes: string[];
};
/**
 * The two page-local passes composed: take the printed number, then separate
 * the footnote block from the body. Kept as one entry point because that is
 * the order they must run in — the page number would otherwise look like a
 * stacked note opening.
 */
export declare function splitPage(page: Page, expectedNote: number): SplitPage;
export declare function stripRepeatedPageFurniture(pages: SplitPage[]): SplitPage[];
/**
 * pdftotext preserves the original double-spacing on many pages, which would
 * otherwise read as a paragraph break on every single line.
 */
export declare function collapseDoubleSpacing(lines: string[]): string[];
