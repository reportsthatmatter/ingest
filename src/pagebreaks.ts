import { createHash } from "node:crypto";

import type { Layout, LayoutLine, PageLayout } from "./layout";

/**
 * Page-break joins decided from the PDF's layout (reportsthatmatter-38s.10,
 * from the 38s.8 aligned-pair study, rules R1 and R2).
 *
 * Each page is parsed on its own, so a paragraph running over the foot of a
 * page arrives as two. `mergeAcrossPages` rejoins them on text alone: a
 * lower-case opening, or a page foot ending on an abbreviation. Text alone
 * cannot see the commonest run-ons, which open on a capital ("…now Senior
 * Vice President for" / "Marketing at Philip Morris…"), a digit or a bracket
 * (a citation string), or follow a full stop (a paragraph running on past a
 * sentence that happens to end the page). The layout can:
 *
 * - **R1**: the old page's last line does not end a sentence, and the new
 *   page's first line is *flush* with the line under it on the same page (no
 *   first-line indent: |indent| < 0.6 em) or opens in lower case; it does not
 *   open on a label ("57.", "(b)", "9.88", "•"); and the font does not change
 *   across the break.
 * - **R2**: the old page's last line ends a sentence, but the page is set
 *   justified, that line runs to the right margin (within 0.5 em), and the
 *   new page's first line is flush, unlabelled, in the same font and longer
 *   than four words.
 *
 * A first line compared with the line under it on its own page, not with the
 * old page: verso and recto text blocks can sit at different lefts (Saville).
 *
 * Deterministic: the same layout and text give the same decision. Each
 * decision carries a `confidence`: `low` (near a threshold: `ambiguous`),
 * `medium` (a call the layout makes but the words could overturn: a flush
 * first line after a finished sentence, a layout-only label after an
 * unfinished one) or `high`. An optional referee (38s.11) is consulted on the
 * `low` calls, or on `low` and `medium` with `refer: "medium"`; without one
 * the rules stand.
 */

/** |first-line indent| below this, in ems, is flush. */
export const FLUSH_EM = 0.6;
/** Right gap below this, in ems, runs to the margin. */
export const FULL_LINE_EM = 0.5;
/** A page whose lines' median right gap is below this, in ems, is justified. */
export const JUSTIFIED_EM = 0.5;
/** R2's next line must be longer than this, in words. */
export const R2_MIN_WORDS = 4;
/**
 * R1 does not join after a line that stops this many ems short of the right
 * margin: a ragged-right page's prose stays within it (Saville's, PSI's
 * widest gaps are under 5), a list, index or timeline entry does not.
 */
export const SHORT_LINE_EM = 5;
/** An indent within this of `FLUSH_EM`, in ems, is a low-margin call. */
const MARGIN_EM = 0.25;

export type PageBreakLines = {
  /** The last line of the paragraph left at the foot of the old page. */
  prev: LayoutLine;
  /** The first line of the block opening the new page. */
  next: LayoutLine;
  /** The line under `next` on the same page, when there is one. */
  under?: LayoutLine;
  /** Whether `under` carries on the block's own text (the block has a second line on this page). */
  underContinues: boolean;
  /** The old page's layout (for whether it is set justified). */
  prevPage: PageLayout;
};

export type PageBreakOptions = {
  /** The PDF is a scan read through its OCR layer: a line's size may be a point off its neighbour's. */
  scanned?: boolean;
  /** A second opinion on the low-margin calls. */
  referee?: PageBreakReferee;
  /**
   * Which calls the referee is asked about: `low` (the default: the
   * ambiguous ones) or `medium` (those and the medium-confidence ones).
   */
  refer?: "low" | "medium";
};

export type PageBreakConfidence = "high" | "medium" | "low";

export type PageBreakDecision = {
  join: boolean;
  /** Which rule joined, or why not. */
  rule: "R1" | "R2" | "split";
  reason: string;
  /** The first-line indent of `next` against `under`, in ems (undefined without `under`). */
  indentEm?: number;
  /**
   * A low-margin call: the indent is within a quarter em of the flush
   * threshold, the decision rests on R2, or the line under is not the
   * block's own. A referee, when one is supplied, decides these.
   */
  ambiguous: boolean;
  /** `low` exactly when `ambiguous`; `medium` for a call the words could overturn; else `high`. */
  confidence: PageBreakConfidence;
};

