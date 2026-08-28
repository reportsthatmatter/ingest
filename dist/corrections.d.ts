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
/**
 * A suspect looked at and judged correct as it stands.
 *
 * The review queue is a list of places the scanner probably got wrong. Half
 * the answers are "fix it", which is a correction; the other half are "I
 * checked this against the scan and it is right", and until now those had
 * nowhere to go — so the same entries reappeared on every run and the queue
 * never shrank. That is why nobody reviewed it (#105).
 */
export type Dismissal = {
    /** The suspect text, exactly as the queue lists it. */
    match: string;
    reason?: string;
    added?: string;
};
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
/**
 * The suspects a reviewer has judged correct, so the queue stops listing them.
 *
 * Deliberately keyed on the suspect text rather than a position: the queue is
 * regenerated from scratch on every ingest, and a line number would go stale
 * the moment anything above it moved.
 */
export declare function parseDismissals(yamlText: string, reportId: string): Dismissal[];
