import type { Block } from "./paragraphs";

/**
 * Printed paragraph numbers must not reach Markdown as list markers
 * (reportsthatmatter-mv1t; Chilcot 4qw, Deepwater, Hillsborough woke, Lehman xqu).
 *
 * A paragraph that opens "20. The Inquiry…" or "2008) was 16.1x…" is an
 * ordered-list item to Markdown: it renders as an `<li>` with no paragraph id,
 * so it cannot be cited, and a list of non-consecutive numbers is renumbered.
 * `escapeNumberedParagraphs` fixed this for one report that opted in; this is
 * the default, decided from the text itself, so no report has to notice.
 *
 * What counts as a printed paragraph number, over the document's paragraph
 * blocks in reading order:
 *
 * 1. A run of blocks numbered in sequence ("1." then "2." …, allowing a number
 *    to be missing and a few continuation blocks between members), in which at
 *    least 60% of the items (40% in a run of ten or more) read as prose and
 *    average ten words or more: they open on a capital, run to
 *    eight words or more, close a sentence (or run to twenty words, for a
 *    paragraph split at a page break) and do not end ";" (or "," in under twenty words). Each gets its number
 *    escaped ("1\. …"); a short unpunctuated fragment inside the run is left alone.
 * 2. A single numbered block that is a long prose paragraph (100+ characters).
 * 3. A single numbered block whose number is year-like (1900-2099), or whose
 *    text opens lower-case after an unfinished paragraph: a page-break or
 *    line-wrap continuation, not a list.
 *    Where the block before it is an unfinished paragraph (no closing
 *    punctuation, or an open bracket) and the number is year-like, the two are
 *    joined: "(second quarter" + "2008) was 16.1x" is one sentence.
 *
 * A genuine list stays a list: short items ("1. Visits", "3. Powers and
 * remedies"), fragments that run on from a lead-in ("1. fundamental changes in
 * …;") and runs whose items do not read as prose are left for Markdown. The
 * decision is made per run, so one report may have both.
 */

const NUMBERED = /^(\d{1,4})([.)])\s+(\S[\s\S]*)$/;
const MAX_SKIP = 3;
const MAX_GAP_BLOCKS = 12;
const PROSE_SHARE = 0.6;
/** A long unbroken sequence is numbering whatever its items look like: it needs fewer prose items to say so. */
/** Terse notes ("Keep in Cologne.") can pass the share test by luck; numbered paragraphs average more than this. */
const MEAN_WORDS = 10;
const LONG_RUN = 10;
const LONG_RUN_SHARE = 0.4;
const LONG_SINGLE = 100;

const yearLike = (n: number): boolean => n >= 1900 && n <= 2099;

function readsAsProse(rest: string, runsOn = false): boolean {
  if (/^[a-z]/.test(rest)) return false;
  const words = rest.split(/\s+/).length;
  if (/;\s*$/.test(rest) || (/,\s*$/.test(rest) && words < 20)) return false;
  // A sentence ends; a wrapped or page-split paragraph is long. A timeline's
  // "January 18: Object reacquired and tracked by Cape" is neither.
  return words >= 8 && (runsOn || /[.!?"”’)]\s*$/.test(rest) || words >= 20);
}

/** Fewer than eight words and no closing punctuation: a heading or label, not a paragraph. */
const isFragment = (rest: string): boolean => rest.split(/\s+/).length < 8 && !/[.!?:"”’)]\s*$/.test(rest);

/** No closing punctuation, or a bracket left open: the paragraph is unfinished. */
function unfinished(text: string): boolean {
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  return opens > closes || !/[.!?:;"”’)\]]\s*$/.test(text);
}

/** `runsOn`: the next block is an unnumbered paragraph, so this one was cut mid-paragraph (a page break or a wrapped line). */
type Member = { index: number; n: number; rest: string; runsOn: boolean };

export function markPrintedNumbers(blocks: Block[]): Block[] {
  const runs: Member[][] = [];
  let cur: Member[] | undefined;
  let gap = 0;
  blocks.forEach((block, index) => {
    if (block.kind === "page") return;
    const m = block.kind === "paragraph" && block.finding === undefined ? NUMBERED.exec(block.text) : null;
    if (!m) {
      gap++;
      return;
    }
    const n = Number(m[1]);
    const following = blocks.slice(index + 1).find((b) => b.kind !== "page");
    const runsOn = following?.kind === "paragraph" && !NUMBERED.test(following.text);
    const last = cur?.[cur.length - 1]?.n;
    if (cur && last !== undefined && n > last && n <= last + 1 + MAX_SKIP && gap <= MAX_GAP_BLOCKS && !yearLike(n)) {
      cur.push({ index, n, rest: m[3], runsOn });
    } else {
      cur = [{ index, n, rest: m[3], runsOn }];
      runs.push(cur);
    }
    gap = 0;
  });

  const escape = new Set<number>();
  const joinInto = new Set<number>();
  for (const run of runs) {
    if (run.length === 1) {
      const { index, n, rest, runsOn: cut } = run[0];
      const prev = blocks[index - 1];
      const here = blocks[index];
      const joins =
        prev?.kind === "paragraph" && here.kind === "paragraph" && !prev.hardBreak && !here.hardBreak && unfinished(prev.text);
      if (yearLike(n) && joins) joinInto.add(index);
      else if (yearLike(n) || (/^[a-z]/.test(rest) && joins) || (readsAsProse(rest, cut) && rest.length >= LONG_SINGLE)) {
        escape.add(index);
      }
      continue;
    }
    const prose = run.filter((member) => readsAsProse(member.rest, member.runsOn)).length;
    const meanWords = run.reduce((sum, member) => sum + member.rest.split(/\s+/).length, 0) / run.length;
    if (meanWords >= MEAN_WORDS && prose / run.length >= (run.length >= LONG_RUN ? LONG_RUN_SHARE : PROSE_SHARE)) {
      // A heading-like fragment inside the run ("2. Fairness and objectivity of Standards") stays as it was.
      for (const member of run) if (!isFragment(member.rest)) escape.add(member.index);
    }
  }
  if (escape.size === 0 && joinInto.size === 0) return blocks;

  const out: Block[] = [];
  blocks.forEach((block, index) => {
    const target = out[out.length - 1];
    if (joinInto.has(index) && target?.kind === "paragraph" && block.kind === "paragraph") {
      out[out.length - 1] = { ...target, text: `${target.text} ${block.text}` };
      return;
    }
    if (escape.has(index) && block.kind === "paragraph") out.push({ ...block, printedNumber: true });
    else out.push(block);
  });
  return out;
}
