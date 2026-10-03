import { type Block, type Provenance } from "../paragraphs.js";
import type { Footnote } from "../footnotes.js";
import type { Layout, LayoutLine } from "../layout.js";
export type VisionSource = {
    path: string;
    sha256: string;
};
export type VisionOptions = {
    /** Share of a page's verified blocks that must be accepted (default 0.8). */
    minAccepted: number;
    /** The verifier's setting: lenient (75%, a run of 8; default) or strict (90%, 4). */
    strict: boolean;
    /** Refuse a page where the model has fewer paragraph starts than the pipeline (default false: see the PR). */
    keepStarts: boolean;
    /** Mark a model paragraph as a quotation where the pipeline read the same words as one (default true). */
    quotesFromPipeline: boolean;
};
export type VisionStructurePass = {
    readonly name: "visionStructure";
    readonly stage: "vision";
    readonly source: VisionSource;
    readonly volume: number;
    readonly options: VisionOptions;
    /** Reads and checks the committed output: DocTags per PDF page. */
    read(): Map<number, string>;
};
/**
 * Declares that this report takes block structure from a vision model's
 * committed reading of its page images, page by page, behind the gate above.
 *
 * `dir` is the report repo (`import.meta.dirname`); `pack` the gzipped JSON
 * lines `scripts/vision/run.py --manifest` writes (`{page, meta, doctags}` a
 * line), checksummed as a volume is. Each page's DocTags is also checked
 * against the hash its line records. Single volume (`volume`, default 1).
 */
export declare function visionStructure(options: {
    dir: string;
    pack: VisionSource;
    volume?: number;
    minAccepted?: number;
    strict?: boolean;
    keepStarts?: boolean;
    quotesFromPipeline?: boolean;
}): VisionStructurePass;
/** The pack's lines → DocTags by PDF page, each checked against its recorded hash. */
export declare function readPack(jsonl: string): Map<number, string>;
export type VisionNote = {
    label: string;
    number: number;
    text: string;
};
export type VisionPageRecord = {
    volume: number;
    pdfIndex: number;
    printed: number | null;
    source: "vision" | "pipeline";
    /** Why the pipeline's blocks were kept (absent when the vision structure was used). */
    reason?: string;
    blocks: number;
    accepted: number;
    /** Paragraph starts (paragraphs, quotes, list items, headings) each reading has on the page. */
    starts: {
        vision: number;
        pipeline: number;
    };
    notes: {
        vision: number;
        pipeline: number;
    };
    words: number;
};
export type VisionPageResult = {
    record: VisionPageRecord;
    /** The page's blocks, when the vision structure was used. */
    blocks?: Block[];
    notes?: VisionNote[];
};
/**
 * What one page becomes. `body` and `footLines` are the pipeline's lines for
 * the page (after furniture and body passes; `footLines` the page-foot notes
 * it split off), `pipeline` its blocks and `pipelineNotes` the notes it read
 * there; `corrections` the text every correction of the report finds; `noteFlags` (optional, from the layout) says which body lines are
 * set in the note size.
 */
export declare function visionPage(input: {
    doctags: string | undefined;
    body: string[];
    footLines: string[];
    noteFlags?: boolean[];
    pipeline: Block[];
    pipelineNotes: string[];
    corrections?: string[];
    at: Provenance;
    vocab: Set<string>;
    options: VisionOptions;
}): VisionPageResult;
/**
 * Whether a block the model tagged as a heading reads as one: it has a letter, and it does not end as a
 * sentence or a lead-in does ("Mr. Mulloy testified:", "And,", "(See appendix V-H.)"). The model tags such
 * short lines as headings; they are the paragraph's own text.
 */
export declare function headingLike(text: string): boolean;
/**
 * A note's label and text. The label is the model's: it reads note numbers off the page image far better
 * than this scan's text layer does ("0 bid." for 10 Ibid., "45 bid." for 43), and a label is structure, not
 * prose. The layer's text loses its opening digits only where they are that label, spaced or not ("4 1
 * Ibid." for 41); otherwise it stands whole ("g Ibid." for 9): a misread label is the layer's word, and
 * only a human can say it is not one.
 */
export declare function noteOpening(raw: string, modelLabel: string): {
    label: string;
    text: string;
} | undefined;
/**
 * Which of a page's pipeline lines are set in the note size, by the layout:
 * the trailing run of lines (a short page number aside) at 0.88 of the body
 * size or less, as the site's verifier reads them; a pipeline line is a note
 * line when most of its words are among theirs.
 */
export declare function noteFlagsFromLayout(lines: string[], layoutLines: LayoutLine[], bodySize: number): boolean[];
/** The body size the note test measures against: the largest size carrying 15% or more of the document's characters. */
export declare function layoutBodySize(layout: Layout, volume: number): number;
export type VisionReport = {
    source: VisionSource;
    options: VisionOptions;
    pages: VisionPageRecord[];
    /** Page breaks between a vision page and a pipeline page (either way), and how many of them the page-break joins closed. */
    boundaries: {
        total: number;
        joined: number;
        examples: string[];
    };
};
/**
 * The pass's state across one ingest: the pipeline calls `page` once per page
 * with its own reading, `footnotes` once the pages are read, `joins` after the
 * page-break joins, and `report` at the end.
 */
export declare class VisionHybrid {
    private readonly pass;
    private readonly vocabulary;
    private readonly layout?;
    private readonly corrections;
    private readonly pages;
    private readonly records;
    private readonly notesByPage;
    /** The first block of each page whose source differs from the page before's, for the join count. */
    private readonly boundaryHeads;
    private bodySize;
    private vocab;
    private lastSource;
    constructor(pass: VisionStructurePass, vocabulary: () => Set<string>, layout?: Layout | undefined, corrections?: string[]);
    /** The blocks to use for one page: the pipeline's, or the vision structure's when the page passes the gate. */
    page(input: {
        volume: number;
        pdfIndex: number;
        body: string[];
        footLines: string[];
        blocks: Block[];
        at: Provenance;
        pipelineNotes: string[];
    }): Block[];
    /**
     * The report's notes with each vision page's replaced by the vision reading's,
     * in page order. A note's tail that ran over onto the next page (`runOvers`,
     * appended to the page's last note by the pipeline) goes to the vision
     * reading's last note on that page, or to the note before the page.
     */
    footnotes(notes: Footnote[], runOvers: Map<Footnote, string>): Footnote[];
    /** Counts the page breaks between sources that the joins closed (`joined` is `mergeAcrossPages`'s output). */
    joins(joined: Block[]): VisionReport["boundaries"];
    report(boundaries: VisionReport["boundaries"]): VisionReport;
}
/**
 * The provenance a report repo keeps beside its `full.md` (`reference/vision/hybrid.{md,json}`, written by
 * the site's `pnpm ingest run`): which source every page's and every block's structure came from, why each
 * pipeline page was not given the vision reading, and the joins across the boundaries between the two.
 */
export declare function renderVisionReport(report: VisionReport, blocks?: Block[]): {
    markdown: string;
    json: string;
};
