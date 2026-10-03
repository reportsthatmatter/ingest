import type { Layout, LayoutLine } from "./layout";
import type { Block } from "./paragraphs";

/**
 * Footnote markers linked from the PDF's own typesetting (reportsthatmatter-b94).
 *
 * The text-only linkers guess a marker from its shape in `pdftotext`'s
 * output: a number after sentence punctuation and a space
 * (`linkInlineMarkers`), or glued to a lower-case word (`linkFlushMarkers`).
 * Both miss the commonest shape in a born-digital report, a raised number
 * flush against whatever precedes it: "companies.7", "Corp,12",
 * "community.”1", "IS.”1410", "1985 62" set as "198562". And they cannot
 * tell a marker from a number without guessing, which is why every widening
 * of them has had to be undone ("Section V.D.2", "18 U.S.C.").
 *
 * The PDF says which numbers are markers: they are set small and raised
 * (`LayoutLine.raised`, from `pdftohtml -xml`). This pass reads each page's
 * raised digit runs, finds each one in the page's blocks by the words
 * printed before it, and links it, when three things agree:
 *
 * 1. the layout raises it, in a line set at (about) the body's size, after
 *    something on the same line (a raised number opening its line is a note's
 *    own number, at the page foot or on a notes page);
 * 2. a note with that number was collected where this report keeps its notes
 *    (`scope`: near the page for footnotes, anywhere for endnotes);
 * 3. it is in sequence: of the page's candidates, only the longest run of
 *    increasing numbers is kept, because notes are cited in the order they
 *    are numbered. A raised "2" in "km2" between notes 151 and 152 is not.
 *
 * A candidate whose words cannot be found in the page's blocks, or found
 * more than once out of reading order, is left alone: an unlinked marker is
 * visibly a gap; a wrong link reads as the document.
 */
export type LayoutMarkersOptions = {
  /**
   * Where a marker's note may be: `"page"` (the default), a note collected
   * on the marker's own page or either side of it (page-foot notes; a note
   * that runs over is read on the next page); `"document"`, any note the
   * report collected (endnotes at a chapter's or the report's end).
   */
  scope?: "page" | "document";
};

export type LayoutMarkerStats = {
  /** Raised digit runs after text, in body-size lines, on pages with blocks. */
  raised: number;
  /** Of those, with a note to link to (scope) and in sequence. */
  candidates: number;
  linked: number;
  /** Candidates whose anchoring words were not found in the page's blocks. */
  unplaced: number;
  /** Every link made, with the text around it: for reading a sample against the page. */
  links: Array<{ volume: number; pdfIndex: number; note: number; context: string }>;
  /** Every candidate left unplaced, with the words it was looked for by. */
  misses: Array<{ volume: number; pdfIndex: number; note: number; anchor: string }>;
};

/** A line set this much smaller than the page's body is note text, a caption or a table. */
const BODY_SIZE_RATIO = 0.85;

type Unit = { block: Block; item?: number };

const textOf = (u: Unit): string =>
  u.block.kind === "list" ? u.block.items[u.item!] : "text" in u.block ? u.block.text : "";
const setText = (u: Unit, text: string) => {
  if (u.block.kind === "list") u.block.items[u.item!] = text;
  else if ("text" in u.block) (u.block as { text: string }).text = text;
};

/**
 * Folds the characters `pdftotext` and `pdftohtml` may spell differently
 * (curly quotes, dashes, ligatures, no-break spaces) and keeps, for each
 * character of the result, the index of the character it came from.
 */
