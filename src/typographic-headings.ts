import type { Layout, LayoutLine } from "./layout";
import { foldForMatch } from "./markers";
import type { Block } from "./paragraphs";

/**
 * `typographicHeadings` (reportsthatmatter-a8l): subsection headings read off the PDF's typography,
 * where the text reading ran them into the paragraph after them.
 *
 * `pdftotext -layout` sets a heading on a line of its own, but the block parser only knows a heading
 * by its text (listed in the contents, numbered, all capitals). A heading set only by face and size,
 * as in Hillsborough ("Recognition of the disaster" in 26pt maroon, then paragraph 2.4.20), comes out
 * as the first words of the next paragraph. The layout has what the text lacks: the line's size,
 * weight and colour. This pass finds the heading lines in it and cuts each out of the block that
 * swallowed it.
 *
 * What is a heading line: set larger than the body (`minRatio`, 1.15 times), not in the body's face,
 * not italic (captions), short, not a bare number, not ending a sentence. A face (family, size, weight,
 * colour) counts only when it recurs, on enough pages, so a title page's one-off lines are not a
 * heading style. The faces are ranked by size and the largest takes `firstLevel`, each smaller one
 * level deeper.
 *
 * Opt-in, and for a report whose headings are not marked by their text. It never touches a block that
 * is already a heading, and it does not need the PDF to be tagged: it reads what every PDF has, so it
 * serves any hybrid whose stretches come from the PDF (the gaps `fillGaps` fills).
 */
export type TypographicHeadingsOptions = {
  /** Level of the largest heading face; each smaller face is one level deeper. Default 2. */
  firstLevel?: number;
  /**
   * The heading sizes in points, largest first: only lines set at one of them (within half a point) are
   * headings, the first at `firstLevel`, the next one level deeper. Omitted, every face that qualifies
   * is one, ranked by size. Declare it where the largest face is not a subsection heading
   * (Hillsborough's 35pt is the title of a part or chapter, which its other passes read).
   */
  sizes?: number[];
  /** A heading line is at least this many times the body's size. Default 1.15. */
  minRatio?: number;
  /** Longest heading, in characters. Default 160. */
  maxChars?: number;
  /** A face must be set on at least this many pages to be a heading style. Default 3. */
  minPages?: number;
  /** ... and be at least this many lines. Default 5. */
  minLines?: number;
  /**
   * The heading faces themselves, one list per level from `firstLevel` down, each a layout face key
   * (`family|size|color`, then `|b`, `|i`, as `pnpm ingest page` prints them). Declared, these faces
   * and no others are headings, whatever their size, weight or slant and however often they recur:
   * for a report whose levels are not told apart by size alone. The Post Office Horizon IT Inquiry sets
   * its subsections in 18 to 20pt bold (one 20pt in Open Sans, one in Roboto, the rest 18pt) and the
   * topics under them in 18pt italic, against a 17pt body, so `sizes` can neither group the first nor
   * tell the 18pt bold from the 18pt italic. The other tests (short, not a bare label, not ending a
   * sentence) still apply. Overrides `sizes`, `minRatio`, `minPages` and `minLines`.
   */
  faces?: string[][];
  /**
   * A block the text reading already made a heading, at another level than the face declares, takes
   * the face's level. The Grenfell Tower Inquiry's executive summary heads its account of each Part
   * "Part 3 / The testing and marketing of products (Chapters 15 – 29)" in the face of its subsections;
   * read by its text as a division ("Part 3:"), each became a top-level section beside the volume's own
   * Parts 1 and 2. Matched on letters and digits only, since the division reading adds a colon. Only
   * with `faces`. Default false.
   */
  relevel?: boolean;
  /**
   * A heading set at the head of a block the text reading made a quotation (its bold, inset first line
   * opens one) leaves the paragraph below it as a quotation of one or two lines and the rest of the
   * paragraph as a block of its own, cut where the quotation's lines stop: PSI's "(3) Examination
   * Process" (PDF p.174) and the ~30 subheads like it. With this the remainder joins the paragraph
   * that follows it when it stops short of a sentence's end (reportsthatmatter-bi5), and is a paragraph.
   * Opt-in: a quotation that really follows a heading would stop at a sentence's end, but the reading
   * is the layout's, so the report that has checked it declares it. Default false.
   */
  quotedRemainder?: boolean;
};

