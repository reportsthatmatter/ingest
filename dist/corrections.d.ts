import type { Block } from "./paragraphs";
/**
 * A human judgement about this document's text, expressed as data.
 *
 * Corrections are the things the pipeline cannot decide: an OCR repair checked
 * against the scan, a word the extractor mangled beyond any rule's reach.
 * They are applied deterministically as a final pass, so re-running still
 * reproduces the same output and the fidelity checks still see everything.
 *
 * **A correction describes the text. A pass describes how to read the source.**
 * If you are writing a correction to undo something the parser did, you needed
 * a different pass or a bug fix.
 */
export type Correction = {
    id: string;
    /** Narrows the correction to one page. Omit to search the whole document. */
    where?: {
        volume?: number;
        printed?: number;
    };
    find: string;
    replace: string;
    reason?: string;
    added?: string;
};
export declare function parseCorrections(yamlText: string, reportId: string): Correction[];
/**
 * Applies corrections to the parsed blocks.
 *
 * **Every correction must match exactly once.** Zero matches or more than one
 * fails the build, naming the id. A stale correction is a loud error and never
 * a silent skip — that is what keeps the output reproducible while the parser
 * underneath it changes, and what stops a correction from quietly rotting into
 * a lie about what was reviewed.
 */
export declare function applyCorrections(blocks: Block[], corrections: Correction[], reportId: string): {
    blocks: Block[];
    applied: number;
};
/** Words a correction introduces, so the lossless check does not call them invented. */
export declare function correctionVocabulary(corrections: Correction[]): string[];
