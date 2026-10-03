import { parse } from "yaml";
import type { Block } from "./paragraphs";
import type { Footnote } from "./footnotes";
import { linkInlineMarkers } from "./footnotes";
import { ORACLE_SIGNALS } from "./oracle";
import type { OracleSignal, PageCounts } from "./oracle";

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

export type Golden = { pages: GoldenPage[] };

const str = (v: unknown, what: string): string => {
  if (typeof v !== "string") throw new Error(`golden.yaml: ${what} must be a string`);
  return v;
};
const nums = (v: unknown, what: string): number[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "number")) throw new Error(`golden.yaml: ${what} must be a list of numbers`);
  return v as number[];
};
const strs = (v: unknown, what: string): string[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`golden.yaml: ${what} must be a list of strings`);
  return v as string[];
};

export function parseGolden(text: string): Golden {
  const raw = parse(text) as { pages?: unknown[] } | null;
  const pages: GoldenPage[] = [];
  for (const [i, p] of ((raw?.pages ?? []) as Array<Record<string, unknown>>).entries()) {
    const where = `pages[${i}] (pdf ${p.pdf})`;
    if (typeof p.pdf !== "number") throw new Error(`golden.yaml: ${where}: pdf must be a number`);
    if (typeof p.verified_by !== "string" || !p.verified_by) throw new Error(`golden.yaml: ${where}: verified_by is required`);
    const blocks: GoldenBlock[] = [];
    for (const b of (p.blocks ?? []) as Array<Record<string, unknown>>) {
      const type = (["heading", "paragraph", "quote", "list"] as const).find((t) => t in b);
      if (!type) throw new Error(`golden.yaml: ${where}: a block needs one of heading, paragraph, quote, list`);
      const v = b[type];
      if (type === "heading") {
        blocks.push({ type, start: str(v, `${where} heading`), level: typeof b.level === "number" ? b.level : undefined });
      } else {
        const o = v as Record<string, unknown>;
        if (!o || typeof o !== "object") throw new Error(`golden.yaml: ${where}: ${type} needs start/end`);
        blocks.push({
          type,
          start: str(o.start, `${where} ${type}.start`),
          end: o.end === undefined ? undefined : str(o.end, `${where} ${type}.end`),
          continues: o.continues === true || undefined,
          notes: o.notes === undefined ? undefined : nums(o.notes, `${where} notes`),
          items: typeof o.items === "number" ? o.items : undefined,
        });
        if (blocks[blocks.length - 1].end === undefined && !blocks[blocks.length - 1].continues) {
          throw new Error(`golden.yaml: ${where}: a ${type} needs an end, or continues: true`);
        }
      }
    }
    const only = p.xfail_only === undefined ? undefined : (strs(p.xfail_only, `${where} xfail_only`) as AssertionKind[]);
    for (const k of only ?? []) if (!ASSERTION_KINDS.includes(k)) throw new Error(`golden.yaml: ${where}: xfail_only has unknown kind "${k}" (${ASSERTION_KINDS.join(", ")})`);
    pages.push({
      pdf: p.pdf,
      volume: typeof p.volume === "number" ? p.volume : 1,
      printed: p.printed as number | string | undefined,
      verified_by: p.verified_by,
      features: strs(p.features, `${where} features`),
      xfail: typeof p.xfail === "string" ? p.xfail : undefined,
      xfail_only: only,
      note: typeof p.note === "string" ? p.note : undefined,
      continues_previous: p.continues_previous === true || undefined,
      opens_with: typeof p.opens_with === "string" ? p.opens_with : undefined,
      blocks: p.blocks === undefined ? undefined : blocks,
      headings: p.headings === undefined ? undefined : strs(p.headings, `${where} headings`),
      footnotes: p.footnotes === undefined ? undefined : nums(p.footnotes, `${where} footnotes`),
      markers: p.markers === undefined ? undefined : nums(p.markers, `${where} markers`),
      must_contain: strs(p.must_contain, `${where} must_contain`),
      must_read: strs(p.must_read, `${where} must_read`),
      separate: strs(p.separate, `${where} separate`),
      must_be_quote: strs(p.must_be_quote, `${where} must_be_quote`),
      must_not_be_quote: strs(p.must_not_be_quote, `${where} must_not_be_quote`),
      must_not_contain: strs(p.must_not_contain, `${where} must_not_contain`),
    });
  }
  return { pages };
}

