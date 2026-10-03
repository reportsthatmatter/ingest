/**
 * `foliosInStep` (reportsthatmatter-uw50): which printed-number reads are stray.
 *
 * `reads` are the pages of one volume that read a printed number, in PDF order. In a report whose
 * pages are numbered continuously the offset (printed minus PDF page) is constant over long runs
 * and changes only where the numbering restarts. A read whose offset differs from the pages round
 * it is a digit of figure garble taken for a folio. Consecutive reads at one offset form a run; a
 * run of fewer than `minRun` reads next to a run of `minRun` or more is stray, and is dropped.
 * A run of up to `maxBracketed` reads whose neighbouring runs both sit at the same other offset is
 * stray too: Challenger's test-method pages print their own "2" to "7" folios, a consecutive run, in a
 * stretch the report numbers 370 to 375 (a run in step with itself and with nothing round it).
 * Dropping is repeated until nothing changes, so two or three strays in a row go too.
 */
export type FolioRead = {
    pdfIndex: number;
    printed: number;
};
export declare function strayFolios(reads: FolioRead[], minRun?: number, maxBracketed?: number): Set<number>;
/** One page's printed-number read, as the pipeline made it, before `foliosInStep` dropped any. */
export type FolioRow = {
    volume: number;
    pdfIndex: number;
    printed: number | null;
    dropped: boolean;
};
export type FolioSource = "pipeline" | "vision" | "html";
export type FolioPage = {
    volume: number;
    pdfIndex: number;
    /** The printed number read off the page (null: none read, or a stray read dropped). */
    printed: number | null;
    /** A stray read `foliosInStep` dropped, or one the rule would drop if the report declared it. */
    stray?: {
        printed: number;
        dropped: boolean;
    };
    /** The number the page's marker carries when none was read (a page numbered from its neighbours). */
    inferred?: number;
    source: FolioSource;
    /** Printed minus PDF page index, within the volume; null when no number was read. */
    offset: number | null;
};
export type FolioRun = {
    volume: number;
    fromPdf: number;
    toPdf: number;
    reads: number;
    offset: number;
    firstPrinted: number;
    lastPrinted: number;
};
export type FolioReport = {
    pages: FolioPage[];
    runs: FolioRun[];
    unread: number;
    inferred: number;
    strays: number;
};
/**
 * What `pnpm ingest folios` prints: per PDF page the printed number read, its source (the vision reading, the
 * pipeline's, or an HTML edition with the PDF as shadow), the offset, and the runs of one offset the reads fall
 * into. The run and stray rule is `strayFolios`, the one `foliosInStep` applies: a report that does not declare
 * the pass still has its would-be strays listed (`stray.dropped` false).
 */
export declare function folioReport(result: {
    folios?: FolioRow[];
    vision?: {
        pages: Array<{
            volume: number;
            pdfIndex: number;
            source: "vision" | "pipeline";
        }>;
    };
    edition?: unknown;
    blocks?: Array<{
        kind: string;
        number?: unknown;
        at?: {
            volume: number;
            pdfIndex: number;
        };
    }>;
}): FolioReport;