export function foldForMatch(s: string): { text: string; from: number[] } {
  let text = "";
  const from: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const out =
      /[‘’‛′`]/.test(c) ? "'"
      : /[“”„″]/.test(c) ? '"'
      : /[‐‑‒–—―−]/.test(c) ? "-"
      : /[   \t]/.test(c) ? " "
      : c === "­" ? ""
      : c === "ﬁ" ? "fi"
      : c === "ﬂ" ? "fl"
      : c === "ﬀ" ? "ff"
      : c === "ﬃ" ? "ffi"
      : c === "ﬄ" ? "ffl"
      : c;
    for (const ch of out) {
      text += ch;
      from.push(i);
    }
  }
  from.push(s.length);
  return { text, from };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The words printed before a raised run, as a pattern: the last word, and the
 * one before it when the last is short ("$38.6 B", "Corp,"). A marker printed
 * just before it on the same line ("basis.261262", "purposes.14,15") may
 * already be linked by the time this one is looked for, so it matches either
 * way.
 */
function anchorPattern(before: string, earlier: Array<{ offset: number; text: string }>): string | undefined {
  const trimmed = before.trimEnd();
  const words = [...trimmed.matchAll(/\S+/g)];
  if (!words.length) return undefined;
  const letters = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length;
  const from = letters(words[words.length - 1][0]) < 4 && words.length > 1 ? words[words.length - 2].index! : words[words.length - 1].index!;
  const marks = earlier.filter((r) => r.offset >= from && r.offset + r.text.length <= trimmed.length);
  let out = "";
  let at = from;
  const plain = (s: string) =>
    foldForMatch(s)
      .text.split(/\s+/)
      .map(escape)
      .join("\\s+");
  for (const r of marks) {
    out += plain(trimmed.slice(at, r.offset));
    out += `(?:\\[\\^${r.text}(?:-\\d+)?\\]|${r.text})`;
    at = r.offset + r.text.length;
  }
  out += plain(trimmed.slice(at));
  return out || undefined;
}

/** Strictly increasing longest subsequence of `values` (indices, in order). */
function increasingRun(values: number[]): number[] {
  const n = values.length;
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (values[j] < values[i] && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
    }
  }
  let best = -1;
  for (let i = 0; i < n; i++) if (best < 0 || len[i] > len[best]) best = i;
  const out: number[] = [];
  for (let i = best; i >= 0; i = prev[i]) out.unshift(i);
  return out;
}

/** `glued`: another raised run follows with nothing between ("261262"), so a digit may follow in the text. */
type Candidate = { value: number; digits: string; anchor: string; glued: boolean };

/** One page's raised digit runs, in reading order, that may be markers. */
function pageCandidates(lines: LayoutLine[], bodySize: number): Candidate[] {
  const out: Candidate[] = [];
  for (const line of lines) {
    if (bodySize > 0 && line.size < BODY_SIZE_RATIO * bodySize) continue;
    for (const run of line.raised) {
      if (!/^[1-9]\d{0,3}$/.test(run.text) || run.offset <= 0) continue;
      const before = line.text.slice(0, run.offset);
      // A note's own number opens its line, possibly after a bullet's indent.
      if (!/[\p{L}\p{N}.,;:!?)\]'"’”%]\s*$/u.test(before)) continue;
      const anchor = anchorPattern(
        before,
        line.raised.filter((r) => r.offset < run.offset)
      );
      if (!anchor) continue;
      const glued = /\d/.test(line.text[run.offset + run.text.length] ?? "");
      out.push({ value: Number(run.text), digits: run.text, anchor, glued });
    }
  }
  return out;
}

/**
 * Finds `pattern` followed by the marker's digits in the page's text units,
 * from the cursor on; failing that, anywhere on the page if it occurs once.
 * Returns the unit and the digits' span in its original text.
 */
function locate(
  units: Unit[],
  cursor: { unit: number; pos: number },
  c: Candidate
): { unit: number; start: number; end: number } | undefined {
  const re = new RegExp(`${c.anchor}(\\s*)(${c.digits})${c.glued ? "(?=\\d)" : "(?![\\d\\]])"}`, "gu");
  const find = (u: number, fromPos: number) => {
    const folded = foldForMatch(textOf(units[u]));
    re.lastIndex = 0;
    const hits: Array<{ start: number; end: number }> = [];
    for (const m of folded.text.matchAll(re)) {
      const digitsAt = m.index! + m[0].length - c.digits.length;
      const start = folded.from[digitsAt];
      if (start < fromPos) continue;
      hits.push({ start, end: folded.from[digitsAt + c.digits.length - 1] + 1 });
    }
    return hits;
  };
  for (let u = cursor.unit; u < units.length; u++) {
    const hits = find(u, u === cursor.unit ? cursor.pos : 0);
    if (hits.length) return { unit: u, ...hits[0] };
  }
  const all: Array<{ unit: number; start: number; end: number }> = [];
  for (let u = 0; u < units.length; u++) for (const h of find(u, 0)) all.push({ unit: u, ...h });
  return all.length === 1 ? all[0] : undefined;
}

/**
 * Links the raised markers of every page in `blocks` (in place).
 *
 * With page-foot notes a marker cites a note collected on its own page, or on
 * the page either side (a note block the reader put on the wrong page) when
 * that page's own markers do not cite the same number: Leveson vol. 3 p.135's
 * notes 2 and 3 went unread, and p.136's notes 2 and 3 belong to p.136's
 * markers, not to them.
 */
export type MarkerNotes =
  /** Page-foot notes: the note numbers collected on each page. */
  | { scope: "page"; onPage: (volume: number, pdfIndex: number) => ReadonlySet<number> }
  /** Endnotes: every note number the report collected. */
  | { scope: "document"; known: ReadonlySet<number> }
  /**
   * Endnotes numbered afresh per chapter (`layoutEndnotes`): each block's chapter, and the
   * note numbers printed for it. A marker is linked `[^N-C]`; a block in no chapter links nothing.
   */
  | { scope: "chapter"; chapterOf: (block: Block) => { key: number; numbers: ReadonlySet<number> } | undefined };

export function linkLayoutMarkers(blocks: Block[], layout: Layout, notes: MarkerNotes): LayoutMarkerStats {
  const stats: LayoutMarkerStats = { raised: 0, candidates: 0, linked: 0, unplaced: 0, links: [], misses: [] };
  const pages = new Map<string, Unit[]>();
  for (const block of blocks) {
    if (!block.at || block.kind === "page" || block.kind === "contents") continue;
    const key = `${block.at.volume ?? 1}:${block.at.pdfIndex}`;
    if (!pages.has(key)) pages.set(key, []);
    const units = pages.get(key)!;
    if (block.kind === "list") block.items.forEach((_, item) => units.push({ block, item }));
    else units.push({ block });
  }

  const raisedCache = new Map<string, Candidate[]>();
  const raisedOn = (volume: number, pdfIndex: number): Candidate[] => {
    const key = `${volume}:${pdfIndex}`;
    let out = raisedCache.get(key);
    if (!out) {
      const page = layout.page(volume, pdfIndex);
      out = page ? pageCandidates(page.lines, Number(page.bodyFont.split("|")[1]) || 0) : [];
      raisedCache.set(key, out);
    }
    return out;
  };

  for (const [key, units] of pages) {
    const [volume, pdfIndex] = key.split(":").map(Number);
    if (!layout.page(volume, pdfIndex)) continue;
    const raised = raisedOn(volume, pdfIndex);
    stats.raised += raised.length;
    // A page's chapter is its first block's that has one (chapters open on a page of their own).
    const chapter = notes.scope === "chapter" ? units.map((u) => notes.chapterOf(u.block)).find(Boolean) : undefined;
    const cites = (n: number): boolean => {
      if (notes.scope === "chapter") return chapter?.numbers.has(n) ?? false;
      if (notes.scope === "document") return notes.known.has(n);
      if (notes.onPage(volume, pdfIndex).has(n)) return true;
      return [pdfIndex - 1, pdfIndex + 1].some(
        (q) => notes.onPage(volume, q).has(n) && !raisedOn(volume, q).some((c) => c.value === n)
      );
    };
    const withNote = raised.filter((c) => cites(c.value));
    const kept = increasingRun(withNote.map((c) => c.value)).map((i) => withNote[i]);
    stats.candidates += kept.length;

    const cursor = { unit: 0, pos: 0 };
    for (const c of kept) {
      const at = locate(units, cursor, c);
      if (!at) {
        stats.unplaced++;
        stats.misses.push({ volume, pdfIndex, note: c.value, anchor: c.anchor });
        continue;
      }
      const unit = units[at.unit];
      const text = textOf(unit);
      // Close up any space pdftotext put between the word and its marker.
      const head = text.slice(0, at.start).replace(/[ \t]+$/, "");
      const marker = chapter ? `[^${c.value}-${chapter.key}]` : `[^${c.value}]`;
      setText(unit, head + marker + text.slice(at.end));
      cursor.unit = at.unit;
      cursor.pos = head.length + marker.length;
      stats.linked++;
      const now = textOf(unit);
      stats.links.push({ volume, pdfIndex, note: c.value, context: now.slice(Math.max(0, head.length - 50), head.length + marker.length + 30) });
    }
  }
  return stats;
}

/**
 * Whether the layout shows a note being defined on this page: a line that opens
 * on a raised number (a footnote's own number, set like its marker) or on a
 * number in a face smaller than the body (a note set in the notes' size).
 * A contents page whose entries the page-foot reader took for notes ("1
 * Introduction 3" in the body's own face, nothing raised: Leveson's contents)
 * has neither.
 */
/**
 * `footnoteNumbers("period")`: whether the line that opens a page's note block ("104. Letter from…") is
 * set in the notes' smaller face. A body paragraph numbered the same way at the page foot (Hillsborough's
 * Appendix 1, "8. In all of the above cases, …") is in the body's face, and stays body. A line the layout
 * does not find is given the benefit of the doubt.
 */
export function inNoteFace(layout: Layout, volume: number, pdfIndex: number, line: string): boolean {
  const page = layout.page(volume, pdfIndex);
  if (!page) return true;
  const bodySize = Math.max(Number(page.bodyFont.split("|")[1]) || 0, layout.bodyFont.size);
  const key = (text: string) => text.replace(/\s+/g, "").slice(0, 24);
  const want = key(line);
  const hit = page.lines.find((l) => key(l.text) === want || (want.length >= 12 && key(l.text).startsWith(want.slice(0, 12))));
  if (!hit || bodySize <= 0) return true;
  return hit.size < BODY_SIZE_RATIO * bodySize;
}

export function pageDefinesNotes(layout: Layout, volume: number, pdfIndex: number): boolean {
  const page = layout.page(volume, pdfIndex);
  if (!page) return true;
  // (a page that is mostly notes takes their face for its body: measure against the document's too)
  const bodySize = Math.max(Number(page.bodyFont.split("|")[1]) || 0, layout.bodyFont.size);
  return page.lines.some(
    (l) =>
      l.raised.some((r) => r.offset === 0 && /^\d/.test(r.text)) ||
      (bodySize > 0 && l.size < BODY_SIZE_RATIO * bodySize && /^\s*\d{1,4}(?:\s|$)/.test(l.text))
  );
}
