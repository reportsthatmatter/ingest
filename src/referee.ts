import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { LayoutLine } from "./layout";
import { isJustified, type PageBreakCase, type PageBreakReferee } from "./pagebreaks";
import { REFEREE_EXAMPLES } from "./referee-examples";

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

const ABOUT =
  "LLM referee answers for page breaks the layout rules could not settle (@rtm/ingest layoutPageJoins, reportsthatmatter-38s.11). " +
  "Keyed by a hash of the two printed lines; ingest reads `join` and nothing else. Written by `pnpm ingest referee <id>`; " +
  "a wrong answer may be corrected by hand (set `join`, and `by: human`).";

function pathOf(path: string | URL): string {
  return typeof path === "string" ? path : fileURLToPath(path);
}

/** Reads a cache file; a missing file is an empty cache. */
export function readPageBreakCache(path: string | URL): Map<string, RefereeEntry> {
  const file = pathOf(path);
  if (!existsSync(file)) return new Map();
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<PageBreakCacheFile>;
  if (parsed.version !== 1 || typeof parsed.entries !== "object" || parsed.entries === null) {
    throw new Error(`${file}: not a page-break referee cache (version 1)`);
  }
  const entries = new Map<string, RefereeEntry>();
  for (const [key, entry] of Object.entries(parsed.entries)) {
    if (typeof entry?.join !== "boolean") throw new Error(`${file}: entry ${key} has no boolean "join"`);
    entries.set(key, entry);
  }
  return entries;
}

