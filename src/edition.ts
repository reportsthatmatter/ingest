/**
 * The hybrid source mode: a report served from a clean edition of itself,
 * with its printed pages and its fidelity taken from the PDF
 * (reportsthatmatter-ivg; design: the site's docs/design/reference-editions.md
 * §2.1).
 *
 * Where a publisher's own HTML (or tagged text) exists, paragraphs, headings,
 * block quotations, lists and notes are authored there, and every defect the
 * PDF cleaning passes exist to repair (severed paragraphs, running furniture,
 * fused headings, bare note markers) has nothing to arise from. What the clean
 * edition lacks is the printed page, which readers cite, and an independent
 * guarantee that it is the same text. Both come from the PDF:
 *
 * 1. **Text and structure** come from the edition, as `Edition` blocks the
 *    report's own adapter reads (`cleanEdition`).
 * 2. **Page anchors** come from aligning the edition's words to the PDF text
 *    layer with the scorer's monotone anchor alignment (`align.ts`) and
 *    stamping each block with the printed page its first word sits on.
 * 3. **The PDF is the fidelity check**: how much of the edition the PDF
 *    contains, the edition's words the PDF never prints, and every stretch
 *    where the two disagree, listed as review-queue suspects. Nothing is
 *    resolved silently: the edition's text stands, and the disagreement is
 *    reported.
 * 4. **Typography** the edition flattened is restored from the PDF only where
 *    there is one reading: an ASCII hyphen between two words the PDF prints
 *    with an em or en dash between the same two aligned words.
 *
 * The output is the same `full.md` contract as a PDF ingest: `%%page N%%`
 * markers between blocks (a page that starts inside a block is marked after
 * it, as `mergeAcrossPages` does), notes as `[^label]` definitions under a
 * closing `## Notes`.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { align } from "./align";
import { tokens, type Token } from "./tokens";
import type { Page } from "./extract";
import type { Suspect } from "./ocr";
import type { Block } from "./paragraphs";

// — What an adapter produces —

/**
 * One block of a clean edition. Text is inline Markdown: `*emphasis*`,
 * `[^label]` note markers, and anything else escaped (`inlineMarkdown`).
 */
export type EditionBlock = (
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; items: string[]; quoted?: boolean }
  | { kind: "contents"; text: string; page: string }
  | { kind: "table"; rows: string[][]; header: boolean }
) & {
  /**
   * A figure, caption or box the edition sets where the PDF's page put it,
   * which may be mid-sentence. A paragraph that stops mid-sentence, then only
   * floats, then a paragraph, is served as one paragraph with the floats after
   * it (`assembleEdition`). The edition's own order is what is aligned.
   */
  float?: boolean;
};

export type EditionNote = { label: string; text: string };

export type Edition = {
  blocks: EditionBlock[];
  /** Notes in document order; every `[^label]` in the blocks must have one. */
  notes: EditionNote[];
};

export type EditionSource = { path: string; sha256: string };

/** `cleanEdition`: declares the edition a report's text and structure come from. */
export type EditionPass = {
  readonly name: "cleanEdition";
  readonly stage: "edition";
  readonly sources: readonly EditionSource[];
  /** Reads and checks the edition's files and returns its blocks. */
  read(): Edition;
};

/**
 * Declares that this report's text and structure come from a clean edition,
 * and its PDF volumes only supply printed pages and the fidelity check.
 *
 * `dir` is the report repo (`import.meta.dirname` in its `ingest.ts`); each
 * file's SHA-256 is checked before it is read, as a volume's is. `read` is
 * the report's own adapter: what the edition's markup means is a property of
 * that source (see `htmlEvents` and `inlineMarkdown` for the pieces).
 */
export function cleanEdition(options: {
  dir: string;
  files: EditionSource[];
  encoding?: BufferEncoding;
  read(files: Array<{ path: string; text: string }>): Edition;
}): EditionPass {
  return {
    name: "cleanEdition",
    stage: "edition",
    sources: options.files,
    read() {
      const files = options.files.map((file) => {
        const buffer = readFileSync(join(options.dir, file.path));
        const sha256 = createHash("sha256").update(buffer).digest("hex");
        if (sha256 !== file.sha256) {
          throw new Error(
            `cleanEdition: checksum mismatch for ${file.path}\n  definition: ${file.sha256}\n  on disk:    ${sha256}`
          );
        }
        return { path: file.path, text: buffer.toString(options.encoding ?? "utf8") };
      });
      return options.read(files);
    },
  };
}