export type TypographicHeadingStats = {
  /** Heading faces found, largest first, with the level each was given. */
  faces: Array<{ face: string; level: number; lines: number; pages: number }>;
  /** Heading lines the layout showed (a heading wrapped over lines counts once). */
  headings: number;
  /** Cut out of a block that ran the heading into its text. */
  split: number;
  /** Already a heading block (left alone, or re-levelled under `relevel`). */
  already: number;
  /** Of those, given the face's level under `relevel`. */
  relevelled?: number;
  /** Not found in any block of the page. */
  unplaced: number;
  misses: Array<{ volume: number; pdfIndex: number; text: string }>;
  /** Each heading added, for review. */
  added: Array<{ volume: number; pdfIndex: number; level: number; text: string; before: string; after: string }>;
};

/** A block that ends a sentence (or opens a list: a colon). */
const SENTENCE_STOP = /[.!?:;][”’'")\]]*\s*$|[”"]\s*$/;
const SENTENCE_END = /[.,;:]$|[.,;:][”’'")\]]$/;
/** A bare number or paragraph label ("2.4.20", "(b)"): never a heading. */
const LABEL_ONLY = /^\s*(?:\(?\d{1,4}(?:\.\d{1,4})*[.)]?|\(?[a-z][.)]|[ivxlc]{1,5}[.)]|[•·▪–-])\s*$/i;

type Heading = { volume: number; pdfIndex: number; text: string; level: number };

/** A heading line's candidacy, before the face's recurrence is known. */
function candidate(line: LayoutLine, bodySize: number, o: Required<Omit<TypographicHeadingsOptions, "sizes" | "faces" | "relevel" | "quotedRemainder">> & { sizes?: number[]; faces?: string[][] }): boolean {
  const text = line.text.trim();
  if (!text || text.length > o.maxChars) return false;
  if (o.faces) return o.faces.some((level) => level.includes(line.font)) && !LABEL_ONLY.test(text) && /\p{L}/u.test(text) && !SENTENCE_END.test(text);
  if (line.body || line.italic) return false;
  if (bodySize <= 0 || line.size < o.minRatio * bodySize) return false;
  if (LABEL_ONLY.test(text) || !/\p{L}/u.test(text)) return false;
  if (SENTENCE_END.test(text)) return false;
  if (o.sizes && !o.sizes.some((size) => Math.abs(size - line.size) <= 0.5)) return false;
  return true;
}

/** The face key without a bold marker's suffix order mattering: `family|size|color[|b]`. */
const faceSize = (face: string) => Number(face.split("|")[1]) || 0;

/**
 * The heading lines of the layout, wrapped lines joined, each with its level.
 * Exported for the tests.
 */
export function layoutHeadings(layout: Layout, options: TypographicHeadingsOptions = {}): { headings: Heading[]; faces: TypographicHeadingStats["faces"] } {
  const o: Required<Omit<TypographicHeadingsOptions, "sizes" | "faces" | "relevel" | "quotedRemainder">> & { sizes?: number[]; faces?: string[][] } = {
    firstLevel: options.firstLevel ?? 2,
    ...(options.sizes ? { sizes: options.sizes } : {}),
    ...(options.faces ? { faces: options.faces } : {}),
    minRatio: options.minRatio ?? 1.15,
    maxChars: options.maxChars ?? 160,
    minPages: options.minPages ?? 3,
    minLines: options.minLines ?? 5,
  };
  // candidates by face, with the pages each face is set on
  const byFace = new Map<string, { lines: number; pages: Set<string> }>();
  const perPage: Array<{ volume: number; page: number; lines: LayoutLine[]; cands: LayoutLine[] }> = [];
  for (let volume = 1; volume <= layout.volumes; volume++) {
    for (const page of layout.pages(volume)) {
      const lines = layout.lines(volume, page);
      const pageBody = Number(layout.page(volume, page)?.bodyFont.split("|")[1]) || 0;
      const bodySize = Math.max(pageBody, layout.bodyFont.size);
      const cands = lines.filter((l) => candidate(l, bodySize, o));
      perPage.push({ volume, page, lines, cands });
      for (const l of cands) {
        const entry = byFace.get(l.font) ?? { lines: 0, pages: new Set<string>() };
        entry.lines++;
        entry.pages.add(`${volume}:${page}`);
        byFace.set(l.font, entry);
      }
    }
  }
  const ranked = [...byFace]
    .filter(([, e]) => o.faces || (e.lines >= o.minLines && e.pages.size >= o.minPages))
    .sort((a, b) => faceSize(b[0]) - faceSize(a[0]) || Number(b[0].endsWith("|b")) - Number(a[0].endsWith("|b")) || b[1].lines - a[1].lines);
  // (declared sizes fix the levels; otherwise the faces that qualified are ranked)
  const rank = (face: string, i: number) =>
    o.faces
      ? o.faces.findIndex((level) => level.includes(face))
      : o.sizes
        ? o.sizes.findIndex((size) => Math.abs(size - faceSize(face)) <= 0.5)
        : i;
  const levels = new Map(ranked.map(([face], i) => [face, Math.min(6, o.firstLevel + rank(face, i))]));
  const faces = ranked.map(([face, e]) => ({ face, level: levels.get(face)!, lines: e.lines, pages: e.pages.size }));

  const headings: Heading[] = [];
  for (const { volume, page, lines, cands } of perPage) {
    const heading = cands.filter((l) => levels.has(l.font));
    // consecutive lines of one face, one line-height apart, are one wrapped heading
    for (let i = 0; i < heading.length; i++) {
      const first = heading[i];
      let text = first.text.trim();
      let last = first;
      while (i + 1 < heading.length) {
        const next = heading[i + 1];
        const adjacent = lines.indexOf(next) === lines.indexOf(last) + 1;
        if (next.font !== first.font || !adjacent || next.top - last.top > 1.8 * last.height) break;
        text += ` ${next.text.trim()}`;
        last = next;
        i++;
      }
      headings.push({ volume, pdfIndex: page, text, level: levels.get(first.font)! });
    }
  }
  return { headings, faces };
}

/** The text without spaces and with the spelling variants folded, and each character's index in the original. */
function squash(s: string): { text: string; from: number[] } {
  const folded = foldForMatch(s);
  let text = "";
  const from: number[] = [];
  for (let i = 0; i < folded.text.length; i++) {
    if (/\s/.test(folded.text[i])) continue;
    text += folded.text[i].toLowerCase();
    from.push(folded.from[i]);
  }
  return { text, from };
}

const SPLITTABLE = (b: Block): b is Extract<Block, { kind: "paragraph" | "quote" }> => b.kind === "paragraph" || b.kind === "quote";

/**
 * Cuts each heading the layout shows out of the blocks of its page, in place. A block that opens on
 * the heading's words, or holds them after the end of a sentence, becomes (the text before it), the
 * heading, and (the text after it). A block that is already that heading stays as it is.
 */
export function applyTypographicHeadings(blocks: Block[], layout: Layout, options: TypographicHeadingsOptions = {}): TypographicHeadingStats {
  const { headings, faces } = layoutHeadings(layout, options);
  const stats: TypographicHeadingStats = { faces, headings: headings.length, split: 0, already: 0, unplaced: 0, misses: [], added: [] };
  const pageOf = (b: Block) => (b.at ? `${b.at.volume ?? 1}:${b.at.pdfIndex}` : undefined);
  const byPage = new Map<string, Heading[]>();
  for (const h of headings) {
    const key = `${h.volume}:${h.pdfIndex}`;
    byPage.set(key, [...(byPage.get(key) ?? []), h]);
  }

  const out: Block[] = [];
  let i = 0;
  while (i < blocks.length) {
    const key = pageOf(blocks[i]);
    if (!key || !byPage.has(key)) {
      out.push(blocks[i++]);
      continue;
    }
    // this page's run of blocks
    let j = i;
    while (j < blocks.length && pageOf(blocks[j]) === key) j++;
    const pageBlocks = blocks.slice(i, j);
    const todo = byPage.get(key)!;
    out.push(...cutPage(pageBlocks, todo, stats, Boolean(options.relevel && options.faces), Boolean(options.quotedRemainder)));
    i = j;
  }
  blocks.splice(0, blocks.length, ...out);
  return stats;
}

const alnum = (s: string) => squash(s).text.replace(/[^\p{L}\p{N}]/gu, "");

function cutPage(pageBlocks: Block[], todo: Heading[], stats: TypographicHeadingStats, relevel = false, quotedRemainder = false): Block[] {
  let units = pageBlocks;
  let from = 0; // blocks before this index are done: headings run in reading order
  for (const h of todo) {
    const want = squash(h.text).text;
    const miss = () => {
      stats.unplaced++;
      stats.misses.push({ volume: h.volume, pdfIndex: h.pdfIndex, text: h.text });
    };
    if (want.length < 3) {
      miss();
      continue;
    }
    let placed = false;
    for (let k = from; k < units.length && !placed; k++) {
      const block = units[k];
      if (block.kind === "heading") {
        const have = squash(block.text).text;
        const loose = relevel && alnum(block.text).length >= 3 && (alnum(block.text).startsWith(alnum(h.text)) || alnum(h.text).startsWith(alnum(block.text)));
        if (have.startsWith(want) || want.startsWith(have) || loose) {
          stats.already++;
          if (relevel && block.level !== h.level) {
            units = [...units.slice(0, k), { ...block, level: h.level } as Block, ...units.slice(k + 1)];
            stats.relevelled = (stats.relevelled ?? 0) + 1;
          }
          from = k + 1;
          placed = true;
        }
        continue;
      }
      if (!SPLITTABLE(block)) continue;
      const hay = squash(block.text);
      // at the start of the block, or after the end of a sentence (or a note marker) inside it
      let at = hay.text.indexOf(want);
      while (at >= 0) {
        const start = hay.from[at];
        const end = hay.from[at + want.length - 1] + 1;
        const before = block.text.slice(0, start).trimEnd();
        const boundary = at === 0 || /[.!?”’'")\]]$/.test(before);
        // the words must end where a word ends
        const wordEnd = end >= block.text.length || /^\s/.test(block.text.slice(end));
        if (boundary && wordEnd) {
          const after = block.text.slice(end).trimStart();
          const pieces: Block[] = [];
          const { text: _t, ...rest } = block as Block & { text: string };
          if (before) pieces.push({ ...block, text: before } as Block);
          // (the heading's words as the text reading spelt them, quotation marks and all: not the layout's)
          const title = block.text.slice(start, end).replace(/\s+/g, " ").trim();
          pieces.push({ kind: "heading", level: h.level, text: title, layoutHeading: true, ...(block.at ? { at: block.at } : {}), ...(block.source ? { source: block.source } : {}) } as Block);
          // (a quotation the heading opened, stopping short of a sentence's end, is the first lines of the paragraph below)
          const next = units[k + 1];
          const runsOn = quotedRemainder && block.kind === "quote" && !before && after && !SENTENCE_STOP.test(after) && next?.kind === "paragraph";
          if (after) pieces.push(runsOn ? ({ ...(next as Block), kind: "paragraph", text: `${after} ${(next as { text: string }).text}` } as Block) : ({ ...rest, kind: block.kind, text: after } as Block));
          units = [...units.slice(0, k), ...pieces, ...units.slice(k + (runsOn ? 2 : 1))];
          from = k + pieces.length - (after ? 1 : 0);
          stats.split++;
          stats.added.push({ volume: h.volume, pdfIndex: h.pdfIndex, level: h.level, text: title, before: before.slice(-40), after: after.slice(0, 40) });
          placed = true;
          break;
        }
        at = hay.text.indexOf(want, at + 1);
      }
    }
    if (!placed) miss();
  }
  return units;
}