/** Writes a cache file: keys sorted, one entry per few lines, so a diff reads as the answers that changed. */
export function writePageBreakCache(path: string | URL, entries: Map<string, RefereeEntry>): void {
  const file = pathOf(path);
  const sorted: Record<string, RefereeEntry> = {};
  for (const key of [...entries.keys()].sort()) {
    const e = entries.get(key)!;
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
  const body: PageBreakCacheFile = { about: ABOUT, version: 1, entries: sorted };
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
export function pageBreakCache(path: string | URL): CachedReferee {
  const file = pathOf(path);
  const entries = readPageBreakCache(file);
  const asked = new Map<string, PageBreakCase>();
  const referee = ((c: PageBreakCase) => {
    if (!asked.has(c.key)) asked.set(c.key, c);
    return entries.get(c.key)?.join;
  }) as CachedReferee;
  Object.defineProperties(referee, {
    path: { value: file },
    entries: { value: entries },
    asked: { value: asked },
    cached: { value: true },
  });
  return referee;
}

export function isCachedReferee(referee: unknown): referee is CachedReferee {
  return typeof referee === "function" && (referee as Partial<CachedReferee>).cached === true;
}

/** A cache entry for a case and an answer. */
export function refereeEntry(c: PageBreakCase, join: boolean, by: string, prompt = REFEREE_PROMPT_ID): RefereeEntry {
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

const clip = (s: string, n: number, end: boolean): string => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  if (end) {
    const cut = t.slice(t.length - n);
    return `…${cut.slice(cut.indexOf(" ") + 1)}`;
  }
  const cut = t.slice(0, n);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};

const em = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;

function layoutRow(line: LayoutLine): string {
  return `  [indent ${em(line.indentEm)} em, right gap ${Math.abs(line.rightGapEm).toFixed(1)} em${line.body ? "" : ", not the body face"}] ${line.text.trim()}`;
}

/**
 * One case as the referee reads it: our two blocks either side of the break
 * (the paragraph's end, the block's start) and the printed lines around it.
 */
export function describeCase(c: PageBreakCase): string {
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

// ---------------------------------------------------------------------------
// Asking

/** A Messages API request body, kept structural so this library needs no SDK. */
export type RefereeRequest = {
  model: string;
  max_tokens: number;
  system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
  messages: Array<{ role: "user"; content: Array<RefereeContent> }>;
  output_config: { format: { type: "json_schema"; schema: Record<string, unknown> } };
};

export type RefereeContent =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/png"; data: string } };

export type RefereeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

/** Sends one request and returns the response's text and usage. The host supplies it (the Anthropic SDK, or a recorded fake). */
export type RefereeTransport = (request: RefereeRequest) => Promise<{ text: string; usage: Partial<RefereeUsage> }>;

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
} as const;

function examplesText(): string {
  return [
    "Worked examples, from other reports, with the right answer:",
    "",
    ...REFEREE_EXAMPLES.flatMap((x, i) => [`Example ${i + 1}:`, x.text, `Answer: ${x.answer}${x.why ? ` (${x.why})` : ""}`, ""]),
  ].join("\n");
}

export type RefereeOptions = {
  model: string;
  /** Cases per request (the system prompt and examples are shared, and cached). Default 20. */
  batch?: number;
  /** Optional image blocks for a case (crops of the two page edges). */
  images?: (c: PageBreakCase) => RefereeContent[] | undefined;
};

/** The requests for a set of cases: one per batch, case ids "c1"… within it. */
export function refereeRequests(
  cases: PageBreakCase[],
  options: RefereeOptions
): Array<{ ids: Map<string, PageBreakCase>; request: RefereeRequest }> {
  const size = Math.max(1, options.batch ?? 20);
  const out: Array<{ ids: Map<string, PageBreakCase>; request: RefereeRequest }> = [];
  for (let i = 0; i < cases.length; i += size) {
    const chunk = cases.slice(i, i + size);
    const ids = new Map(chunk.map((c, k) => [`c${k + 1}`, c] as [string, PageBreakCase]));
    const content: RefereeContent[] = [
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
export function parseRefereeAnswers(text: string): Map<string, boolean> {
  const answers = new Map<string, boolean>();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return answers;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return answers;
  }
  const list = (parsed as { answers?: unknown }).answers;
  if (!Array.isArray(list)) return answers;
  for (const item of list) {
    const { id, answer } = (item ?? {}) as { id?: unknown; answer?: unknown };
    if (typeof id !== "string") continue;
    if (answer === "JOIN") answers.set(id, true);
    else if (answer === "SPLIT") answers.set(id, false);
  }
  return answers;
}

const ZERO: RefereeUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

export type RefereeRun = {
  entries: Map<string, RefereeEntry>;
  usage: RefereeUsage;
  calls: number;
  /** Keys of cases the model gave no usable answer for (they stay with the rules). */
  unanswered: string[];
};

/** Puts cases to the referee through a transport, a batch at a time, and returns cache entries. */
export async function refereePageBreaks(
  cases: PageBreakCase[],
  transport: RefereeTransport,
  options: RefereeOptions
): Promise<RefereeRun> {
  const entries = new Map<string, RefereeEntry>();
  const usage = { ...ZERO };
  const unanswered: string[] = [];
  let calls = 0;
  for (const { ids, request } of refereeRequests(cases, options)) {
    const response = await transport(request);
    calls += 1;
    for (const k of Object.keys(ZERO) as Array<keyof RefereeUsage>) usage[k] += response.usage[k] ?? 0;
    const answers = parseRefereeAnswers(response.text);
    for (const [id, c] of ids) {
      const join = answers.get(id);
      if (join === undefined) unanswered.push(c.key);
      else entries.set(c.key, refereeEntry(c, join, options.model));
    }
  }
  return { entries, usage, calls, unanswered };
}

/** List prices, US$ per million tokens: input, output, cache write (5 min), cache read. */
export const REFEREE_PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};

/** What a run cost at list price, in US$ (undefined for a model with no price here). */
export function refereeCost(model: string, usage: RefereeUsage): number | undefined {
  const p = REFEREE_PRICES[model];
  if (!p) return undefined;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      usage.cache_creation_input_tokens * p.cacheWrite +
      usage.cache_read_input_tokens * p.cacheRead) /
    1e6
  );
}

// ---------------------------------------------------------------------------
// Recording and replaying a referee's responses

/**
 * Responses recorded against the exact request that produced them, so a test
 * or a dry run can replay a referee with no network and no key. A request
 * that differs by a byte (a prompt change, another model, another batch) has
 * no recording, and replaying it throws: re-record.
 */
export type RefereeRecording = {
  about: string;
  version: 1;
  exchanges: Record<string, { model: string; cases: number; response: { text: string; usage: Partial<RefereeUsage> } }>;
};

/** The key a request is recorded under. */
export function requestHash(request: RefereeRequest): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex").slice(0, 16);
}

function readRecording(file: string): RefereeRecording {
  if (!existsSync(file)) return { about: "Recorded page-break referee responses (@rtm/ingest replayTransport).", version: 1, exchanges: {} };
  return JSON.parse(readFileSync(file, "utf8")) as RefereeRecording;
}

/** Replays recorded responses; throws on a request that was never recorded. */
export function replayTransport(path: string | URL): RefereeTransport {
  const file = pathOf(path);
  const recording = readRecording(file);
  return async (request) => {
    const hit = recording.exchanges[requestHash(request)];
    if (!hit) throw new Error(`${file}: no recorded response for this request (${requestHash(request)}); the prompt, model or batch changed: re-record`);
    return hit.response;
  };
}

/** Passes requests to `inner` and records each response in `path`. */
export function recordingTransport(inner: RefereeTransport, path: string | URL): RefereeTransport {
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
