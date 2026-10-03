import type { Layout } from "./layout.js";
import type { Block } from "./paragraphs.js";
import type { Footnote } from "./footnotes.js";
/**
 * The layout oracle (quality-harness plan §3.3): what the PDF's own layout
 * says the structure is, set against what the pipeline produced.
 *
 * Measure-only. Nothing here feeds back into any output, and it is not a
 * second parser: it derives *expected* headings, markers, paragraph starts
 * and quotations per page from font, size, colour and position, and counts
 * the disagreements. A count is a prompt to look, not a verdict: precision
 * per signal is measured against golden pages and recorded in the site's
 * `docs/quality-harness.md` before any signal is budgeted.
 *
 * Each produced element is located on its source page by its opening
 * characters. An element that cannot be located (a heading synthesised from
 * a contents list, garbled OCR) is counted under `unlocated`, not as a
 * disagreement.
 */
export type OracleSignal = "headings-missed" | "headings-spurious" | "markers-unlinked" | "markers-spurious" | "paragraphs-oversplit" | "paragraphs-merged" | "quotes-spurious" | "quotes-missed" | "note-off-page";
export type OracleFinding = {
    signal: OracleSignal;
    volume: number;
    page: number;
    text: string;
};
export type PageCounts = Record<OracleSignal, number>;
export type OracleReport = {
    counts: PageCounts;
    /** What the layout expects, in total. */
    expected: {
        headings: number;
        markers: number;
        paragraphStarts: number;
        quoteRuns: number;
    };
    /** What the pipeline produced that the layout could be compared with. */
    produced: {
        headings: number;
        markers: number;
        paragraphStarts: number;
        quotes: number;
    };
    /** Produced elements whose opening could not be found on their source page. */
    unlocated: {
        headings: number;
        paragraphStarts: number;
        quotes: number;
    };
    /** Per page, only where something disagrees; key `volume:page`. */
    pages: Record<string, PageCounts>;
    findings: OracleFinding[];
    /** The first few elements that could not be located, to see why. */
    unlocatedSamples: Array<{
        kind: string;
        volume: number;
        page: number;
        text: string;
        reason: string;
    }>;
};
export declare const ORACLE_SIGNALS: OracleSignal[];
/** Thresholds, in one place so a measurement can say what it measured with. */
export declare const ORACLE: {
    /** Heading: at least this much bigger than the body... */
    headingSizePt: number;
    /** ...or a different colour, but then not smaller than the body by more than this. */
    headingColourFloorPt: number;
    /** A heading runs to at most this many lines and characters. */
    headingMaxLines: number;
    headingMaxChars: number;
    /** A gap of this many line pitches between body lines starts a paragraph. */
    gapPitches: number;
    /** A first line this far (ems) from the line under it starts a paragraph. */
    indentEm: number;
    /** The line under it counts as flush with the margin within this (ems). */
    flushEm: number;
    /** Quotation: both sides in from the body measure by this (ems). */
    quoteEm: number;
    /** Text (digits aside) that repeats in the same place on this many pages is furniture. */
    furniturePages: number;
};
/**
 * Measures one report's produced blocks against the PDF's layout.
 *
 * `footnotes` supplies the note numbers a marker may link to, as the pipeline
 * itself links them (`linkInlineMarkers`).
 */
export declare function measureLayout(layout: Layout, blocks: Block[], footnotes?: Array<Pick<Footnote, "number"> & Partial<Pick<Footnote, "text" | "label" | "volume" | "pdfIndex">>>, 
/**
 * `relink: false` when `blocks` come from `finalBlocks` and their markers are the pipeline's own.
 * Re-linking them with `linkInlineMarkers` counts links the reader never sees wherever the
 * pipeline did not run it (a report whose layout decides its markers, `layoutMarkers`; paragraph notes).
 */
options?: {
    relink?: boolean;
    /**
     * Count `note-off-page`: references whose rendered note was printed more than a page from the
     * marker (`noteOffPage`). Only for a report whose notes are page footnotes (`hasPageNotes`), and
     * needs `blocks` from `finalBlocks`; `footnotes` must be the whole `IngestResult.footnotes`.
     */
    noteOffPage?: boolean;
}): OracleReport;
