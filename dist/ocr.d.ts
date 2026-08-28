/**
 * OCR-suspect detection.
 *
 * This produces a ranked review queue, not a pass/fail gate. Whether text is
 * faithful to the source is finally a human judgement, and a threshold would
 * only disguise that. What we can do honestly is surface every place the
 * scanner probably got it wrong, with a page reference, and auto-fix only the
 * patterns that have no legitimate reading.
 */
export type Suspect = {
    pattern: string;
    match: string;
    context: string;
    page: number;
    volume?: number;
    pdfIndex?: number;
    confidence: "certain" | "likely" | "possible";
};
export declare function autoFix(text: string): {
    text: string;
    applied: number;
};
export declare function findSuspects(text: string, page: number): Suspect[];
export declare function rankSuspects(suspects: Suspect[]): Suspect[];
