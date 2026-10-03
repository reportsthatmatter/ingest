import { type PageBreakCase, type PageBreakReferee } from "./pagebreaks.js";
/**
 * An LLM referee for the page breaks the layout rules cannot settle
 * (reportsthatmatter-38s.11, from the 38s.8 pilot).
 *
 * `layoutPageJoins` marks a decision `ambiguous` when it rests on a
 * threshold it is close to (an indent within a quarter em of flush), on R2
 * (a full stop at the foot of a full justified line), on a line under the
 * first line that is not the block's own, or on a short last line. Those,
 * and only those, are put to a referee.
 *
 * The build never calls out. A referee's answers live in a committed cache in
 * the report's repo (`referee/pagebreaks.json`), keyed by `PageBreakCase.key`
 * (a hash of the two printed lines), and `pageBreakCache` turns that file into
 * the deterministic `PageBreakReferee` the pass reads. A break with no entry
 * keeps the rules' call, so a report with no cache, or a cache that has
 * fallen behind its text, builds exactly as it would without a referee.
 *
 * Filling the cache is a separate, offline step (the site's `pnpm ingest
 * referee <id>`): run the pipeline once with the cache, collect the ambiguous
 * cases it was asked (`CachedReferee.asked`), send the unanswered ones to a
 * model (`refereePageBreaks`, through a transport the host supplies: this
 * library has no network code and no SDK dependency), and write the answers
 * back (`writePageBreakCache`).
 */
/** One answer in the cache. Only `join` is read by the build; the rest is for a reader of the diff. */
export type RefereeEntry = {
    join: boolean;
    /** Who decided: a model id, or "human" for a hand correction. */
    by: string;
    /** `REFEREE_PROMPT_ID` at the time, so answers from an older prompt can be found and re-asked. */
    prompt: string;
    /** The new page (PDF page, 1-based, in its volume). */
    page: number;
    volume?: number;
    /** The old page's last printed line and the new page's first, as the layout read them. */
    prev: string;
    next: string;
    /** What the rules said, and which rule. */
    rules: "join" | "split";
    rule: string;
};
export type PageBreakCacheFile = {
    /** What this file is, for someone who opens it cold. */
    about: string;
    version: 1;
    entries: Record<string, RefereeEntry>;
};
/** The deterministic referee a report declares, plus what a run asked it. */
export type CachedReferee = PageBreakReferee & {
    readonly path: string;
    readonly entries: Map<string, RefereeEntry>;
    /** Every case the pipeline put to it in this process, by key (answered or not). */
    readonly asked: Map<string, PageBreakCase>;
    readonly cached: true;
};
/** Reads a cache file; a missing file is an empty cache. */
export declare function readPageBreakCache(path: string | URL): Map<string, RefereeEntry>;
/** Writes a cache file: keys sorted, one entry per few lines, so a diff reads as the answers that changed. */
export declare function writePageBreakCache(path: string | URL, entries: Map<string, RefereeEntry>): void;
/**
 * The referee a report declares in its `ingest.ts`:
 *
 *     layoutPageJoins({ referee: pageBreakCache(new URL("./referee/pagebreaks.json", import.meta.url)) })
 *
 * Reads the file once, now; answers from it and nothing else. A missing file
 * is an empty cache (every break keeps the rules' call).
 */
export declare function pageBreakCache(path: string | URL): CachedReferee;
export declare function isCachedReferee(referee: unknown): referee is CachedReferee;
/** A cache entry for a case and an answer. */
export declare function refereeEntry(c: PageBreakCase, join: boolean, by: string, prompt?: string): RefereeEntry;
/**
 * What the referee is told. The pilot's one bias (it said JOIN for a new
 * bullet, numbered paragraph, contents entry or heading) is named here; the
 * context is our own blocks and the layout's lines, not `pdftotext -layout`,
 * whose two-column pages interleave.
 */
export declare const REFEREE_SYSTEM: string;
/** Changes whenever the prompt or the examples change; recorded with every answer. */
export declare const REFEREE_PROMPT_ID: string;
/**
 * One case as the referee reads it: our two blocks either side of the break
 * (the paragraph's end, the block's start) and the printed lines around it.
 */
export declare function describeCase(c: PageBreakCase): string;
/** A Messages API request body, kept structural so this library needs no SDK. */
export type RefereeRequest = {
    model: string;
    max_tokens: number;
    system: Array<{
        type: "text";
        text: string;
        cache_control?: {
            type: "ephemeral";
        };
    }>;
    messages: Array<{
        role: "user";
        content: Array<RefereeContent>;
    }>;
    output_config: {
        format: {
            type: "json_schema";
            schema: Record<string, unknown>;
        };
    };
};
export type RefereeContent = {
    type: "text";
    text: string;
} | {
    type: "image";
    source: {
        type: "base64";
        media_type: "image/png";
        data: string;
    };
};
export type RefereeUsage = {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
};
/** Sends one request and returns the response's text and usage. The host supplies it (the Anthropic SDK, or a recorded fake). */
export type RefereeTransport = (request: RefereeRequest) => Promise<{
    text: string;
    usage: Partial<RefereeUsage>;
}>;
export type RefereeOptions = {
    model: string;
    /** Cases per request (the system prompt and examples are shared, and cached). Default 20. */
    batch?: number;
    /** Optional image blocks for a case (crops of the two page edges). */
    images?: (c: PageBreakCase) => RefereeContent[] | undefined;
};
/** The requests for a set of cases: one per batch, case ids "c1"… within it. */
export declare function refereeRequests(cases: PageBreakCase[], options: RefereeOptions): Array<{
    ids: Map<string, PageBreakCase>;
    request: RefereeRequest;
}>;
/** The answers in a response's text, by case id. Tolerates prose around the JSON. */
export declare function parseRefereeAnswers(text: string): Map<string, boolean>;
export type RefereeRun = {
    entries: Map<string, RefereeEntry>;
    usage: RefereeUsage;
    calls: number;
    /** Keys of cases the model gave no usable answer for (they stay with the rules). */
    unanswered: string[];
};
/** Puts cases to the referee through a transport, a batch at a time, and returns cache entries. */
export declare function refereePageBreaks(cases: PageBreakCase[], transport: RefereeTransport, options: RefereeOptions): Promise<RefereeRun>;
/** List prices, US$ per million tokens: input, output, cache write (5 min), cache read. */
export declare const REFEREE_PRICES: Record<string, {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
}>;
/** What a run cost at list price, in US$ (undefined for a model with no price here). */
export declare function refereeCost(model: string, usage: RefereeUsage): number | undefined;
/**
 * Responses recorded against the exact request that produced them, so a test
 * or a dry run can replay a referee with no network and no key. A request
 * that differs by a byte (a prompt change, another model, another batch) has
 * no recording, and replaying it throws: re-record.
 */
export type RefereeRecording = {
    about: string;
    version: 1;
    exchanges: Record<string, {
        model: string;
        cases: number;
        response: {
            text: string;
            usage: Partial<RefereeUsage>;
        };
    }>;
};
/** The key a request is recorded under. */
export declare function requestHash(request: RefereeRequest): string;
/** Replays recorded responses; throws on a request that was never recorded. */
export declare function replayTransport(path: string | URL): RefereeTransport;
/** Passes requests to `inner` and records each response in `path`. */
export declare function recordingTransport(inner: RefereeTransport, path: string | URL): RefereeTransport;