/** Letters and digits only, lower case: a comparison blind to spacing, hyphenation, quote style and marker glue. */
/** A heading's enumerator ("I." "3." "A." "2.1") is a label the pipeline may move or drop; it is not compared. */
const unlabel = (s: string) => s.trim().replace(/^\(?(?:[ivxlc]{1,6}|[a-z]|\d{1,3}(?:\.\d{1,3})*)[.)]\s+/i, "");

const norm = (s: string) => s.replace(/ʼ/g, "’").toLowerCase().replace(/\[\^[^\]]*\]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

type Made = { kind: "heading" | "paragraph" | "quote" | "list"; level?: number; text: string; notes: number[]; items?: number; page: number };

/**
 * The pipeline's blocks with each text replaced by its final form (markers
 * linked as `[^N]`, hyphens rejoined, OCR fixed), from `IngestResult.linkedText`.
 * Without it the blocks are returned as they are. Use this wherever a block's
 * text is compared with the page: the raw blocks leave an endnotes report's
 * markers unlinked.
 */
export function finalBlocks(result: { blocks?: Block[]; linkedText?: Array<string | undefined> }): Block[] {
  const blocks = result.blocks ?? [];
  const chunks = result.linkedText;
  if (!chunks || chunks.length !== blocks.length) return blocks;
  return blocks.map((b, i): Block => {
    const c = chunks[i];
    if (c === undefined) return b; // closed into the block before it by the hyphen rejoin
    // blocksToMarkdown escapes "3437." and "#" at a block's start so Markdown reads them as text: undo that
    const unescape = (t: string) => t.replace(/^(\d+)\\([.)])/, "$1$2").replace(/^\\(#{1,6})(?=\s|$)/, "$1");
    if (b.kind === "paragraph") return { ...b, text: unescape(c) };
    if (b.kind === "quote") return { ...b, text: unescape(c.replace(/^> /, "")) };
    if (b.kind === "heading") return { ...b, text: c.replace(/^#{1,6} /, "") };
    if (b.kind === "list") return { ...b, items: c.split("\n").map((l) => unescape(l.replace(/^(?:> )?- /, ""))) };
    return b;
  });
}

function bodyText(b: Block): string | undefined {
  if (b.kind === "paragraph" || b.kind === "quote" || b.kind === "heading") return b.text;
  if (b.kind === "list") return b.items.join("\n");
  return undefined;
}

/** The pipeline's blocks as a golden entry sees them, with markers linked as the renderer links them. */
function made(blocks: Block[], footnotes: Array<Pick<Footnote, "number">>, volume: number, relink: boolean): Map<number, Made[]> {
  const known = new Set(footnotes.map((n) => n.number));
  const out = new Map<number, Made[]>();
  for (const b of blocks) {
    if (!b.at || b.at.volume !== volume) continue;
    const text = bodyText(b);
    if (text === undefined) continue;
    const linked = b.kind === "heading" || !known.size || !relink ? text : linkInlineMarkers(text, known);
    // a paragraph-numbered note reads "[^1-31]" (note 1 of block 31): its number is the first
    const notes = [...linked.matchAll(/\[\^(\d+)(?:-[^\]]*)?\]/g)].map((m) => Number(m[1]));
    const m: Made = {
      kind: b.kind as Made["kind"],
      level: b.kind === "heading" ? b.level : undefined,
      text: linked.replace(/\[\^[^\]]*\]/g, ""),
      notes,
      items: b.kind === "list" ? b.items.length : undefined,
      page: b.at.pdfIndex,
    };
    const list = out.get(b.at.pdfIndex) ?? [];
    list.push(m);
    out.set(b.at.pdfIndex, list);
  }
  return out;
}

/** What a golden entry asserts, one kind per field: `xfail_only` names the kinds that are known to fail. */
export type AssertionKind =
  | "blocks"
  | "headings"
  | "footnotes"
  | "markers"
  | "must_contain"
  | "must_read"
  | "separate"
  | "must_be_quote"
  | "must_not_be_quote"
  | "must_not_contain"
  | "opens";
export const ASSERTION_KINDS: AssertionKind[] = ["blocks", "headings", "footnotes", "markers", "must_contain", "must_read", "separate", "must_be_quote", "must_not_be_quote", "must_not_contain", "opens"];

export type GoldenResult = {
  page: GoldenPage;
  problems: string[];
  /** The kinds of assertion that failed. */
  failing: AssertionKind[];
  /** What the page should read on each oracle signal, were the oracle perfect, given what the pipeline produced. */
  truth: Partial<PageCounts>;
  /** Produced blocks, for the failure message. */
  produced: Array<{ kind: string; start: string; end: string }>;
};

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);
const tail = (s: string, n = 40) => (s.length > n ? `…${s.slice(-n)}` : s);

