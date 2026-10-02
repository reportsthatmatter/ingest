/**
 * Fidelity checks for an ingested report.
 *
 * Layers 1-3 are gates: structural invariants, lossless content, and word-count
 * deltas. They answer "did the pipeline silently destroy something?", which is
 * decidable. They deliberately do not try to answer "is this faithful to the
 * source?", which is not.
 */
/**
 * `info` checks are measurements, not gates: `ok` is always true and the CLI
 * prints them without a pass/fail mark. Their gate, where there is one, is the
 * site's per-report budget (`pnpm quality check`, reports/quality-budget.yaml).
 */
export type Check = {
    name: string;
    ok: boolean;
    detail: string;
    info?: boolean;
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
/**
 * Layers 1-3 together.
 *
 * `sourceText` must be the text extracted from the source PDF. Passing the
 * markdown itself makes layers 2 and 3 tautologies that report 100% for any
 * input — which is exactly what `ingest verify` silently did for every report
 * until #118, because no report had a `source.pdf` to compare against.
 */
/**
 * Layer 4: are sentences intact?
 *
 * Layers 2 and 3 count words. They cannot see a paragraph severed in the
 * middle and its tail relabelled as a quotation — the words are all still
 * there, in the same document, in the wrong order and the wrong voice. That
 * is how 865 of Litvinenko's 1,089 paragraphs shipped cut in half
 * (uk-litvinenko-inquiry#1), passing every gate.
 *
 * The signature is precise: a paragraph that stops without terminal
 * punctuation, immediately followed by a block quote that opens on a
 * lower-case word — the rest of the same sentence, wearing quotation marks it
 * never had. A genuine quotation is introduced ("as follows:") or opens with
 * a quotation mark, so neither is counted.
 *
 * Measured over the corpus: the broken report scored 0.47, and every report
 * as published scores between 0.0004 and 0.07.
 */
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
