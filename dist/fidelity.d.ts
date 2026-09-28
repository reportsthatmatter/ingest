/**
 * Fidelity checks for an ingested report.
 *
 * Layers 1-3 are gates: structural invariants, lossless content, and word-count
 * deltas. They answer "did the pipeline silently destroy something?", which is
 * decidable. They deliberately do not try to answer "is this faithful to the
 * source?", which is not.
 */
export type Check = {
    name: string;
    ok: boolean;
    detail: string;
};
export declare function structuralChecks(markdown: string): Check[];
/**
 * Layer 2: every word of the output must exist in the source. Catches the
 * failure mode that matters most — silently inventing or mangling text — while
 * tolerating the reordering that lifting footnotes necessarily causes.
 */
export declare function losslessCheck(sourceText: string, markdown: string, extraVocabulary?: string[]): Check;
export declare function digitDensityCheck(sourceText: string): Check;
/** Layer 3: the output must not have lost a meaningful share of the source. */
export declare function retentionCheck(sourceText: string, markdown: string): Check;
export declare function severedSentenceCheck(markdown: string): Check;
/**
 * One sentence broken across a page break (reportsthatmatter-ca3, -kb4).
 *
 * - `paragraph`: the continuation opens a new paragraph in lower case.
 * - `quote`: the continuation was set as a block quotation opening in lower
 *   case — a skewed scan insets a page's first lines.
 * - `skewQuote`: a page-opening quotation that does not finish its sentence
 *   and runs straight into a lower-case paragraph: the sentence above,
 *   carried on through the inset lines and out the other side.
 * - `capitalised`: the continuation opens on a capital. Often a name ("Mr." /
 *   "Trump") or a proper noun, but just as often a new paragraph after a
 *   heading-less break, so it is counted, never joined (reportsthatmatter-q0m).
 */
export type PageBreakSplit = {
    kind: "paragraph" | "quote" | "skewQuote" | "capitalised";
    before: string;
    after: string;
};
/**
 * Every place a paragraph stops mid-sentence at the foot of a page and the
 * next page carries the rest of the sentence as a separate block.
 *
 * `severedSentenceCheck` looks only at the block immediately after a
 * paragraph, so a page marker between the halves hides the split from it, and
 * it counts quotations only. This is the measure the `pageBreakContinuations`
 * pass is judged by: the count across a report before and after.
 */
export declare function pageBreakSplits(markdown: string): PageBreakSplit[];
export declare function runChecks(sourceText: string, markdown: string, extraVocabulary?: string[]): Check[];
