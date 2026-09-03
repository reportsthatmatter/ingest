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
/** Layer 3: the output must not have lost a meaningful share of the source. */
export declare function retentionCheck(sourceText: string, markdown: string): Check;
export declare function severedSentenceCheck(markdown: string): Check;
export declare function runChecks(sourceText: string, markdown: string, extraVocabulary?: string[]): Check[];
