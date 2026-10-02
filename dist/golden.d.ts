import type { Block } from "./paragraphs.js";
import type { Footnote } from "./footnotes.js";
import type { OracleSignal, PageCounts } from "./oracle.js";
/**
 * Golden pages (quality-harness plan §3.2): a page's true structure, read off
 * the PDF page image by a person or an agent and recorded in the report repo's
 * `golden.yaml`, then checked against what the pipeline regenerates.
 *
 * An entry says, in reading order, which blocks START on the page (a
 * paragraph that runs over from the page before is not one of them), with
 * enough of each one's opening and ending to know it is whole, the footnote
 * numbers that are DEFINED on the page and the markers REFERENCED on it. The
 * oracle counts (headings missed, paragraphs oversplit, ...) are derived from
 * the same entry, so a page's truth is written once.
 *
 * A quotation is one block however many paragraphs it has: the pipeline keeps consecutive indented paragraphs
 * together as one `quote`, and quotations carry no paragraph ids, so a golden entry follows that convention.
 *
 * ```yaml
 * pages:
 *   - pdf: 42                  # page within its PDF
 *     volume: 1                # default 1
 *     printed: 34
 *     verified_by: "agent, 2026-10-02, against the page image"
 *     features: [D, F]         # catalogue classes the page is here to catch
 *     xfail: reportsthatmatter-xyz   # the pipeline is known to get this page wrong...
 *     xfail_only: [blocks, markers]  # ...in these assertions only; a failure in any other is a regression
 *     opens_with: "suffering from abdominal pain"  # page opens mid-paragraph (with continues_previous)
 *     continues_previous: true
 *     blocks:
 *       - heading: "3. The decision to take the UN route"
 *         level: 2
 *       - paragraph: {start: "The Inquiry heard", end: "in March 2003.", notes: [12, 13]}
 *       - quote: {start: "I am writing", end: "yours sincerely"}
 *       - list: {start: "(a) the first", end: "(c) the last", items: 3}
 *       - paragraph: {start: "It was then", continues: true}   # runs on to the next page
 *     footnotes: [12, 13]      # note numbers defined on this page
 *     markers: [12, 13]        # markers referenced on this page
 *     must_contain: ["abdominal pain, profuse diarrhoea"]   # one block holds this run
 *     must_read: ["lessons learned by the Challenger accident"]    # exact: a hyphen left in a word shows
 *     must_be_quote: ["I am entirely satisfied"]               # set as a block quotation in the source
 *     must_not_be_quote: ["vomiting for two days"]
 *     separate: ["CAP combat air patrol", "CAPPS Computer Assisted"]   # table rows: each its own block
 *     must_not_contain: ["Page 34 of 120"]                  # furniture that must not reach the text
 * ```
 */
export type GoldenBlock = {
    type: "heading" | "paragraph" | "quote" | "list";
    /** Heading: its full text. Others: how it opens. */
    start: string;
    /** How it ends; absent where the block runs over the page (`continues`). */
    end?: string;
    level?: number;
    continues?: boolean;
    /** Footnote numbers linked inside the block. Exact, unless the block `continues`. */
    notes?: number[];
    /** A list's item count. */
    items?: number;
};
export type GoldenPage = {
    pdf: number;
    volume: number;
    printed?: number | string;
    verified_by: string;
    features: string[];
    xfail?: string;
    /** With `xfail`: only these kinds of assertion are known to fail; any other that fails is a regression. Absent: any may. */
    xfail_only?: AssertionKind[];
    note?: string;
    continues_previous?: boolean;
    opens_with?: string;
    /** Absent: the page's blocks are not asserted (a table page checked by `must_contain` alone). */
    blocks?: GoldenBlock[];
    /** Without `blocks` (a page with a table): the headings that start here, in order, and no others. */
    headings?: string[];
    /** Absent: not asserted. `[]` asserts that none are defined (or referenced) here. */
    footnotes?: number[];
    markers?: number[];
    must_contain: string[];
    /** Exact reading (case, hyphens and spacing kept; quote style and note markers ignored) found in one block: for hyphenation and spacing defects. */
    must_read: string[];
    /** Each run is found, and no single block holds two of them: table rows or list entries that must stay apart. */
    separate: string[];
    /** Each run is inside a quotation block: what `quoteInset` and its kin exist to keep. */
    must_be_quote: string[];
    must_not_be_quote: string[];
    must_not_contain: string[];
};
export type Golden = {
    pages: GoldenPage[];
};
export declare function parseGolden(text: string): Golden;
/**
 * The pipeline's blocks with each text replaced by its final form (markers
 * linked as `[^N]`, hyphens rejoined, OCR fixed), from `IngestResult.linkedText`.
 * Without it the blocks are returned as they are. Use this wherever a block's
 * text is compared with the page: the raw blocks leave an endnotes report's
 * markers unlinked.
 */
export declare function finalBlocks(result: {
    blocks?: Block[];
    linkedText?: Array<string | undefined>;
}): Block[];
/** What a golden entry asserts, one kind per field: `xfail_only` names the kinds that are known to fail. */
export type AssertionKind = "blocks" | "headings" | "footnotes" | "markers" | "must_contain" | "must_read" | "separate" | "must_be_quote" | "must_not_be_quote" | "must_not_contain" | "opens";
export declare const ASSERTION_KINDS: AssertionKind[];
export type GoldenResult = {
    page: GoldenPage;
    problems: string[];
    /** The kinds of assertion that failed. */
    failing: AssertionKind[];
    /** What the page should read on each oracle signal, were the oracle perfect, given what the pipeline produced. */
    truth: Partial<PageCounts>;
    /** Produced blocks, for the failure message. */
    produced: Array<{
        kind: string;
        start: string;
        end: string;
    }>;
};
export declare function checkGoldenPage(page: GoldenPage, blocks: Block[], footnotes: Array<Pick<Footnote, "number"> & Partial<Pick<Footnote, "volume" | "pdfIndex">>>, 
/** `relink: false` when `blocks` come from `finalBlocks` and their markers are already the pipeline's own. */
options?: {
    relink?: boolean;
}): GoldenResult;
/** Precision and recall of the oracle on golden pages, one row per signal. */
export type SignalScore = {
    signal: OracleSignal;
    tp: number;
    fp: number;
    fn: number;
};
/**
 * Compares, page by page, what the oracle counted with what the page's entry
 * says is wrong. A count is matched one-for-one up to the smaller of the two:
 * `tp` is min(oracle, truth), `fp` what the oracle counted beyond the truth,
 * `fn` what the truth had that the oracle missed.
 */
export declare function scoreOracle(rows: Array<{
    oracle: PageCounts | undefined;
    truth: Partial<PageCounts>;
}>): SignalScore[];