/** One page-break pair, as a referee sees it. */
export type PageBreakCase = {
  /** Stable key: a hash of the two lines' text. A cache of answers is keyed by it. */
  key: string;
  /** The paragraph at the foot of the old page (its whole text). */
  prevText: string;
  /** The block opening the new page (its whole text). */
  nextText: string;
  lines: PageBreakLines;
  /** What the rules decided. */
  decision: PageBreakDecision;
};

/**
 * An optional referee for the low-margin calls (38s.11): answers `true`
 * (join), `false` (split) or `undefined` (no answer: the rules stand). It
 * must be deterministic, which in practice means reading a committed cache
 * keyed by `PageBreakCase.key`, never calling out while ingesting.
 */
export type PageBreakReferee = (pageBreak: PageBreakCase) => boolean | undefined;

const SENTENCE_END = /[.?!:;]["'”’)\]]*$/;
const ABBREVIATION =
  /\b(mr|mrs|ms|dr|prof|sen|rep|gov|st|nos?|vs?|inc|co|corp|ltd|jr|sr|u\.s|e\.g|i\.e|cf|ch|art|sec|fig|para|pp?|ecf|tr)\.$/i;
const INITIAL = /\b[A-Z]\.$/;

/**
 * Same test as `endsSentence` in paragraphs.ts, kept here so this module
 * stands alone, except that a footnote marker after the stop does not hide
 * it: "…contact the flight.46" ends a sentence (the pipeline links markers
 * later, so here they are still bare digits).
 */
function endsSentence(text: string): boolean {
  const t = text.trim().replace(/([.?!:;]["'\u201d\u2019)\]]*)\s?(?:\d{1,4}|\[\^[\w-]{1,12}\])$/, "$1");
  if (!SENTENCE_END.test(t)) return false;
  return !(ABBREVIATION.test(t) || INITIAL.test(t));
}

/**
 * "57." "(b)" "9.88" "7.44" "•" "b." "iv." "A." at the head of a block of
 * text. A bare number ("1972 and to mount…") is not a label: it is the
 * commonest digit continuation.
 */
const TEXT_LABEL = /^(?:\d{1,4}(?:\.\d{1,4})+[.)]?\s|\d{1,4}[.)]\s|\(?(?:[a-z]|[ivxlc]{1,5})[.)]\s|\([a-z0-9]{1,4}\)\s|[A-Z]\.\s|[•·▪●○◦■□➢►–-]\s?)/;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * The same face either side of the break: family, colour, weight and slant,
 * and size. On a scan (`scanned`) the size may differ by a point: an OCR text
 * layer sizes each line from its own glyphs, 16 and 17 on one page. On a
 * born-digital page it may not: 9/11 sets its map captions one point under
 * the body.
 */
export function sameFace(a: LayoutLine, b: LayoutLine, scanned = false): boolean {
  return (
    a.family === b.family &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    Math.abs(a.size - b.size) <= (scanned ? SCAN_SIZE_TOLERANCE : SIZE_TOLERANCE)
  );
}
/** Born-digital: the same size (a caption one point under the body is another face). */
const SIZE_TOLERANCE = 0.25;
/** A scan's OCR layer: within a point. */
const SCAN_SIZE_TOLERANCE = 1;

/** Lower case (or `,` `;`): text alone already says it continues. */
const LOWER = /^[a-z,;]/;

/** Whether a page is set justified: the median right gap of its body lines of some length. */
export function isJustified(page: PageLayout): boolean {
  const gaps = page.lines
    .filter((l) => l.body && l.text.trim().length >= 30)
    .map((l) => Math.abs(l.rightGapEm))
    .sort((a, b) => a - b);
  if (gaps.length < 5) return false;
  return gaps[Math.floor(gaps.length / 2)] < JUSTIFIED_EM;
}

/**
 * The rules, on the lines either side of one page break. Pure: the test seam.
 * `prevText` and `nextText` are the blocks' text as the pipeline read them
 * (the sentence-end and label tests read those, not the layout's text).
 */
export function decidePageBreak(
  lines: PageBreakLines,
  prevText: string,
  nextText: string,
  options: PageBreakOptions = {}
): PageBreakDecision {
  const { prev, next, under } = lines;
  const decided = (d: Omit<PageBreakDecision, "confidence" | "ambiguous">, confidence: PageBreakConfidence): PageBreakDecision => ({
    ...d,
    ambiguous: confidence === "low",
    confidence,
  });
  const finished = endsSentence(prevText);
  if (TEXT_LABEL.test(nextText.trim())) return decided({ join: false, rule: "split", reason: "next opens on a label" }, "high");
  // The layout's own label test also takes a bare number and a space ("24 hours”,2 and…", Saville p.302):
  // after an unfinished sentence that may be the sentence running on.
  if (next.label) return decided({ join: false, rule: "split", reason: "next opens on a label (layout)" }, finished ? "high" : "medium");
  if (!sameFace(prev, next, options.scanned)) return decided({ join: false, rule: "split", reason: "font changes across the break" }, "high");
  const indentEm = under && next.size > 0 ? Math.round(((next.left - under.left) / next.size) * 100) / 100 : undefined;
  const flush = indentEm !== undefined && Math.abs(indentEm) < FLUSH_EM;
  const near = indentEm !== undefined && Math.abs(Math.abs(indentEm) - FLUSH_EM) < MARGIN_EM;
  const shaky = near || !lines.underContinues;
  if (!finished) {
    // A line that stops well short of the margin without ending a sentence is
    // a list's or an index's entry, a date line or a map label, not prose run
    // over the page: "June 25, 2001–September 4, 2001" / "Thomas Pickering".
    if (flush && Math.abs(prev.rightGapEm) >= SHORT_LINE_EM) {
      return decided({ join: false, rule: "split", reason: "unfinished, but a short last line", indentEm }, "low");
    }
    if (flush) return decided({ join: true, rule: "R1", reason: "unfinished, next line flush", indentEm }, shaky ? "low" : "high");
    if (LOWER.test(nextText.trim())) return decided({ join: true, rule: "R1", reason: "unfinished, next opens lower case", indentEm }, "high");
    return decided(
      {
        join: false,
        rule: "split",
        reason: indentEm === undefined ? "unfinished, no line under next" : "unfinished, next line indented",
        indentEm,
      },
      indentEm === undefined || near ? "low" : "high"
    );
  }
  const justified = isJustified(lines.prevPage);
  const full = Math.abs(prev.rightGapEm) < FULL_LINE_EM;
  if (justified && full && flush && words(next.text) > R2_MIN_WORDS) {
    return decided({ join: true, rule: "R2", reason: "finished, but a full justified line and a flush next line", indentEm }, "low");
  }
  // A finished sentence and a flush first line in the same face: a new paragraph in a document that sets
  // them flush, or the paragraph running on (Saville p.162, p.487; Chilcot p.112). Only the words can say.
  return decided({ join: false, rule: "split", reason: flush ? "finished, next line flush" : "finished", indentEm }, flush ? "medium" : "high");
}

/**
 * Letters only, lower case, ligatures and diacritics folded: the two texts
 * compare equal. Digits are left out because a footnote marker is a digit run
 * whose place differs between the two readings ("Hazmi.11").
 */
export function letters(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** A line's text, compared against a block's, has to be at least this long to count as found. */
const MIN_MATCH = 6;

/**
 * Finds the layout lines either side of a page break: the paragraph's last
 * line on the old page (searched on the pages before the new one, latest
 * first) and the block's first line on the new page, by their text. Returns
 * undefined when either cannot be found, which leaves the pair to the text
 * rules.
 */
export function findPageBreakLines(
  layout: Layout,
  prevText: string,
  nextText: string,
  at: { volume?: number; pdfIndex: number }
): PageBreakLines | undefined {
  const volume = at.volume ?? 1;
  const head = letters(nextText.slice(0, 600));
  const tail = letters(prevText.slice(-600));
  if (head.length < MIN_MATCH || tail.length < MIN_MATCH) return undefined;

  const nextLines = layout.lines(volume, at.pdfIndex);
  let nextIdx = -1;
  for (let i = 0; i < nextLines.length; i++) {
    const n = letters(nextLines[i].text);
    if (n.length >= MIN_MATCH ? head.startsWith(n) : n.length > 0 && head === n) {
      nextIdx = i;
      break;
    }
  }
  if (nextIdx === -1) return undefined;
  const next = nextLines[nextIdx];

  // The line under it: below, overlapping it across the page, within two and a half lines
  // (a pitch and a half on a double-spaced page).
  const pitch = layout.page(volume, at.pdfIndex)?.pitch ?? 0;
  const reach = Math.max(2.5 * Math.max(next.height, 1), 1.5 * pitch);
  let under: LayoutLine | undefined;
  for (let i = nextIdx + 1; i < nextLines.length; i++) {
    const l = nextLines[i];
    if (l.top <= next.top) continue;
    if (l.top - next.top > reach) continue;
    if (l.left > next.right || l.right < next.left) continue;
    under = l;
    break;
  }
  const rest = head.slice(letters(next.text).length);
  const underContinues = under !== undefined && letters(under.text).length > 0 && rest.startsWith(letters(under.text));

  // The old page: the nearest earlier page that carries the paragraph's last line.
  const pages = layout.pages(volume);
  const candidates: Array<[number, number]> = [];
  const here = pages.indexOf(at.pdfIndex);
  for (let k = here - 1; k >= 0 && k >= here - 3; k--) candidates.push([volume, pages[k]]);
  if (here <= 0 && volume > 1) {
    const before = layout.pages(volume - 1);
    if (before.length) candidates.push([volume - 1, before[before.length - 1]]);
  }
  for (const [v, p] of candidates) {
    const lines = layout.lines(v, p);
    for (let i = lines.length - 1; i >= 0; i--) {
      const n = letters(lines[i].text);
      if (n.length < MIN_MATCH && n !== tail) continue;
      if (!tail.endsWith(n)) continue;
      const prevPage = layout.page(v, p);
      if (!prevPage) return undefined;
      return { prev: lines[i], next, under, underContinues, prevPage };
    }
  }
  return undefined;
}

/** The key a referee's cache is read by: the two lines' text, hashed. */
export function pageBreakKey(prev: string, next: string): string {
  return createHash("sha256").update(`${prev.trim()}\n${next.trim()}`).digest("hex").slice(0, 16);
}

/**
 * Whether a paragraph left at the foot of one page and a paragraph opening
 * the next are one paragraph, by the layout rules (and the referee, on a
 * low-margin call, when one is supplied). False when the lines cannot be
 * found in the layout.
 */
export function layoutJoins(
  layout: Layout,
  prevText: string,
  nextText: string,
  at: { volume?: number; pdfIndex: number },
  options: PageBreakOptions = {}
): boolean {
  const lines = findPageBreakLines(layout, prevText, nextText, at);
  if (!lines) return false;
  const decision = decidePageBreak(lines, prevText, nextText, options);
  const refer = decision.confidence === "low" || (decision.confidence === "medium" && options.refer === "medium");
  if (options.referee && refer) {
    const answer = options.referee({
      key: pageBreakKey(lines.prev.text, lines.next.text),
      prevText,
      nextText,
      lines,
      decision,
    });
    if (answer !== undefined) return answer;
  }
  return decision.join;
}

const CAPTION = /^(?:figure|fig\.|table|chart|map|photo|source|image|exhibit|box|graph|diagram)\b/i;

/**
 * Whether a block left on a page is not set in the body face: the run-over of
 * a footnote that began on the page before (no number of its own), which the
 * page's parse read as a paragraph of the body (Lehman PDF p.59, 
 * reportsthatmatter-j6qm). Found by the block's text against the page's
 * lines; false when the lines cannot be found.
 */
export function isOffFaceBlock(layout: Layout, text: string, at: { volume?: number; pdfIndex: number }): boolean {
  // A figure's or table's caption is off the body face too, and what follows it
  // on the next page may be chart debris, not the paragraph's rest (Columbia).
  if (CAPTION.test(text.trim())) return false;
  const head = letters(text.slice(0, 200));
  if (head.length < MIN_MATCH) return false;
  for (const line of layout.lines(at.volume ?? 1, at.pdfIndex)) {
    const n = letters(line.text);
    if (n.length >= MIN_MATCH && head.startsWith(n)) return !line.body;
  }
  return false;
}
