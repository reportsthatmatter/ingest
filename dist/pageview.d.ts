import type { Layout } from "./layout.js";
import type { Block } from "./paragraphs.js";
import type { Footnote } from "./footnotes.js";
/** Blocks that start on the page, in order (the `page` markers are kept: they carry the printed number). */
export declare function pageBlocks(blocks: Block[], volume: number, pdfIndex: number): Block[];
export declare function pageFootnotes<T extends Pick<Footnote, "volume" | "pdfIndex">>(notes: T[], volume: number, pdfIndex: number): T[];
export declare function renderPage(id: string, layout: Layout, blocks: Block[], footnotes: Footnote[], volume: number, pdfIndex: number): string;
/**
 * A draft golden entry from what the pipeline produced. It is the pipeline's
 * reading, not the truth: the agent writing the entry compares each line with
 * the page image and corrects it, and only then fills `verified_by`.
 */
export declare function draftGolden(blocks: Block[], footnotes: Footnote[], layout: Layout, volume: number, pdfIndex: number): string;
/**
 * A test fixture in the shape `tests/fixtures/oracle/*.json` already uses:
 * the page's own `pdftohtml -xml`, the blocks and the notes that start on it.
 * `source` says where it came from, so a failing test can be traced to a page.
 */
export declare function pageFixture(source: string, xml: string, blocks: Block[], footnotes: Footnote[], volume: number, pdfIndex: number): {
    source: string;
    xml: string;
    blocks: Block[];
    footnotes: Footnote[];
};
