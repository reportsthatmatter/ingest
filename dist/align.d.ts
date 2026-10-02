/**
 * Monotone word alignment of two token streams (ours and a reference edition).
 *
 * 1. Anchors: n-grams (default 7 words) that occur exactly once in each stream.
 * 2. Skeleton: the longest increasing subsequence of the anchors, ordered by
 *    our position, increasing in the reference position (a patience-diff
 *    skeleton): repeated boilerplate and moved text cannot pull the alignment
 *    out of order, which is what defeated first-anchor matching on Philip
 *    Morris (reference-editions.md §3.3).
 * 3. Gaps between skeleton runs: equal prefixes and suffixes, then an exact
 *    LCS when the gap is small enough, then words split or joined across the
 *    two ("tue sday" / "tuesday", "transmis sion" / "transmission").
 *    A gap whose LCS covers under a quarter of its longer side is left
 *    unaligned: that is a different text (a version difference, a missing
 *    stretch), not the same text with errors, and matching its stray "the"s
 *    would invent boundaries.
 *
 * Prototyped in the site repo's docs/design/reference-editions/tools/pbound2.py;
 * promoted here from its scorer (src/lib/score/align.ts) so the hybrid source
 * mode (edition.ts) stamps pages with the same aligner the scorer measures with.
 */
export type Alignment = {
    /** For each token of `a`, the index of its token in `b`, or -1. */
    map: Int32Array;
    /** For each token of `b`, the index of its token in `a`, or -1. */
    inv: Int32Array;
    anchors: number;
};
export type AlignOptions = {
    n?: number;
    maxCells?: number;
    minGapSimilarity?: number;
};
export declare function align(aWords: string[], bWords: string[], opts?: AlignOptions): Alignment;
