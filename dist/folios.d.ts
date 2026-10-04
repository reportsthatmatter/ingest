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