// — Inline Markdown for adapters —

export type InlinePiece =
  | { text: string; em?: boolean; strong?: boolean }
  | { marker: string };

const EM_OPEN = "\u0001";
const EM_CLOSE = "\u0002";
const MARK_OPEN = "\u0003";
const MARK_CLOSE = "\u0004";
const STRONG_OPEN = "\u0005";
const STRONG_CLOSE = "\u0006";

/** Escapes what Markdown would read as syntax inside running text. */
export function escapeInline(text: string): string {
  return text.replace(/([\\`*_])/g, "\\$1").replace(/\[(?=\^)/g, "\\[");
}

/**
 * Pieces of running text → one line of inline Markdown: whitespace collapsed,
 * emphasis kept (`*…*`, with its edge spaces moved outside so Markdown still
 * reads it), note markers as `[^label]` closed up to the word before them.
 */
export function inlineMarkdown(pieces: InlinePiece[]): string {
  return inline(pieces, false);
}

/**
 * The same pieces as plain text, for notes: the renderer sets a note's text
 * as it stands (escaped HTML, no Markdown), so emphasis and escapes would
 * show as asterisks and backslashes. Markers are kept.
 */
export function inlineText(pieces: InlinePiece[]): string {
  return inline(pieces, true);
}

function inline(pieces: InlinePiece[], plain: boolean): string {
  let s = "";
  for (const piece of pieces) {
    if ("marker" in piece) {
      s += `${MARK_OPEN}${piece.marker}${MARK_CLOSE}`;
      continue;
    }
    let text = plain ? piece.text : escapeInline(piece.text);
    if (piece.em && !plain) text = `${EM_OPEN}${text}${EM_CLOSE}`;
    if (piece.strong && !plain) text = `${STRONG_OPEN}${text}${STRONG_CLOSE}`;
    s += text;
  }
  s = s.replace(/[\s\u00a0]+/g, " ");
  // emphasis: adjacent runs merge, edge spaces move out, empty runs go
  let before: string;
  do {
    before = s;
    for (const [open, close] of [[EM_OPEN, EM_CLOSE], [STRONG_OPEN, STRONG_CLOSE]]) {
      s = s
        .replace(new RegExp(`${close}( ?)${open}`, "g"), "$1")
        .replace(new RegExp(`${open} `, "g"), ` ${open}`)
        .replace(new RegExp(` ${close}`, "g"), `${close} `)
        .replace(new RegExp(`${open}${close}`, "g"), "");
    }
  } while (s !== before);
  // Markdown only closes emphasis that ends on punctuation if a space or punctuation follows:
  // "*Economist'*s" stays literal, so the punctuation moves outside ("*Economist*'s")
  for (const [open, close] of [[EM_OPEN, EM_CLOSE], [STRONG_OPEN, STRONG_CLOSE]]) {
    s = s
      .replace(new RegExp(`([^\\s${open}])([.,;:'"!?)\\]]+)${close}(?=[\\p{L}\\p{N}])`, "gu"), `$1${close}$2`)
      .replace(new RegExp(`(?<=[\\p{L}\\p{N}])${open}(['"(\\[]+)`, "gu"), `$1${open}`);
  }
  s = s.replace(new RegExp(` +${MARK_OPEN}`, "g"), MARK_OPEN);
  s = s.replace(/ {2,}/g, " ").trim();
  return s
    .replace(new RegExp(`[${STRONG_OPEN}${STRONG_CLOSE}]`, "g"), "**")
    .replace(new RegExp(`[${EM_OPEN}${EM_CLOSE}]`, "g"), "*")
    .replace(new RegExp(`${MARK_OPEN}([^${MARK_CLOSE}]*)${MARK_CLOSE}`, "g"), "[^$1]");
}

// — Assembly —

export type EditionReport = {
  sources: readonly EditionSource[];
  /** Edition words (body and notes) aligned to a PDF word. */
  editionWords: number;
  alignedWords: number;
  /** Edition words the PDF never prints, as a word or two adjacent words joined. */
  oov: number;
  oovExamples: string[];
  /** PDF words on the pages the edition covers that align to nothing in it. */
  pdfWords: number;
  pdfAligned: number;
  pages: { anchored: number; placedByNeighbour: number };
  dashesRestored: number;
  /** A space after punctuation the PDF prints and the edition omits ("Timeline,"Dec."). */
  spacesRestored: number;
  /** A line-end hyphen of the PDF the edition kept ("air-line's"), closed up where the edition prints the word whole elsewhere. */
  hyphensClosed: number;
  disagreements: { editionNotInPdf: number; pdfNotInEdition: number };
};

export type PrintedPage = { volume: number; pdfIndex: number; number: number | string; occurrence?: number };

type Field = { block: number; note: boolean; get(): string; set(text: string): void };

/** Tokens of inline Markdown, with note markers masked so their digits are not words. */
function fieldTokens(text: string): Token[] {
  return tokens(text.replace(/\[\^[^\]]*\]/g, (m) => " ".repeat(m.length)));
}

function fieldsOf(blocks: EditionBlock[], notes: EditionNote[]): Field[] {
  const fields: Field[] = [];
  blocks.forEach((block, b) => {
    const add = (get: () => string, set: (t: string) => void) => fields.push({ block: b, note: false, get, set });
    switch (block.kind) {
      case "list":
        block.items.forEach((_, k) => add(() => block.items[k], (t) => (block.items[k] = t)));
        break;
      case "table":
        block.rows.forEach((row, r) => row.forEach((_, c) => add(() => block.rows[r][c], (t) => (block.rows[r][c] = t))));
        break;
      case "contents":
        add(() => block.text, (t) => (block.text = t));
        break;
      default:
        add(() => block.text, (t) => (block.text = t));
    }
  });
  notes.forEach((note, n) => fields.push({ block: n, note: true, get: () => note.text, set: (t) => (note.text = t) }));
  return fields;
}

const DASH = /^[\u2014\u2013]$/;
const straighten = (text: string) => text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');

/**
 * Builds a report from its clean edition, stamping printed pages and checking
 * fidelity against the PDF pages. `printed` is the PDF ingest's own reading of
 * which page carries which printed number (its `%%page%%` markers), so a page
 * the PDF pipeline would not mark is not marked here either.
 */
export function assembleEdition(
  edition: Edition,
  pages: Page[],
  printed: PrintedPage[],
  sources: readonly EditionSource[]
): { body: string; notes: string; report: EditionReport; suspects: Suspect[]; blocks: Block[]; linkedText: string[] } {
  const blocks = structuredClone(edition.blocks);
  const notes = structuredClone(edition.notes);
  const fields = fieldsOf(blocks, notes);

  // the edition's word stream: body fields, then notes
  type CTok = Token & { field: number };
  const clean: CTok[] = [];
  fields.forEach((field, f) => {
    for (const t of fieldTokens(field.get())) clean.push({ ...t, field: f });
  });
  const bodyTokens = clean.findIndex((t) => fields[t.field].note);
  const bodyEnd = bodyTokens === -1 ? clean.length : bodyTokens;

  // the PDF's word stream, page by page
  type PTok = Token & { page: number };
  const pageText = pages.map((page) => page.lines.join("\n"));
  const pdf: PTok[] = [];
  pageText.forEach((text, p) => {
    for (const t of tokens(text)) pdf.push({ ...t, page: p });
  });

  const { map, inv } = align(clean.map((t) => t.word), pdf.map((t) => t.word));

  // 4. typography: an ASCII hyphen the PDF prints as a dash between the same two words
  let dashesRestored = 0;
  let spacesRestored = 0;
  let hyphensClosed = 0;
  const wholeWords = new Map<string, number>();
  for (const t of clean) wholeWords.set(t.word, (wholeWords.get(t.word) ?? 0) + 1);
  const hyphenated = new Map<string, number>();
  for (let k = 0; k + 1 < clean.length; k++) {
    if (clean[k].field !== clean[k + 1].field) continue;
    if (fields[clean[k].field].get().slice(clean[k].end, clean[k + 1].start) !== "-") continue;
    const pair = `${clean[k].word}-${clean[k + 1].word}`;
    hyphenated.set(pair, (hyphenated.get(pair) ?? 0) + 1);
  }
  const edits = new Map<number, Array<{ start: number; end: number; text: string }>>();
  for (let k = 0; k + 1 < clean.length; k++) {
    const a = clean[k];
    const b = clean[k + 1];
    if (a.field !== b.field) continue;
    const j = map[k];
    if (j < 0 || map[k + 1] !== j + 1) continue;
    if (pdf[j].page !== pdf[j + 1].page) continue;
    const text = fields[a.field].get();
    const cs = text.slice(a.end, b.start);
    const ps = pageText[pdf[j].page].slice(pdf[j].end, pdf[j + 1].start);
    if (/\s/.test(cs) || cs === "" || /^['\u2019]$/.test(cs)) {
      // only an unspaced separator is checked further
    } else if (/^\S+\s+$/.test(ps) && cs.replace(/[*_\\]/g, "") === straighten(ps).trim() && !/[-\u2013\u2014]$/.test(cs)) {
      // the PDF spaces two words the edition runs together after its punctuation
      // ("Timeline,"Dec.", "**FAA**:Yeah"): the space goes after the punctuation and any emphasis closing there
      if (!edits.has(a.field)) edits.set(a.field, []);
      edits.get(a.field)!.push({ start: a.end, end: b.start, text: `${cs} ` });
      spacesRestored++;
      continue;
    }
    if (cs === "-" && /^-[ \t]*\n\s*$/.test(ps)) {
      // a word the PDF breaks at a line end, which the edition kept the hyphen of
      // ("air-line's"): closed up only where the edition prints the word whole
      // elsewhere and this is its only hyphenated spelling
      const pair = `${a.word}-${b.word}`;
      if ((wholeWords.get(a.word + b.word) ?? 0) > 0 && (hyphenated.get(pair) ?? 0) === 1) {
        if (!edits.has(a.field)) edits.set(a.field, []);
        edits.get(a.field)!.push({ start: a.end, end: b.start, text: "" });
        hyphensClosed++;
      }
      continue;
    }
    if (cs.replace(/\s/g, "") !== "-" && cs.replace(/\s/g, "") !== "--") continue;
    if (!DASH.test(ps.replace(/\s/g, ""))) continue;
    const replacement = /\n/.test(ps) ? ps.replace(/\s/g, "") : ps.replace(/\s+/g, " ");
    if (!edits.has(a.field)) edits.set(a.field, []);
    edits.get(a.field)!.push({ start: a.end, end: b.start, text: replacement });
    dashesRestored++;
  }
  for (const [f, list] of edits) {
    let text = fields[f].get();
    for (const e of list.sort((x, y) => y.start - x.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    fields[f].set(text);
  }

  // 2. page anchors: the first edition word each marked page holds
  const pageIndex = new Map(pages.map((page, p) => [`${page.volume}:${page.pdfIndex}`, p]));
  const firstOnPage = new Map<number, number>();
  for (let j = 0; j < pdf.length; j++) {
    const c = inv[j];
    if (c < 0 || c >= bodyEnd) continue;
    if (!firstOnPage.has(pdf[j].page)) firstOnPage.set(pdf[j].page, c);
  }
  const marked = printed
    .map((entry) => ({ entry, p: pageIndex.get(`${entry.volume}:${entry.pdfIndex}`) }))
    .filter((x): x is { entry: PrintedPage; p: number } => x.p !== undefined)
    .sort((x, y) => x.p - y.p);
  const own = marked.map((x) => firstOnPage.get(x.p));
  // a page with no word of its own (a full-page figure) sits where the next page does;
  // positions only move forward, so a stray alignment cannot reorder the pages
  const pos = new Array<number>(marked.length);
  let next = bodyEnd;
  for (let i = marked.length - 1; i >= 0; i--) {
    pos[i] = Math.min(own[i] ?? next, next);
    next = pos[i];
  }
  // forward: clamp a page whose first word aligned before the previous page's
  for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1]);
  const anchored = own.filter((x) => x !== undefined).length;

  // token → block (body), and each block's first token
  const firstToken = new Map<number, number>();
  for (let c = 0; c < bodyEnd; c++) {
    const b = fields[clean[c].field].block;
    if (!firstToken.has(b)) firstToken.set(b, c);
  }
  // the PDF page each block's first aligned word is on
  const blockPage = new Map<number, number>();
  for (let c = 0; c < bodyEnd; c++) {
    const b = fields[clean[c].field].block;
    if (!blockPage.has(b) && map[c] >= 0) blockPage.set(b, pdf[map[c]].page);
  }
  // a block none of whose words aligned (a caption the PDF prints in another order) is placed
  // by its opening words where the PDF prints them exactly once
  const grams = new Map<string, number[]>();
  for (let j = 0; j + 3 <= pdf.length; j++) {
    const key = `${pdf[j].word} ${pdf[j + 1].word} ${pdf[j + 2].word}`;
    const list = grams.get(key);
    if (list) list.push(j);
    else grams.set(key, [j]);
  }
  for (const [b, start] of firstToken) {
    if (blockPage.has(b)) continue;
    let end = start;
    while (end < bodyEnd && end - start < 8 && fields[clean[end].field].block === b) end++;
    if (end - start < 3) continue;
    const want = clean.slice(start, end).map((t) => t.word);
    const hits = (grams.get(want.slice(0, 3).join(" ")) ?? []).filter((j) => want.every((w, k) => pdf[j + k]?.word === w));
    // the List of Illustrations prints every caption again: take the one near the text around the block
    let near = start - 1;
    while (near >= 0 && map[near] < 0) near--;
    const anchor = near >= 0 ? map[near] : 0;
    const close = hits.filter((j) => Math.abs(j - anchor) < 3000);
    if (close.length === 1) blockPage.set(b, pdf[close[0]].page);
  }
  const markersBefore = new Map<number, PrintedPage[]>();
  let lastBefore = 0;
  for (let i = 0; i < marked.length; i++) {
    let before: number;
    if (pos[i] >= bodyEnd) before = blocks.length;
    else {
      const c = pos[i];
      const b = fields[clean[c].field].block;
      const start = firstToken.get(b)!;
      // the page opens this block if no earlier word of the block aligned (to an earlier page)
      let opens = true;
      for (let k = start; k < c; k++) if (map[k] >= 0) opens = false;
      before = opens ? b : b + 1;
      // a page that starts inside a block is marked after it, and after any block that follows it
      // but is still printed on an earlier page (a figure the edition set after the paragraph it interrupts)
      if (!opens) while (before < blocks.length && (blockPage.get(before) ?? marked[i].p) < marked[i].p) before++;
    }
    before = Math.max(before, lastBefore);
    lastBefore = before;
    if (!markersBefore.has(before)) markersBefore.set(before, []);
    markersBefore.get(before)!.push(marked[i].entry);
  }

  // 3. fidelity: containment, out-of-vocabulary words, disagreements
  const vocabulary = new Set(pdf.map((t) => t.word));
  for (let j = 0; j + 1 < pdf.length; j++) vocabulary.add(pdf[j].word + pdf[j + 1].word);
  const oovWords = clean.filter((t) => !vocabulary.has(t.word)).map((t) => t.word);
  const aligned = clean.filter((_, c) => map[c] >= 0).length;

  // the printed page each block sits on: the last marker at or before it
  const pageOfBlock: Array<PrintedPage | undefined> = [];
  let current: PrintedPage | undefined;
  for (let b = 0; b < blocks.length; b++) {
    const m = markersBefore.get(b);
    if (m?.length) current = m[m.length - 1];
    pageOfBlock.push(current);
  }
  const printedOfBlock = (b: number) => pageOfBlock[b];
  const suspects: Suspect[] = [];
  const pageNumber = (p?: PrintedPage) => (typeof p?.number === "number" ? p.number : 0);
  // edition stretches the PDF does not print (per field: a run of 4+ unaligned words, or a short field mostly unaligned)
  const fieldStart = new Array<number>(fields.length).fill(-1);
  const fieldEnd = new Array<number>(fields.length).fill(-1);
  clean.forEach((t, c) => {
    if (fieldStart[t.field] < 0) fieldStart[t.field] = c;
    fieldEnd[t.field] = c + 1;
  });
  for (let f = 0; f < fields.length; f++) {
    if (fieldStart[f] < 0) continue;
    const toks = Array.from({ length: fieldEnd[f] - fieldStart[f] }, (_, k) => ({ c: fieldStart[f] + k }));
    let run: number[] = [];
    const flush = () => {
      const short = toks.length < 8 && run.length >= Math.ceil(toks.length / 2);
      if (run.length >= 4 || (short && run.length >= 2)) {
        const text = fields[f].get();
        const from = clean[run[0]].start;
        const to = clean[run[run.length - 1]].end;
        const block = fields[f].note ? undefined : printedOfBlock(fields[f].block);
        suspects.push({
          pattern: fields[f].note ? "edition note text not in the PDF" : "edition text not in the PDF",
          match: text.slice(from, to).slice(0, 120),
          context: text.slice(Math.max(0, from - 60), Math.min(text.length, to + 60)).replace(/\s+/g, " "),
          page: pageNumber(block),
          volume: block?.volume,
          pdfIndex: block?.pdfIndex,
          confidence: "possible",
        });
      }
      run = [];
    };
    for (const { c } of toks) {
      if (map[c] < 0) run.push(c);
      else flush();
    }
    flush();
  }
  const editionNotInPdf = suspects.length;
  // PDF stretches the edition does not have, on pages the edition covers
  const covered = new Set<number>();
  for (let j = 0; j < pdf.length; j++) if (inv[j] >= 0) covered.add(pdf[j].page);
  let pdfWords = 0;
  let pdfAligned = 0;
  let gap: number[] = [];
  const flushGap = () => {
    if (gap.length >= 25) {
      const p = pdf[gap[0]].page;
      const text = pageText[p].slice(pdf[gap[0]].start, pdf[gap[gap.length - 1]].end).replace(/\s+/g, " ");
      const entry = marked.find((x) => x.p === p)?.entry;
      suspects.push({
        pattern: "PDF text not in the edition",
        match: text.slice(0, 120),
        context: `${gap.length} words: ${text.slice(0, 300)}`,
        page: pageNumber(entry),
        volume: pages[p].volume,
        pdfIndex: pages[p].pdfIndex,
        confidence: "possible",
      });
    }
    gap = [];
  };
  for (let j = 0; j < pdf.length; j++) {
    if (!covered.has(pdf[j].page)) {
      flushGap();
      continue;
    }
    pdfWords++;
    if (inv[j] >= 0) {
      pdfAligned++;
      flushGap();
    } else gap.push(j);
  }
  flushGap();

  // serialise, joining a paragraph that a float interrupted mid-sentence
  const joins = new Map<number, number>();
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    if (block.kind !== "paragraph" || block.float || !unfinished(block.text)) continue;
    let j = b + 1;
    while (j < blocks.length && blocks[j].float) j++;
    const next = blocks[j];
    if (j > b + 1 && next?.kind === "paragraph" && !next.float) joins.set(b, j);
  }
  const out: string[] = [];
  const order: Array<{ block: EditionBlock; source: number }> = [];
  const marker = (p: PrintedPage) => (p.occurrence ? `%%page ${p.number}#${p.occurrence}%%` : `%%page ${p.number}%%`);
  let carried: PrintedPage[] = [];
  for (let b = 0; b < blocks.length; b++) {
    for (const p of [...carried, ...(markersBefore.get(b) ?? [])]) out.push(marker(p));
    carried = [];
    const j = joins.get(b);
    if (j === undefined) {
      out.push(blockMarkdown(blocks[b]));
      order.push({ block: blocks[b], source: b });
      continue;
    }
    const head = blocks[b] as { text: string };
    const tail = blocks[j] as { text: string };
    const joined: EditionBlock = {
      kind: "paragraph",
      text: /[a-z]-$/.test(head.text) && /^[a-z]/.test(tail.text) ? head.text.slice(0, -1) + tail.text : `${head.text} ${tail.text}`,
    };
    out.push(blockMarkdown(joined));
    order.push({ block: joined, source: b });
    // the floats follow it with their own pages; a page that began in the paragraph's second half follows them
    for (let k = b + 1; k < j; k++) {
      for (const p of markersBefore.get(k) ?? []) out.push(marker(p));
      out.push(blockMarkdown(blocks[k]));
      order.push({ block: blocks[k], source: k });
    }
    carried = markersBefore.get(j) ?? [];
    b = j;
  }
  for (const p of [...carried, ...(markersBefore.get(blocks.length) ?? [])]) out.push(marker(p));

  // the blocks as the PDF pipeline reports its own, each on the PDF page its first word is printed on,
  // for the layout oracle and golden pages
  const printedAt = new Map(marked.map((x) => [x.p, x.entry.number]));
  const asBlocks: Block[] = [];
  const linkedText: string[] = [];
  order.forEach(({ block, source: b }) => {
    const p = blockPage.get(b);
    const at = p === undefined ? undefined : { volume: pages[p].volume, pdfIndex: pages[p].pdfIndex, printed: typeof printedAt.get(p) === "number" ? (printedAt.get(p) as number) : null };
    const common = at ? { at } : {};
    if (block.kind === "table") {
      // one block per row, as a reader takes a table row: a unit of its own
      for (const row of block.rows) {
        const text = row.filter(Boolean).join(" ");
        asBlocks.push({ kind: "paragraph", text, ...common });
        linkedText.push(text);
      }
      return;
    }
    else if (block.kind === "list") asBlocks.push({ kind: "list", items: [...block.items], quoted: Boolean(block.quoted), ...common });
    else asBlocks.push({ ...block, ...common } as Block);
    linkedText.push(blockMarkdown(block));
  });

  return {
    blocks: asBlocks,
    linkedText,
    body: out.join("\n\n"),
    notes: notes.map((note) => `[^${note.label}]: ${note.text}`).join("\n\n"),
    suspects,
    report: {
      sources,
      editionWords: clean.length,
      alignedWords: aligned,
      oov: oovWords.length,
      oovExamples: [...new Set(oovWords)].slice(0, 40),
      pdfWords,
      pdfAligned,
      pages: { anchored, placedByNeighbour: marked.length - anchored },
      dashesRestored,
      spacesRestored,
      hyphensClosed,
      disagreements: { editionNotInPdf, pdfNotInEdition: suspects.length - editionNotInPdf },
    },
  };
}

/** Text that stops mid-sentence: no closing punctuation once its note markers and emphasis are off. */
function unfinished(text: string): boolean {
  const end = text.replace(/(\[\^[^\]]*\])+$/, "").replace(/[*_]+$/, "").trimEnd();
  return !/[.?!:;"')\]]$/.test(end) || /[a-z]-$/.test(end);
}

/** A paragraph opening that Markdown would read as syntax. */
function escapeOpening(text: string): string {
  return text.replace(/^(\d{1,4})([.)])(?=\s)/, "$1\\$2").replace(/^([#>+-])(?=\s|$)/, "\\$1").replace(/^%%/, "\\%%");
}

function blockMarkdown(block: EditionBlock): string {
  switch (block.kind) {
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "quote":
      return `> ${escapeOpening(block.text)}`;
    case "contents":
      return `- ${escapeOpening(block.text)} — ${block.page}`;
    case "list":
      return block.items.map((item) => `${block.quoted ? "> - " : "- "}${escapeOpening(item)}`).join("\n");
    case "table": {
      const width = Math.max(...block.rows.map((row) => row.length));
      const cells = (row: string[]) =>
        `| ${Array.from({ length: width }, (_, k) => (row[k] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
      const rows = block.header ? block.rows : [Array<string>(width).fill(""), ...block.rows];
      return [cells(rows[0]), `| ${Array<string>(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(cells)].join("\n");
    }
    default:
      return escapeOpening(block.text);
  }
}
