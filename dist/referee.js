import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isJustified } from "./pagebreaks.js";
import { REFEREE_EXAMPLES } from "./referee-examples.js";
const ABOUT = "LLM referee answers for page breaks the layout rules could not settle (@rtm/ingest layoutPageJoins, reportsthatmatter-38s.11). " +
    "Keyed by a hash of the two printed lines; ingest reads `join` and nothing else. Written by `pnpm ingest referee <id>`; " +
    "a wrong answer may be corrected by hand (set `join`, and `by: human`).";
function pathOf(path) {
    return typeof path === "string" ? path : fileURLToPath(path);
}
/** Reads a cache file; a missing file is an empty cache. */
export function readPageBreakCache(path) {
    const file = pathOf(path);
    if (!existsSync(file))
        return new Map();
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed.version !== 1 || typeof parsed.entries !== "object" || parsed.entries === null) {
        throw new Error(`${file}: not a page-break referee cache (version 1)`);
    }
    const entries = new Map();
    for (const [key, entry] of Object.entries(parsed.entries)) {
        if (typeof entry?.join !== "boolean")
            throw new Error(`${file}: entry ${key} has no boolean "join"`);
        entries.set(key, entry);
    }
    return entries;
}
/** Writes a cache file: keys sorted, one entry per few lines, so a diff reads as the answers that changed. */
export function writePageBreakCache(path, entries) {
    const file = pathOf(path);
    const sorted = {};
    for (const key of [...entries.keys()].sort()) {
        const e = entries.get(key);
        sorted[key] = {
            join: e.join,
            by: e.by,
            prompt: e.prompt,
            page: e.page,
            ...(e.volume !== undefined && e.volume !== 1 ? { volume: e.volume } : {}),
            prev: e.prev,
            next: e.next,
            rules: e.rules,
            rule: e.rule,
        };
    }
    const body = { about: ABOUT, version: 1, entries: sorted };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(body, null, 1)}\n`, "utf8");
}
/**
 * The referee a report declares in its `ingest.ts`:
 *
 *     layoutPageJoins({ referee: pageBreakCache(new URL("./referee/pagebreaks.json", import.meta.url)) })
 *
 * Reads the file once, now; answers from it and nothing else. A missing file
 * is an empty cache (every break keeps the rules' call).
 */
export function pageBreakCache(path) {
    const file = pathOf(path);
    const entries = readPageBreakCache(file);
    const asked = new Map();
    const referee = ((c) => {
        if (!asked.has(c.key))
            asked.set(c.key, c);
        return entries.get(c.key)?.join;
    });
    Object.defineProperties(referee, {
        path: { value: file },
        entries: { value: entries },
        asked: { value: asked },
        cached: { value: true },
    });
    return referee;
}
export function isCachedReferee(referee) {
    return typeof referee === "function" && referee.cached === true;
}
/** A cache entry for a case and an answer. */
export function refereeEntry(c, join, by, prompt = REFEREE_PROMPT_ID) {
    return {
        join,
        by,
        prompt,
        page: c.lines.next.page,
        ...(c.lines.next.volume !== 1 ? { volume: c.lines.next.volume } : {}),
        prev: c.lines.prev.text.trim(),
        next: c.lines.next.text.trim(),
        rules: c.decision.join ? "join" : "split",
        rule: `${c.decision.rule}: ${c.decision.reason}`,
    };
}
// ---------------------------------------------------------------------------
// The prompt
/**
 * What the referee is told. The pilot's one bias (it said JOIN for a new
 * bullet, numbered paragraph, contents entry or heading) is named here; the
 * context is our own blocks and the layout's lines, not `pdftotext -layout`,
 * whose two-column pages interleave.
 */
export const REFEREE_SYSTEM = [
    "You check how a PDF report was converted to text. A page break falls between the last printed line of one page and the first printed line of the next; running heads, page numbers and footnotes have already been removed.",
    "For each case decide whether the text after the break continues the same paragraph, block quotation or list item (JOIN), or starts a new one (SPLIT).",
    "",
    "How to decide:",
    "- A sentence left unfinished at the foot of the page usually runs on (JOIN), whatever letter the next page opens with: proper nouns, \"The\", dates, citation strings and document numbers all continue paragraphs.",
    "- A finished sentence can still run on: in a justified page, a last line that reaches the right margin followed by a first line with no indent is the middle of a paragraph.",
    "- A first-line indent on the new page (its first line set further right than the line under it) marks a new paragraph (SPLIT). A first line flush with the line under it is a run-on, unless the document sets new paragraphs flush.",
    "- Always SPLIT when the new page opens a new bullet, a numbered or lettered paragraph (\"57.\", \"(b)\", \"9.88\"), a heading or title, a contents or index entry, a caption, a date line or list entry, or a change between quotation and prose. Such a line may still follow an unfinished line (an index entry, a list without punctuation): the label or the line's shape wins.",
    "- A last line that stops well short of the right margin without ending a sentence is usually a heading, list entry or table line, not prose.",
    "",
    "The layout lines give each printed line's indent from the page's text margin and its gap to the right margin, in ems. Judge from the words first and the layout second. Answer only with the JSON the schema asks for.",
].join("\n");
/** Changes whenever the prompt or the examples change; recorded with every answer. */
export const REFEREE_PROMPT_ID = `pb1-${createHash("sha256")
    .update(REFEREE_SYSTEM)
    .update(JSON.stringify(REFEREE_EXAMPLES))
    .digest("hex")
    .slice(0, 8)}`;
const clip = (s, n, end) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length <= n)
        return t;
    if (end) {
        const cut = t.slice(t.length - n);
        return `…${cut.slice(cut.indexOf(" ") + 1)}`;
    }
    const cut = t.slice(0, n);
    return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};
const em = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
function layoutRow(line) {
    return `  [indent ${em(line.indentEm)} em, right gap ${Math.abs(line.rightGapEm).toFixed(1)} em${line.body ? "" : ", not the body face"}] ${line.text.trim()}`;
}
/**
 * One case as the referee reads it: our two blocks either side of the break
 * (the paragraph's end, the block's start) and the printed lines around it.
 */
export function describeCase(c) {
    const { prev, next, under, prevPage } = c.lines;
    const before = prevPage.lines.filter((l) => l.index < prev.index).slice(-2);
    const lines = [
        `Text before the break (end of a paragraph): ${clip(c.prevText, 320, true)}`,
        `Text after the break (start of a block): ${clip(c.nextText, 320, false)}`,
        `Old page (p.${prev.page}), ${isJustified(prevPage) ? "set justified" : "set ragged-right"}, its last lines:`,
        ...before.map(layoutRow),
        layoutRow(prev),
        `New page (p.${next.page}), its first lines:`,
        layoutRow(next),
        ...(under ? [layoutRow(under)] : ["  (no line under the first line on this page)"]),
    ];
    if (c.decision.indentEm !== undefined) {
        lines.push(`The new page's first line is ${em(c.decision.indentEm)} em from the line under it${c.lines.underContinues ? "" : " (which may belong to another block)"}.`);
    }
    return lines.join("\n");
}
const SCHEMA = {
    type: "object",
    properties: {
        answers: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    answer: { type: "string", enum: ["JOIN", "SPLIT"] },
                },
                required: ["id", "answer"],
                additionalProperties: false,
            },
        },
    },
    required: ["answers"],
    additionalProperties: false,
};
function examplesText() {
    return [
        "Worked examples, from other reports, with the right answer:",
        "",
        ...REFEREE_EXAMPLES.flatMap((x, i) => [`Example ${i + 1}:`, x.text, `Answer: ${x.answer}${x.why ? ` (${x.why})` : ""}`, ""]),
    ].join("\n");
}
/** The requests for a set of cases: one per batch, case ids "c1"… within it. */
export function refereeRequests(cases, options) {
    const size = Math.max(1, options.batch ?? 20);
    const out = [];
    for (let i = 0; i < cases.length; i += size) {
        const chunk = cases.slice(i, i + size);
        const ids = new Map(chunk.map((c, k) => [`c${k + 1}`, c]));
        const content = [
            { type: "text", text: `Decide these ${chunk.length} page breaks. Answer every id.` },
        ];
        for (const [id, c] of ids) {
            content.push({ type: "text", text: `Case ${id}:\n${describeCase(c)}` });
            const images = options.images?.(c);
            if (images?.length) {
                content.push({ type: "text", text: `Case ${id}: the foot of the old page, then the head of the new page:` }, ...images);
            }
        }
        out.push({
            ids,
            request: {
                model: options.model,
                max_tokens: 64 + 24 * chunk.length,
                system: [
                    { type: "text", text: REFEREE_SYSTEM },
                    { type: "text", text: examplesText(), cache_control: { type: "ephemeral" } },
                ],
                messages: [{ role: "user", content }],
                output_config: { format: { type: "json_schema", schema: SCHEMA } },
            },
        });
    }
    return out;
}
/** The answers in a response's text, by case id. Tolerates prose around the JSON. */
export function parseRefereeAnswers(text) {
    const answers = new Map();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match)
        return answers;
    let parsed;
    try {
        parsed = JSON.parse(match[0]);
    }
    catch {
        return answers;
    }
    const list = parsed.answers;
    if (!Array.isArray(list))
        return answers;
    for (const item of list) {
        const { id, answer } = (item ?? {});
        if (typeof id !== "string")
            continue;
        if (answer === "JOIN")
            answers.set(id, true);
        else if (answer === "SPLIT")
            answers.set(id, false);
    }
    return answers;
}
const ZERO = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
/** Puts cases to the referee through a transport, a batch at a time, and returns cache entries. */
export async function refereePageBreaks(cases, transport, options) {
    const entries = new Map();
    const usage = { ...ZERO };
    const unanswered = [];
    let calls = 0;
    for (const { ids, request } of refereeRequests(cases, options)) {
        const response = await transport(request);
        calls += 1;
        for (const k of Object.keys(ZERO))
            usage[k] += response.usage[k] ?? 0;
        const answers = parseRefereeAnswers(response.text);
        for (const [id, c] of ids) {
            const join = answers.get(id);
            if (join === undefined)
                unanswered.push(c.key);
            else
                entries.set(c.key, refereeEntry(c, join, options.model));
        }
    }
    return { entries, usage, calls, unanswered };
}
/** List prices, US$ per million tokens: input, output, cache write (5 min), cache read. */
export const REFEREE_PRICES = {
    "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
    "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
    "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};
/** What a run cost at list price, in US$ (undefined for a model with no price here). */
export function refereeCost(model, usage) {
    const p = REFEREE_PRICES[model];
    if (!p)
        return undefined;
    return ((usage.input_tokens * p.input +
        usage.output_tokens * p.output +
        usage.cache_creation_input_tokens * p.cacheWrite +
        usage.cache_read_input_tokens * p.cacheRead) /
        1e6);
}
/** The key a request is recorded under. */
export function requestHash(request) {
    return createHash("sha256").update(JSON.stringify(request)).digest("hex").slice(0, 16);
}
function readRecording(file) {
    if (!existsSync(file))
        return { about: "Recorded page-break referee responses (@rtm/ingest replayTransport).", version: 1, exchanges: {} };
    return JSON.parse(readFileSync(file, "utf8"));
}
/** Replays recorded responses; throws on a request that was never recorded. */
export function replayTransport(path) {
    const file = pathOf(path);
    const recording = readRecording(file);
    return async (request) => {
        const hit = recording.exchanges[requestHash(request)];
        if (!hit)
            throw new Error(`${file}: no recorded response for this request (${requestHash(request)}); the prompt, model or batch changed: re-record`);
        return hit.response;
    };
}
/** Passes requests to `inner` and records each response in `path`. */
export function recordingTransport(inner, path) {
    const file = pathOf(path);
    return async (request) => {
        const response = await inner(request);
        const recording = readRecording(file);
        const cases = request.messages[0].content.filter((c) => c.type === "text" && c.text.startsWith("Case ")).length;
        recording.exchanges[requestHash(request)] = { model: request.model, cases, response };
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, `${JSON.stringify(recording, null, 1)}\n`, "utf8");
        return response;
    };
}
