import { type Page } from "./extract.js";
export type SplitPage = {
    index: number;
    volume: number;
    pdfIndex: number;
    /** Printed page number, if the page carries one. */
    printed: number | null;
    /** A roman-numeral folio (`romanFolios`), lower case, when the page carries one and no arabic number. */
    roman?: string;
    body: string[];
    footnotes: string[];
    /**
     * The tail of the previous page's last note, where it opens this page's
     * block above the first numbered note (`runOverStart`). Never parsed for
     * note numbers: a run-over line that starts "169 (Text messages…" is a
     * page reference inside a citation, not note 169.
     */
    runOver?: string[];
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
/** How a report numbers its page-foot notes: "104 Letter…" (bare), "104. Letter…" (period) or "104<tab>Letter…" (tabbed). */
export type FootnoteNumbers = "bare" | "period" | "tabbed";
/** Candidate note openings on a page, in either layout. */
export declare function noteCandidates(lines: string[], numbers?: FootnoteNumbers): Array<{
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
export declare function takePrintedNumber(input: string[], options?: {
    roman?: boolean;
    paren?: boolean;
    head?: PageHeadFolio;
}): {
    printed: number | null;
    roman?: string;
    lines: string[];
};
/**
 * `pageHeadFolios`: a running head that carries the page number as "Page 7", on its own line at the head of
 * the page, under a line of the head's other words ("January 6, 2025") that goes with it. A page without
 * the head (a letterhead's first page) is not touched.
 */
export type PageHeadFolio = {
    above?: RegExp;
};
/**
 * Separates the footnote block at the foot of a page from the running body.
 *
 * The notes sit as a consecutively numbered run. Anchor on that run rather
 * than on the first number seen — wrapped case citations ("575 F.3d 726,
 * 735 …") look identical to a note opening, and only the numbering tells them
 * apart. Walking upward matters because footnote numbers also appear inline.
 */
export declare function splitFootnoteBlock(lines: string[], expectedNote: number, options?: {
    citationRunOver?: boolean;
    footnoteGap?: boolean;
    footnoteRestarts?: boolean;
    sequencedNoteOpenings?: boolean;
    footnoteNumbers?: FootnoteNumbers;
}): {
    body: string[];
    footnotes: string[];
    runOver: string[];
};
/**
 * The two page-local passes composed: take the printed number, then separate
 * the footnote block from the body. Kept as one entry point because that is
 * the order they must run in — the page number would otherwise look like a
 * stacked note opening.
 */
export declare function splitPage(page: Page, expectedNote: number, options?: {
    citationRunOver?: boolean;
    footnoteGap?: boolean;
    footnoteRestarts?: boolean;
    sequencedNoteOpenings?: boolean;
    romanFolios?: boolean;
    parenFolios?: boolean;
    pageHeadFolios?: PageHeadFolio;
    footnoteNumbers?: FootnoteNumbers;
}): SplitPage;
export type FurnitureOptions = {
    /**
     * Strip a line that repeats only once its digits are blanked only where its
     * numbers advance with the page (`tracksPages`). Off by default, because it
     * moves reports that have not asked for it — see `runningFurniture`.
     */
    numbersTrackPages?: boolean;
    /**
     * Raise the share of pages a line must repeat on before it counts as
     * furniture, beyond the flat `MIN_REPEATED_FURNITURE` count. See
     * `runningFurniture`.
     */
    minShare?: number;
};
export declare function stripRepeatedPageFurniture(pages: SplitPage[], options?: FurnitureOptions): SplitPage[];
/**
 * pdftotext preserves the original double-spacing on many pages, which would
 * otherwise read as a paragraph break on every single line. A `margin` is the
 * `doubleSpaced` pass: the page is double-spaced whatever its proportions,
 * and its body sits at that margin.
 */
export declare function collapseDoubleSpacing(lines: string[], margin?: number): string[];
