import type { IngestResult } from "./pipeline.js";
/**
 * A digest of one report's output.
 *
 * Small enough to commit and to read in a diff, detailed enough that any
 * heuristic change which moves a report's structure moves the digest. This is
 * the corpus regression signal the pipeline had none of: `AGENTS.md` asks that
 * every heuristic be tested against the messiest source in the corpus, and
 * until now that was a human instruction rather than a check. The Leveson fix
 * changed three other reports without anyone noticing (#118 §1.7); this is
 * what would have caught it.
 */
export type Baseline = {
    markdownSha: string;
    words: number;
    blocks: Record<string, number>;
    headings: string[];
    footnotes: number;
    pageMarkers: number;
    poppler: string;
};
export declare function computeBaseline(result: IngestResult, poppler: string): Baseline;
/** Human-readable differences, most structural first. Empty when identical. */
export declare function diffBaselines(before: Baseline, after: Baseline): string[];
