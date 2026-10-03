import type { Page } from "./extract.js";
import type { Suspect } from "./ocr.js";
import type { Block } from "./paragraphs.js";
/**
 * One block of a clean edition. Text is inline Markdown: `*emphasis*`,
 * `[^label]` note markers, and anything else escaped (`inlineMarkdown`).
 */
export type EditionBlock = ({
    kind: "heading";
    level: number;
    text: string;
} | {
    kind: "paragraph";
    text: string;
} | {
    kind: "quote";
    text: string;
} | {
    kind: "list";
    items: string[];
    quoted?: boolean;
} | {
    kind: "contents";
    text: string;
    page: string;
} | {
    kind: "table";
    rows: string[][];
    header: boolean;
}) & {
    /**
     * A figure, caption or box the edition sets where the PDF's page put it,
     * which may be mid-sentence. A paragraph that stops mid-sentence, then only
     * floats, then a paragraph, is served as one paragraph with the floats after
     * it (`assembleEdition`). The edition's own order is what is aligned.
     */
    float?: boolean;
};
export type EditionNote = {
    label: string;
    text: string;
};
export type Edition = {
    blocks: EditionBlock[];
    /** Notes in document order; every `[^label]` in the blocks must have one. */
    notes: EditionNote[];
};
export type EditionSource = {
    path: string;
    sha256: string;
};
/** `cleanEdition`: declares the edition a report's text and structure come from. */
export type EditionPass = {
    readonly name: "cleanEdition";
    readonly stage: "edition";
    readonly sources: readonly EditionSource[];
    /**
     * Where the PDF prints the edition's notes. `"back"` (the default): in the
     * body stream, as endnotes are (9/11). `"page-foot"`: under the paragraph
     * that cites them, which the PDF shadow lifts out of the text and holds
     * as its notes; the edition's notes are then aligned to those, not to the
     * body (Saville).
     */
    readonly notes: "back" | "page-foot";
    /** Reads and checks the edition's files and returns its blocks. */
    read(): Edition;
};
/**
 * Declares that this report's text and structure come from a clean edition,
 * and its PDF volumes only supply printed pages and the fidelity check.
 *
 * `dir` is the report repo (`import.meta.dirname` in its `ingest.ts`); each
 * file's SHA-256 is checked before it is read, as a volume's is. `read` is
 * the report's own adapter: what the edition's markup means is a property of
 * that source (see `htmlEvents` and `inlineMarkdown` for the pieces).
 */
export declare function cleanEdition(options: {
    dir: string;
    files: EditionSource[];
    encoding?: BufferEncoding;
    notes?: "back" | "page-foot";
    read(files: Array<{
        path: string;
        text: string;
    }>): Edition;
}): EditionPass;
export type InlinePiece = {
    text: string;
    em?: boolean;
    strong?: boolean;
} | {
    marker: string;
};
/** Escapes what Markdown would read as syntax inside running text. */
export declare function escapeInline(text: string): string;
/**
 * Pieces of running text → one line of inline Markdown: whitespace collapsed,
 * emphasis kept (`*…*`, with its edge spaces moved outside so Markdown still
 * reads it), note markers as `[^label]` closed up to the word before them.
 */
export declare function inlineMarkdown(pieces: InlinePiece[]): string;
/**
 * The same pieces as plain text, for notes: the renderer sets a note's text
 * as it stands (escaped HTML, no Markdown), so emphasis and escapes would
 * show as asterisks and backslashes. Markers are kept.
 */
export declare function inlineText(pieces: InlinePiece[]): string;
export type EditionReport = {
    sources: readonly EditionSource[];
    /** Edition words (body and notes) aligned to a PDF word. */
    editionWords: number;
    alignedWords: number;
    /** Edition words the PDF never prints, as a word or two adjacent words joined. */
    oov: number;
    oovExamples: string[];
    /** PDF words on the pages the edition covers that align to nothing in it. */
    pdfWords: number;
    pdfAligned: number;
    pages: {
        anchored: number;
        placedByNeighbour: number;
        frontMatterSkipped?: number;
    };
    dashesRestored: number;
    /** A space after punctuation the PDF prints and the edition omits ("Timeline,"Dec."). */
    spacesRestored: number;
    /** A line-end hyphen of the PDF the edition kept ("air-line's"), closed up where the edition prints the word whole elsewhere. */
    hyphensClosed: number;
    disagreements: {
        editionNotInPdf: number;
        pdfNotInEdition: number;
    };
};
/**
 * Pages the PDF ingest read no printed number off (a page of a figure, a page
 * whose header it did not read) that sit between two it did, with the numbers
 * in step with the PDF's own page order (printed 47 on PDF page 52, printed 50
 * on PDF page 55: 48 and 49 are the pages between). A gap whose numbers do not
 * run in step is left unmarked.
 */
export declare function fillPrintedGaps(printed: PrintedPage[]): PrintedPage[];
export type PrintedPage = {
    volume: number;
    pdfIndex: number;
    number: number | string;
    occurrence?: number;
};
/**
 * Builds a report from its clean edition, stamping printed pages and checking
 * fidelity against the PDF pages. `printed` is the PDF ingest's own reading of
 * which page carries which printed number (its `%%page%%` markers), so a page
 * the PDF pipeline would not mark is not marked here either.
 */
export declare function assembleEdition(edition: Edition, pages: Page[], printed: PrintedPage[], sources: readonly EditionSource[]): {
    body: string;
    notes: string;
    report: EditionReport;
    suspects: Suspect[];
    blocks: Block[];
    linkedText: string[];
    notePages: Array<number | undefined>;
};
