import { type Page } from "./extract.js";
import type { ResolvedPasses } from "./define.js";
import { type Correction } from "./corrections.js";
import { type Footnote } from "./footnotes.js";
import { type Suspect } from "./ocr.js";
export type IngestResult = {
    markdown: string;
    corrections: number;
    sourceText: string;
    footnotes: Footnote[];
    suspects: Suspect[];
    autoFixes: number;
    pages: number;
};
export type Metadata = {
    title: string;
    authors?: string;
    published_at?: string;
    source_url?: string;
};
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
export declare function ingestPageGroups(pageGroups: Page[][], meta: Metadata, resolved?: ResolvedPasses, corrections?: Correction[]): IngestResult;
