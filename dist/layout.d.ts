/**
 * The PDF's own line layout, from poppler's `pdftohtml -xml`: one record per
 * printed line with its position, font, size and colour.
 *
 * `pdftotext -layout` (what the pipeline reads) keeps only each line's text
 * and leading spaces. Whether a line is indented by an em or by two, whether
 * it reaches the right margin, whether its font changes across a page break:
 * those are in the PDF, not in the text. This module reads them, once per
 * PDF, and hands them to whatever wants them: the measure-only layout oracle
 * (`oracle.ts`), and passes that gate a decision on layout (a page-break join
 * that needs a first-line indent in ems, say).
 *
 * Nothing here changes any output. It is an input to passes that opt in.
 */
/** A small raised run of digits inside a body line: the shape of a footnote marker. */
export type RaisedRun = {
    text: string;
    size: number;
    left: number;
};
export type LayoutLine = {
    /** Which source volume, 1-based, in the order the report lists them. */
    volume: number;
    /** 1-based page within its own PDF; the same as `Page.pdfIndex`. */
    page: number;
    /** Position of the line in reading order within its page, 0-based. */
    index: number;
    pageWidth: number;
    pageHeight: number;
    top: number;
    left: number;
    width: number;
    height: number;
    right: number;
    text: string;
    /** Font family without its subset prefix ("ABCDEF+Times" is "Times"). */
    family: string;
    /** Size in points of the line's dominant fragment. */
    size: number;
    color: string;
    bold: boolean;
    italic: boolean;
    /** `family|size|color`, then `|b` and `|i` for a bold or italic line: the same key is the same face. */
    font: string;
    /** Whether the line is set in the document's body font (modal by characters). */
    body: boolean;
    /** Raised digit runs inside the line (footnote-marker shapes). */
    raised: RaisedRun[];
    /** The line opens on a label: "57." "(b)" "9.88" "•". */
    label: boolean;
    /**
     * `left` minus the page's body margin, in ems of this line's size. Negative
     * for an outdented first line (a hanging number); a line in a quotation
     * inset is positive on both sides.
     */
    indentEm: number;
    /** The page's right text edge minus this line's right edge, in ems. Near zero on a justified full line. */
    rightGapEm: number;
    /** `rightGapEm` < 0.5: the line runs to the right margin. */
    reachesRight: boolean;
};
export type PageLayout = {
    volume: number;
    page: number;
    width: number;
    height: number;
    /** Modal left of the page's longer body lines (rounded to 3 units). */
    left: number;
    /** The 90th-percentile right edge of those lines. */
    right: number;
    /** Modal distance between the tops of consecutive body lines. 0 when the page has too few to say. */
    pitch: number;
    /** The font this page's body is set in: the document's, unless another fills the page. */
    bodyFont: string;
    lines: LayoutLine[];
};
export type BodyFont = {
    key: string;
    family: string;
    size: number;
    color: string;
    characters: number;
};
/** What a pass or the oracle reads. Volumes and pages are 1-based, as on `Page`. */
export type Layout = {
    readonly volumes: number;
    /** One page's lines in reading order, or `[]` when the PDF has no such page. */
    lines(volume: number, page: number): LayoutLine[];
    page(volume: number, page: number): PageLayout | undefined;
    /** Page numbers of a volume, in order. */
    pages(volume: number): number[];
    /** The document's body font (modal fontspec by character count over all volumes). */
    readonly bodyFont: BodyFont;
    /** SHA-256 of each volume's PDF, which keys its cache file. */
    readonly checksums: string[];
};
type RawLine = Omit<LayoutLine, "volume" | "body" | "indentEm" | "rightGapEm" | "reachesRight" | "label" | "index">;
/** Parses one `pdftohtml -xml` document into raw lines (no per-page statistics yet). */
export declare function parseLayoutXml(xml: string): RawLine[];
/** Adds the per-page statistics and the em-normalised fields. Pure; the test seam. */
export declare function buildLayout(volumes: RawLine[][], checksums?: string[]): Layout;
/**
 * The em-normalised first-line indent of `line` relative to the line under
 * it: positive when `line` starts to the right of `next`, negative when it is
 * outdented (a hanging number). The layout gate of a page-break join.
 */
export declare function indentVersus(line: LayoutLine, next: LayoutLine): number;
/**
 * The `pdftohtml -xml` of one PDF, cached at `<cacheDir>/layout-<sha256>.xml`.
 * `-hidden` keeps the invisible OCR text layer of a scanned PDF, which `pdftotext` (and so the
 * pipeline) reads and `pdftohtml` otherwise drops. The cache is rebuilt when the poppler that wrote it is not the installed
 * one. `cacheDir` is `<report-repo>/.cache`; a `.gitignore` of `*` is written
 * inside it, so no report repo has to ignore it.
 */
export declare function layoutXml(pdf: string, cacheDir: string, checksum?: string): string;
/**
 * Opens the line layout of a report's PDFs, in the order its definition lists
 * them (a multi-volume report is one document; `volume` is 1-based). Reads
 * and parses lazily, so a pass that never asks for a layout costs nothing.
 */
export declare function openLayout(pdfs: string[], cacheDir: string): Layout;
export {};