export function checkGoldenPage(
  page: GoldenPage,
  blocks: Block[],
  footnotes: Array<Pick<Footnote, "number"> & Partial<Pick<Footnote, "volume" | "pdfIndex">>>,
  /** `relink: false` when `blocks` come from `finalBlocks` and their markers are already the pipeline's own. */
  options: { relink?: boolean } = {}
): GoldenResult {
  const byPage = made(blocks, footnotes, page.volume, options.relink ?? true);
  const p = page.pdf;
  const mine = byPage.get(p) ?? [];
  const around = [...(byPage.get(p - 1) ?? []), ...mine, ...(byPage.get(p + 1) ?? [])];
  const problems: string[] = [];
  const kinds = new Set<AssertionKind>();
  let kind: AssertionKind = "blocks";
  const fail = (message: string) => {
    problems.push(message);
    kinds.add(kind);
  };
  const truth: Partial<PageCounts> = {};
  const hasStart = (m: Made, g: GoldenBlock) => norm(m.text).startsWith(norm(g.start));

  // — Blocks, in order —
  const gold = page.blocks;
  kind = "blocks";
  if (gold) {
    if (mine.length !== gold.length) {
      fail(`${mine.length} block(s) start here, the page has ${gold.length}`);
    }
    for (let i = 0; i < Math.min(mine.length, gold.length); i++) {
      const m = mine[i];
      const g = gold[i];
      const label = `block ${i + 1} (${g.type} "${clip(g.start, 30)}")`;
      if (m.kind !== g.type) {
        fail(`${label}: pipeline made a ${m.kind} "${clip(m.text, 40)}"`);
        continue;
      }
      if (g.type === "heading") {
        if (norm(unlabel(m.text)) !== norm(unlabel(g.start))) fail(`${label}: pipeline heading reads "${clip(m.text)}"`);
        else if (g.level !== undefined && m.level !== g.level) fail(`${label}: level ${m.level}, expected ${g.level}`);
        continue;
      }
      if (!hasStart(m, g)) fail(`${label}: pipeline block opens "${clip(m.text, 50)}"`);
      else if (g.end !== undefined && !norm(m.text).endsWith(norm(g.end))) fail(`${label}: ends "${tail(m.text)}", expected "${tail(g.end)}"`);
      if (g.items !== undefined && m.items !== g.items) fail(`${label}: ${m.items} items, expected ${g.items}`);
      if (g.notes !== undefined) {
        const want = [...g.notes].sort((a, b) => a - b).join(",");
        const got = [...new Set(m.notes)].sort((a, b) => a - b);
        if (g.continues) {
          const missing = g.notes.filter((n) => !m.notes.includes(n));
          if (missing.length) fail(`${label}: notes ${missing.join(",")} not linked`);
        } else if (got.join(",") !== want) {
          fail(`${label}: notes linked [${got.join(",")}], expected [${want}]`);
        }
      }
    }
  }

  kind = "headings";
  if (!gold && page.headings) {
    const got = mine.filter((m) => m.kind === "heading").map((m) => m.text);
    const same = got.length === page.headings.length && got.every((t, i) => norm(unlabel(t)) === norm(unlabel(page.headings![i])));
    if (!same) fail(`headings here [${got.map((t) => clip(t, 30)).join(" | ")}], expected [${page.headings.map((t) => clip(t, 30)).join(" | ")}]`);
  }

  // — Page-level facts —
  kind = "footnotes";
  if (page.footnotes) {
    const got = [...new Set(footnotes.filter((n) => (n.volume ?? 1) === page.volume && n.pdfIndex === p).map((n) => n.number))].sort((a, b) => a - b);
    const want = [...page.footnotes].sort((a, b) => a - b);
    if (got.join(",") !== want.join(",")) fail(`footnotes defined here [${got.join(",")}], expected [${want.join(",")}]`);
  }

  kind = "markers";
  const linkedHere = (q: number) => [...(byPage.get(q) ?? [])].flatMap((m) => m.notes);
  const linkedNear = new Set([...linkedHere(p - 1), ...linkedHere(p)]);
  const markers = page.markers;
  const unlinked = markers ? markers.filter((n) => !linkedNear.has(n)) : [];
  const spurious: number[] = [];
  if (markers) {
    if (unlinked.length) fail(`markers not linked: ${unlinked.join(",")}`);
    const max = Math.max(0, ...markers);
    mine.forEach((m, i) => {
      const last = i === mine.length - 1;
      for (const n of m.notes) {
        if (markers.includes(n)) continue;
        // The last block may run on to the next page, whose markers it then holds.
        if (last && (n > max || !markers.length)) continue;
        spurious.push(n);
      }
    });
    if (spurious.length) fail(`markers linked that the page does not have: ${[...new Set(spurious)].join(",")}`);
  }

  kind = "must_contain";
  for (const run of page.must_contain) {
    if (!around.some((m) => norm(m.text).includes(norm(run)))) fail(`no single block contains "${clip(run, 70)}"`);
  }
  const exact = (t: string) => t.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ");
  kind = "must_read";
  for (const run of page.must_read) {
    if (!around.some((m) => exact(m.text).includes(exact(run)))) fail(`no block reads exactly "${clip(run, 70)}"`);
  }
  kind = "separate";
  if (page.separate.length) {
    const holders = page.separate.map((run) => around.filter((m) => norm(m.text).includes(norm(run))));
    page.separate.forEach((run, i) => {
      if (!holders[i].length) fail(`"${clip(run, 50)}" is not in any block`);
    });
    for (let i = 0; i < page.separate.length; i++) {
      for (let j = i + 1; j < page.separate.length; j++) {
        if (holders[i].some((m) => holders[j].includes(m))) fail(`"${clip(page.separate[i], 30)}" and "${clip(page.separate[j], 30)}" run together in one block`);
      }
    }
  }
  kind = "must_be_quote";
  for (const run of page.must_be_quote) {
    if (!around.some((m) => m.kind === "quote" && norm(m.text).includes(norm(run)))) fail(`"${clip(run, 50)}" is not in a quotation`);
  }
  kind = "must_not_be_quote";
  for (const run of page.must_not_be_quote) {
    if (around.some((m) => m.kind === "quote" && norm(m.text).includes(norm(run)))) fail(`"${clip(run, 50)}" is in a quotation`);
  }
  kind = "must_not_contain";
  for (const run of page.must_not_contain) {
    if (mine.some((m) => norm(m.text).includes(norm(run)))) fail(`"${clip(run, 50)}" reached the text`);
  }
  kind = "opens";
  if (page.continues_previous) {
    if (!page.opens_with) fail("continues_previous needs opens_with");
    else {
      const k = norm(page.opens_with);
      if (mine.some((m) => norm(m.text).startsWith(k))) fail(`a block opens "${clip(page.opens_with, 40)}", which continues the paragraph before`);
      if (!around.some((m) => norm(m.text).includes(k))) fail(`"${clip(page.opens_with, 40)}" is nowhere in the text around this page`);
    }
  }

  // — What each oracle signal should read on this page —
  const gBody = (gold ?? []).filter((g) => g.type !== "heading");
  const gHead = gold
    ? gold.filter((g) => g.type === "heading")
    : (page.headings ?? []).map((start): GoldenBlock => ({ type: "heading", start }));
  const mBody = mine.filter((m) => m.kind !== "heading");
  const mHead = mine.filter((m) => m.kind === "heading");
  const headStart = (a: string, b: string) => {
    const x = norm(unlabel(a));
    const y = norm(unlabel(b));
    const k = Math.min(12, x.length, y.length);
    return k >= 3 && x.slice(0, k) === y.slice(0, k);
  };
  if (gold || page.headings) {
    truth["headings-missed"] = gHead.filter((g) => !mHead.some((m) => headStart(m.text, g.start))).length;
    truth["headings-spurious"] = mHead.filter((m) => !gHead.some((g) => headStart(m.text, g.start))).length;
  }
  if (gold) {
    const startsAnyBody = (m: Made) => gBody.some((g) => hasStart(m, g));
    truth["paragraphs-merged"] = gBody.filter((g) => !mine.some((m) => m.kind !== "heading" && hasStart(m, g))).length;
    // a block that is a golden heading read as body counts as a missed heading, not an oversplit paragraph
    truth["paragraphs-oversplit"] = mBody.filter((m) => !startsAnyBody(m) && !gHead.some((g) => headStart(m.text, g.start))).length;
    truth["quotes-spurious"] = mBody.filter((m) => m.kind === "quote" && !gBody.some((g) => g.type === "quote" && hasStart(m, g))).length;
    truth["quotes-missed"] = gBody.filter((g) => g.type === "quote" && !mBody.some((m) => m.kind === "quote" && hasStart(m, g))).length;
  }
  if (markers) {
    truth["markers-unlinked"] = unlinked.length;
    truth["markers-spurious"] = spurious.length;
  }

  return {
    page,
    problems,
    failing: [...kinds],
    truth,
    produced: mine.map((m) => ({ kind: m.kind, start: clip(m.text, 50), end: tail(m.text, 30) })),
  };
}

/** Precision and recall of the oracle on golden pages, one row per signal. */
export type SignalScore = { signal: OracleSignal; tp: number; fp: number; fn: number };

/**
 * Compares, page by page, what the oracle counted with what the page's entry
 * says is wrong. A count is matched one-for-one up to the smaller of the two:
 * `tp` is min(oracle, truth), `fp` what the oracle counted beyond the truth,
 * `fn` what the truth had that the oracle missed.
 */
export function scoreOracle(rows: Array<{ oracle: PageCounts | undefined; truth: Partial<PageCounts> }>): SignalScore[] {
  return ORACLE_SIGNALS.map((signal) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const r of rows) {
      const t = r.truth[signal];
      if (t === undefined) continue; // the entry does not say, so the oracle cannot be scored here
      const o = r.oracle?.[signal] ?? 0;
      tp += Math.min(o, t);
      fp += Math.max(0, o - t);
      fn += Math.max(0, t - o);
    }
    return { signal, tp, fp, fn };
  });
}
