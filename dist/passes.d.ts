import { takePrintedNumber, splitFootnoteBlock, type SplitPage } from "./clean";
import { bodyIndent } from "./paragraphs";
/**
 * A pass is one named decision about how to read a source.
 *
 * Passes select among implemented, tested behaviours. **A pass never takes a
 * regex or a pattern**: the moment a report's definition can express a
 * pattern it has become a second parser with no tests of its own. A report
 * that genuinely needs something bespoke writes its own pass inline — and
 * when a third report needs the same one, it moves in here.
 */
/** Runs once per page, before the document is assembled. */
export type PagePass = {
    readonly name: string;
    readonly stage: "page";
};
/** Rewrites one page's body lines, after its furniture has been taken off. */
export type BodyPass = {
    readonly name: string;
    readonly stage: "body";
    run(lines: string[]): string[];
};
/** Runs over one volume's pages together. */
export type VolumePass = {
    readonly name: string;
    readonly stage: "volume";
    run(pages: SplitPage[]): SplitPage[];
};
/** Decides the document geometry the block parser measures against. */
export type GeometryPass = {
    readonly name: string;
    readonly stage: "geometry";
    readonly scope: "per-volume" | "document";
};
/** Declares how far a quotation is inset from the body in this document. */
export type QuoteInsetPass = {
    readonly name: "quoteInset";
    readonly stage: "quoteInset";
    readonly columns: number;
};
export type Pass = PagePass | BodyPass | VolumePass | GeometryPass | QuoteInsetPass;
/**
 * Takes the printed page number off each page. These documents are cited by
 * page ("Report at 62"), so the printed number is the citation unit readers
 * already use, and it can be checked against the original PDF.
 */
export declare const printedPageNumber: () => PagePass;
/**
 * Links footnote markers that OCR fused to the preceding word (#103).
 *
 * Opt-in, and it must stay that way. It is safe only where a note number
 * identifies one note: Leveson restarts its numbering per chapter, so "20"
 * names a different note in every one of them, and linking every fused "20"
 * pointed 54 references at a single note. Where numbering is not unique
 * across the document, a bare number is the honest output.
 */
export declare const flushFootnoteMarkers: () => PagePass;
/** Separates the footnote block at the foot of each page from the body. */
export declare const footnoteBlock: () => PagePass;
/**
 * Removes running headers and footers that recur at a page edge.
 *
 * PDF text extraction cannot distinguish these from the body, but their
 * repeated position can: a real line of prose should not appear at the top or
 * bottom of three distinct pages. Opt in — a report whose furniture does not
 * repeat gets nothing from this, and a short report could lose a real
 * repeated line to it.
 */
export declare const runningFurniture: () => VolumePass;
/**
 * Reads a two-column page column by column rather than line by line.
 *
 * `pdftotext -layout` puts both columns on the same physical line, so without
 * this an unrelated sentence is welded into the middle of every paragraph —
 * unreadable, and invisible to the fidelity checks, which count words rather
 * than order them.
 *
 * Opt-in, and per page: a report declares it, and each page is judged on its
 * own, because front matter and appendices are routinely single-column in an
 * otherwise two-column document. Pages with no detectable gutter are left
 * untouched.
 *
 * A caveat worth knowing: a wide two-column *table* looks much like
 * two-column prose, and this will split one. That is why it is opt-in rather
 * than a universal heuristic.
 */
export declare const columns: () => BodyPass;
/**
 * How far past the body margin a quotation sits in this document.
 *
 * The default of five suits a document that insets its quotations generously.
 * Litvinenko does not — body at 7, quotations at 10 — and at five every one of
 * its quotations reads as ordinary prose. Lowering it globally is not the
 * answer: at three, Challenger turns 442 paragraphs into quotations.
 *
 * It is a fact about the document's typography, which is exactly the kind of
 * thing a report declares rather than the parser guesses.
 */
export declare const quoteInset: (columns: number) => QuoteInsetPass;
/**
 * Where the left margin is measured.
 *
 * `document` treats the whole report as one typesetting run. `per-volume`
 * measures each source volume separately, which is what a multi-volume report
 * needs: each PDF's furniture and typesetting may differ, and one global
 * margin is not meaningful across all of them. Getting this wrong turns
 * ordinary continuation lines into block quotes.
 *
 * This replaced a `pageGroups.length > 1` test — a property of the document
 * inferred from how many arguments were typed on the command line.
 */
export declare const geometry: (scope: "per-volume" | "document") => GeometryPass;
/** Re-exported so a report can compose the page-local passes directly. */
export { takePrintedNumber, splitFootnoteBlock, bodyIndent };
