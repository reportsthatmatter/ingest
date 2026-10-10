import { type Page } from "./extract.js";
import { type FolioRow } from "./folios.js";
import type { ResolvedPasses } from "./define.js";
import { type Correction } from "./corrections.js";
import { type Block } from "./paragraphs.js";
import { type Footnote } from "./footnotes.js";
import { type TypographicHeadingStats } from "./typographic-headings.js";
import { type LayoutMarkerStats } from "./markers.js";
import { type Suspect } from "./ocr.js";
import type { PipelineContext } from "./context.js";
import { type EditionReport } from "./edition.js";
import { type VisionReport } from "./vision/hybrid.js";
export type IngestResult = {
    markdown: string;
    corrections: number;
    sourceText: string;
    footnotes: Footnote[];
    suspects: Suspect[];
    autoFixes: number;
    pages: number;
    /**
     * The final blocks, as serialised into `markdown`: for tools that measure
     * the structure (the layout oracle) rather than re-parse the text. Page
     * provenance is on `at`; footnote markers are not yet linked in `text`.
     */
    blocks?: Block[];
    /**
     * Each block's final markdown, parallel to `blocks`: after the hyphen
     * rejoin, the OCR autofix and every marker-linking step (`[^N]`), which
     * for an endnotes report happens only on the serialised text. What a reader
     * sees, per block, with the block's own prefix (`> `, `- `, `## `). Absent
     * if the serialised text does not split into one chunk per block.
     */
    linkedText?: Array<string | undefined>;
    /**
     * `cleanEdition` only: how the edition compares with the PDF, and the PDF
     * ingest run as its shadow (the same passes, without the edition), which
     * supplied the printed pages and is what `pnpm score` scores against the
     * served text.
     */
    edition?: EditionReport;
    shadow?: IngestResult;
    /** Each page's lines after the furniture passes (running heads, slugs, page numbers) took theirs off. */
    pageText?: Array<{
        volume: number;
        pdfIndex: number;
        lines: string[];
        noteLines?: number;
    }>;
    /** Every page's printed-number read, before `foliosInStep` dropped any (`folioReport`, `pnpm ingest folios`). */
    folios?: FolioRow[];
    /** What `layoutMarkers` saw and linked, when the report declares it. */
    layoutMarkers?: LayoutMarkerStats;
    /** `visionStructure`: which pages took the vision model's structure, and why the others did not. */
    vision?: VisionReport;
    /** What `typographicHeadings` found and cut out, when the report declares it. */
    typographicHeadings?: TypographicHeadingStats;
};
export type Metadata = {
    title: string;
    authors?: string;
    published_at?: string;
    source_url?: string;
};
export declare function divisionLabelHeadings(blocks: Block[]): Block[];
/**
 * PDF → Markdown, deterministically. The same input always produces the same
 * output, so fixes belong in this pipeline rather than in hand-edits of the
 * result — that way every correction compounds across future reports.
 */
export declare function ingest(pdfPath: string, meta: Metadata): IngestResult;
export declare function ingestPages(pages: Page[], meta: Metadata): IngestResult;
/**
 * Ingests one continuous report from one or more PDFs. Multi-volume reports
 * keep a margin per source volume: each PDF's page furniture and typesetting
 * may differ, so one global margin is not meaningful across all of them.
 */
export declare function ingestPageGroups(pageGroups: Page[][], meta: Metadata, resolved?: ResolvedPasses, corrections?: Correction[], context?: PipelineContext): IngestResult;
/**
 * `fillPrintedGaps` on the PDF path: inserts, in place, a page marker before
 * the first block of each page the gap-filler numbers. A page with no block of
 * its own (a blank or figure-only page) gets none, so markers never stack.
 */
export declare function markUnreadPages(chunks: Block[]): void;
