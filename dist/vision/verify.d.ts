import { type VisionBlock } from "./doctags.js";
export type VerifiedBlock = {
    type: VisionBlock["type"];
    level?: number;
    /** the layer's words for this block's span (original characters, whitespace collapsed) */
    text: string;
    /** the model's text for the block */
    visionText: string;
    /** accepted: the model's structure is used for this span */
    accepted: boolean;
    /** share of the model's words that are the layer's words (exact, in order) */
    agreement: number;
    /** longest run of the model's words with no counterpart in the layer */
    maxRun: number;
    label?: string;
    /** index into the model's non-furniture blocks (absent for a stretch the model dropped) */
    src?: number;
    /** share of the span's layer words set in the footnote size (when the layout was given) */
    noteShare?: number;
    /** a short block vouched for by its neighbours and the size of the gap between them, not by its own words (the layer garbled them) */
    anchored?: boolean;
    /** the model's tag was overruled by the layout: "paragraph>footnote" */
    retyped?: string;
    /** layer token range [lo, hi) */
    span: [number, number];
    /** markers, placed at the layer token (index into the layer's tokens) they sit on */
    markers: {
        label: string;
        token: number;
        garbled?: boolean;
    }[];
    /** why a block was not accepted */
    reason?: string;
};
export type VerifiedPage = {
    status: "accepted" | "partial" | "flagged";
    layerWords: number;
    visionWords: number;
    /** layer words with an equal word in the model's output / all layer words (furniture at the page's ends excluded) */
    coverage: number;
    /** runs of 4+ layer words inside the page's span that the model's output lacks (a dropped line) */
    missing: {
        at: number;
        words: string;
        length: number;
    }[];
    /** blocks of the model's output in layer order, accepted or not; layer stretches the model dropped appear as type "other", accepted false */
    blocks: VerifiedBlock[];
    flags: string[];
};
export type VerifyOptions = {
    /** a block is accepted at this share of its words matching (default 0.9) */
    minAgreement?: number;
    /** ... and no run of unmatched words longer than this (default 4) */
    maxRun?: number;
    /** runs of missing layer words this long or longer are a dropped line (default 4) */
    missingRun?: number;
    /** unmatched layer words at the very start or end of the page this short are page furniture (default 6) */
    furniture?: number;
    /** character ranges [start, end) of `layerText` that are footnote lines in the layout (size below 0.9 of the page's body) */
    noteRanges?: [number, number][];
};
export declare function verifyPage(vision: VisionBlock[], layerText: string, opts?: VerifyOptions): VerifiedPage;
/**
 * The layout as a second, independent witness for one structural claim the words cannot check: which
 * blocks are footnotes. The model tags notes inconsistently (on Jack Smith p13 it left four notes as
 * ordinary text), but the layout knows which lines are set in the note size. A block whose layer words
 * are 70% or more note-size lines becomes a footnote, a "footnote" under 30% becomes body text; the
 * markers are found again with the corrected labels and the page is verified once more.
 */
export declare function verifyWithLayout(visionIn: VisionBlock[], lines: {
    text: string;
    note?: boolean;
}[], opts?: VerifyOptions): VerifiedPage & {
    layerText: string;
};
/**
 * Words the typesetter broke across a line ("technologi-" / "cal") are whole again before the check, by
 * the pipeline's own rule (`rejoinHyphenated`, decided from the document's vocabulary), so a line-end
 * hyphen is not counted as a word the model got wrong. The joined word moves to the first line; the lines
 * keep their order and their note flags.
 */
export declare function rejoinLineHyphens<T extends {
    text: string;
}>(lines: T[], vocab: Set<string>): T[];
