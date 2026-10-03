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
import { hasLetter, tokens, type Token } from "./tokens";
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
  /**
   * Where the edition is known to lack text the PDF prints (a web page the
   * archive never captured, front matter it does not carry): the PDF shadow's
   * own blocks between the edition's words either side fill it (`fillGaps`).
   * `reason` says what is missing, for the fidelity report.
   */
  | { kind: "gap"; reason: string }
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
  /**
   * Where the block's text came from: a file of the edition (set by the
   * adapter), or a PDF page, for a block `fillGaps` took from the PDF shadow.
   */
  source?: BlockSource;
};

export type BlockSource = { file: string } | { pdf: { volume: number; pdfIndex: number }; gap: string };

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
  /**
   * Where the PDF prints the edition's notes. `"back"` (the default): in the
   * body stream, as endnotes are (9/11). `"page-foot"`: under the paragraph
   * that cites them, which the PDF shadow lifts out of the text and holds
   * as its notes; the edition's notes are then aligned to those, not to the
   * body (Saville).
   */
  readonly notes: "back" | "page-foot";
  /**
   * Where a paragraph that a float interrupted mid-sentence, rejoined, is
   * served against its floats. `"after"` (the default): the paragraph, then
   * the floats. `"by-notes"`: the floats first when their notes number them
   * before the paragraph's (the paragraph's opening half cites none, its
   * closing half cites only notes after the floats'), so the notes read in
   * the order the print numbers them: 9/11's "A Case Study in Terrorist
   * Travel" (notes 22-25) interrupts the paragraph that ends on note 26
   * (reportsthatmatter-gq4j).
   */
  readonly floats?: "after" | "by-notes";
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
  notes?: "back" | "page-foot";
  /** See `EditionPass.floats`. */
  floats?: "after" | "by-notes";
  read(files: Array<{ path: string; text: string }>): Edition;
}): EditionPass {
  return {
    name: "cleanEdition",
    stage: "edition",
    sources: options.files,
    notes: options.notes ?? "back",
    ...(options.floats ? { floats: options.floats } : {}),
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
  /** `strike`: text the source prints struck through (a deletion shown in a quoted document), as `~~…~~`. */
  | { text: string; em?: boolean; strong?: boolean; strike?: boolean }
  | { marker: string };

const EM_OPEN = "\u0001";
const EM_CLOSE = "\u0002";
const MARK_OPEN = "\u0003";
const MARK_CLOSE = "\u0004";
const STRONG_OPEN = "\u0005";
const STRONG_CLOSE = "\u0006";
const STRIKE_OPEN = "\u000e";
const STRIKE_CLOSE = "\u000f";

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
    if (piece.strike && !plain) text = `${STRIKE_OPEN}${text}${STRIKE_CLOSE}`;
    s += text;
  }
  s = s.replace(/[\s\u00a0]+/g, " ");
  // emphasis: adjacent runs merge, edge spaces move out, empty runs go
  let before: string;
  do {
    before = s;
    for (const [open, close] of [[EM_OPEN, EM_CLOSE], [STRONG_OPEN, STRONG_CLOSE], [STRIKE_OPEN, STRIKE_CLOSE]]) {
      s = s
        .replace(new RegExp(`${close}( ?)${open}`, "g"), "$1")
        .replace(new RegExp(`${open} `, "g"), ` ${open}`)
        .replace(new RegExp(` ${close}`, "g"), `${close} `)
        .replace(new RegExp(`${open}${close}`, "g"), "");
    }
  } while (s !== before);
  // Markdown only closes emphasis that ends on punctuation if a space or punctuation follows:
  // "*Economist'*s" stays literal, so the punctuation moves outside ("*Economist*'s")
  for (const [open, close] of [[EM_OPEN, EM_CLOSE], [STRONG_OPEN, STRONG_CLOSE], [STRIKE_OPEN, STRIKE_CLOSE]]) {
    s = s
      .replace(new RegExp(`([^\\s${open}])([.,;:'"!?)\\]]+)${close}(?=[\\p{L}\\p{N}])`, "gu"), `$1${close}$2`)
      .replace(new RegExp(`(?<=[\\p{L}\\p{N}])${open}(['"(\\[]+)`, "gu"), `$1${open}`);
  }
  s = s.replace(new RegExp(` +${MARK_OPEN}`, "g"), MARK_OPEN);
  s = s.replace(/ {2,}/g, " ").trim();
  return s
    .replace(new RegExp(`[${STRIKE_OPEN}${STRIKE_CLOSE}]`, "g"), "~~")
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
  pages: { anchored: number; placedByNeighbour: number; frontMatterSkipped?: number };
  dashesRestored: number;
  /** A space after punctuation the PDF prints and the edition omits ("Timeline,"Dec."). */
  spacesRestored: number;
  /** A line-end hyphen of the PDF the edition kept ("air-line's"), closed up where the edition prints the word whole elsewhere. */
  hyphensClosed: number;
  disagreements: { editionNotInPdf: number; pdfNotInEdition: number };
  /** The edition's gaps and what the PDF shadow filled each with (`fillGaps`). */
  filled?: FilledGap[];
};

/**
 * Pages the PDF ingest read no printed number off (a page of a figure, a page
 * whose header it did not read) that sit between two it did, with the numbers
 * in step with the PDF's own page order (printed 47 on PDF page 52, printed 50
 * on PDF page 55: 48 and 49 are the pages between). A gap whose numbers do not
 * run in step is left unmarked.
 */
export function fillPrintedGaps(printed: PrintedPage[]): PrintedPage[] {
  const sorted = [...printed].sort((a, b) => a.volume - b.volume || a.pdfIndex - b.pdfIndex);
  const out = [...sorted];
  for (let k = 0; k + 1 < sorted.length; k++) {
    const a = sorted[k];
    const b = sorted[k + 1];
    if (a.volume !== b.volume || typeof a.number !== "number" || typeof b.number !== "number") continue;
    const gap = b.pdfIndex - a.pdfIndex;
    if (gap < 2 || b.number - a.number !== gap || a.occurrence || b.occurrence) continue;
    for (let i = 1; i < gap; i++) out.push({ volume: a.volume, pdfIndex: a.pdfIndex + i, number: a.number + i });
  }
  return out.sort((x, y) => x.volume - y.volume || x.pdfIndex - y.pdfIndex);
}

export type PrintedPage = { volume: number; pdfIndex: number; number: number | string; occurrence?: number };

/** One piece of text the edition holds; a table cell also says which row it is in, so a page can start at a row. */
type Field = { block: number; note: boolean; row?: number; get(): string; set(text: string): void };

/** Tokens of inline Markdown, with note markers masked so their digits are not words. */
function fieldTokens(text: string): Token[] {
  return tokens(text.replace(/\[\^[^\]]*\]/g, (m) => " ".repeat(m.length)));
}

function fieldsOf(blocks: EditionBlock[], notes: EditionNote[]): Field[] {
  const fields: Field[] = [];
  blocks.forEach((block, b) => {
    const add = (get: () => string, set: (t: string) => void, row?: number) =>
      fields.push({ block: b, note: false, ...(row === undefined ? {} : { row }), get, set });
    switch (block.kind) {
      case "list":
        block.items.forEach((_, k) => add(() => block.items[k], (t) => (block.items[k] = t)));
        break;
      case "table":
        block.rows.forEach((row, r) => row.forEach((_, c) => add(() => block.rows[r][c], (t) => (block.rows[r][c] = t), r)));
        break;
      case "contents":
        add(() => block.text, (t) => (block.text = t));
        break;
      case "gap":
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
  sources: readonly EditionSource[],
  options: { floats?: "after" | "by-notes" } = {}
): { body: string; notes: string; report: EditionReport; suspects: Suspect[]; blocks: Block[]; linkedText: string[]; notePages: Array<number | undefined> } {
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
  // A page's notes are a stream of their own where the PDF prints them under their
  // paragraphs (`notes: "page-foot"`): the edition's notes follow its body, so the PDF's do too.
  const pdfBody: PTok[] = [];
  const pdfFoot: PTok[] = [];
  pageText.forEach((text, p) => {
    const foot = pages[p].footLines ?? 0;
    const footStart = foot > 0 ? pages[p].lines.slice(0, pages[p].lines.length - foot).join("\n").length : text.length;
    for (const t of tokens(text)) (t.start >= footStart ? pdfFoot : pdfBody).push({ ...t, page: p });
  });
  const pdf: PTok[] = [...pdfBody, ...pdfFoot];

  const { map, inv } = align(clean.map((t) => t.word), pdf.map((t) => t.word));

  // the page (index into `pages`) each note's first aligned word is on
  const notePages: Array<number | undefined> = notes.map(() => undefined);
  clean.forEach((t, c) => {
    const f = fields[t.field];
    if (f.note && notePages[f.block] === undefined && map[c] >= 0) notePages[f.block] = pdf[map[c]].page;
  });

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
  const everyPage = printed
    .map((entry) => ({ entry, p: pageIndex.get(`${entry.volume}:${entry.pdfIndex}`) }))
    .filter((x): x is { entry: PrintedPage; p: number } => x.p !== undefined)
    .sort((x, y) => x.p - y.p);
  // Pages before the first one the edition holds a word of (a title page, a contents the edition
  // does not carry) are not marked: with no text of the edition's on them, a marker would only
  // open the document with page numbers that belong to other pages ("page 19" of the front
  // matter, ahead of the real page 19).
  const firstHeld = everyPage.findIndex((x) => firstOnPage.has(x.p));
  const skipped = firstHeld > 0 ? everyPage.slice(0, firstHeld) : [];
  const marked = firstHeld > 0 ? everyPage.slice(firstHeld) : everyPage;
  for (const x of marked) {
    if (!x.entry.occurrence) continue;
    const before = skipped.filter((s) => s.entry.number === x.entry.number).length;
    const occurrence = x.entry.occurrence - before;
    x.entry = { ...x.entry, occurrence: occurrence > 1 ? occurrence : undefined };
  }
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
  // a table's rows are placed one by one: the PDF page each row's first aligned word is on, and the
  // first token of each row, so a page that begins inside a table is stamped at its row
  const rowPage = new Map<number, Map<number, number>>();
  const rowStart = new Map<number, Map<number, number>>();
  for (let c = 0; c < bodyEnd; c++) {
    const f = fields[clean[c].field];
    if (f.row === undefined) continue;
    if (!rowStart.has(f.block)) rowStart.set(f.block, new Map());
    if (!rowStart.get(f.block)!.has(f.row)) rowStart.get(f.block)!.set(f.row, c);
    if (map[c] < 0) continue;
    if (!rowPage.has(f.block)) rowPage.set(f.block, new Map());
    if (!rowPage.get(f.block)!.has(f.row)) rowPage.get(f.block)!.set(f.row, pdf[map[c]].page);
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
  // markers that fall inside a table: block -> row the page opens at -> pages (the table is cut there)
  const markersInTable = new Map<number, Map<number, PrintedPage[]>>();
  let lastBefore = 0;
  for (let i = 0; i < marked.length; i++) {
    let before: number;
    if (pos[i] >= bodyEnd) before = blocks.length;
    else {
      const c = pos[i];
      const b = fields[clean[c].field].block;
      const start = firstToken.get(b)!;
      const inRow = fields[clean[c].field].row;
      if (inRow !== undefined && b >= lastBefore) {
        // a page that begins inside a table is stamped before the row it begins in (the row after,
        // when it begins mid-row), not after the whole table; the first row is the block's own start
        const rows = (blocks[b] as { rows: string[][] }).rows;
        const atRowStart = rowStart.get(b)?.get(inRow) === c;
        const row = atRowStart ? inRow : inRow + 1;
        if (row > 0 && row < rows.length) {
          if (!markersInTable.has(b)) markersInTable.set(b, new Map());
          const cuts = markersInTable.get(b)!;
          if (!cuts.has(row)) cuts.set(row, []);
          cuts.get(row)!.push(marked[i].entry);
          lastBefore = b;
          continue;
        }
      }
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
  // `floats: "by-notes"`: the joins whose floats read first, by where their notes are numbered
  const floatsFirst = new Set<number>();
  if (options.floats === "by-notes") {
    const ordinal = new Map(notes.map((note, i) => [note.label, i]));
    const cited = (from: number, to: number) =>
      blocks.slice(from, to).flatMap((block) =>
        [...blockMarkdown(block).matchAll(/\[\^([^\]]+)\](?!:)/g)].flatMap((m) => (ordinal.has(m[1]) ? [ordinal.get(m[1])!] : []))
      );
    for (const [b, j] of joins) {
      const head = cited(b, b + 1);
      const floats = cited(b + 1, j);
      const tail = cited(j, j + 1);
      if (!head.length && floats.length && tail.length && Math.min(...tail) > Math.max(...floats)) floatsFirst.add(b);
    }
  }
  const out: string[] = [];
  const order: Array<{ block: EditionBlock; source: number }> = [];
  const marker = (p: PrintedPage) => (p.occurrence ? `%%page ${p.number}#${p.occurrence}%%` : `%%page ${p.number}%%`);
  let carried: PrintedPage[] = [];
  for (let b = 0; b < blocks.length; b++) {
    for (const p of [...carried, ...(markersBefore.get(b) ?? [])]) out.push(marker(p));
    carried = [];
    const j = joins.get(b);
    const cuts = markersInTable.get(b);
    if (cuts && blocks[b].kind === "table") {
      // a table a page turn falls inside is written as one table per page, the stamps between them
      const table = blocks[b] as Extract<EditionBlock, { kind: "table" }>;
      const at = [0, ...[...cuts.keys()].sort((x, y) => x - y), table.rows.length];
      for (let k = 0; k + 1 < at.length; k++) {
        if (k > 0) for (const p of cuts.get(at[k])!) out.push(marker(p));
        out.push(blockMarkdown({ ...table, rows: table.rows.slice(at[k], at[k + 1]), header: k === 0 ? table.header : false }));
      }
      order.push({ block: blocks[b], source: b });
      continue;
    }
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
    if (floatsFirst.has(b)) {
      // the floats, on their own pages, then the paragraph: a box is often a
      // page or more, so it keeps its page stamps and the paragraph whose
      // opening lines it interrupted reads on the page it ends on
      for (let k = b + 1; k < j; k++) {
        for (const p of markersBefore.get(k) ?? []) out.push(marker(p));
        out.push(blockMarkdown(blocks[k]));
        order.push({ block: blocks[k], source: k });
      }
      out.push(blockMarkdown(joined));
      order.push({ block: joined, source: b });
      carried = markersBefore.get(j) ?? [];
      b = j;
      continue;
    }
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

  const placedAt = new Map(blockPage);
  // For `at` only, once the page markers are placed: a block still unplaced (a short heading, "Introduction", whose words the aligner left to a
  // neighbour) is on the page of the block it heads, or else of the block before it
  for (let b = 0; b < blocks.length; b++) {
    if (placedAt.has(b) || !firstToken.has(b)) continue;
    let next = b + 1;
    while (next < blocks.length && !placedAt.has(next)) next++;
    let prev = b - 1;
    while (prev >= 0 && !placedAt.has(prev)) prev--;
    const page = blocks[b].kind === "heading" && next < blocks.length ? placedAt.get(next) : prev >= 0 ? placedAt.get(prev) : placedAt.get(next);
    if (page !== undefined) placedAt.set(b, page);
  }
  // the blocks as the PDF pipeline reports its own, each on the PDF page its first word is printed on,
  // for the layout oracle and golden pages
  const printedAt = new Map(marked.map((x) => [x.p, x.entry.number]));
  const asBlocks: Block[] = [];
  const linkedText: string[] = [];
  order.forEach(({ block, source: b }) => {
    const placed = (p: number | undefined) =>
      p === undefined ? {} : { at: { volume: pages[p].volume, pdfIndex: pages[p].pdfIndex, printed: typeof printedAt.get(p) === "number" ? (printedAt.get(p) as number) : null } };
    const p = placedAt.get(b);
    const source = block.source && "pdf" in block.source ? { source: "pdf" as const } : { source: "edition" as const };
    const common = { ...placed(p), ...source };
    if (block.kind === "table") {
      // one block per row, as a reader takes a table row: a unit of its own, on the page its own words are on
      let rowAt = p;
      block.rows.forEach((row, r) => {
        rowAt = rowPage.get(b)?.get(r) ?? rowAt;
        const text = row.filter(Boolean).join(" ");
        asBlocks.push({ kind: "paragraph", text, ...placed(rowAt), ...source });
        linkedText.push(text);
      });
      return;
    }
    else if (block.kind === "list") asBlocks.push({ kind: "list", items: [...block.items], quoted: Boolean(block.quoted), ...common });
    else {
      const { source: _source, float: _float, ...rest } = block;
      asBlocks.push({ ...rest, ...common } as Block);
    }
    linkedText.push(blockMarkdown(block));
  });

  return {
    blocks: asBlocks,
    linkedText,
    notePages,
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
      pages: { anchored, placedByNeighbour: marked.length - anchored, ...(skipped.length ? { frontMatterSkipped: skipped.length } : {}) },
      dashesRestored,
      spacesRestored,
      hyphensClosed,
      disagreements: { editionNotInPdf, pdfNotInEdition: suspects.length - editionNotInPdf },
    },
  };
}

// — Gap-fill: what the edition lacks, from the PDF shadow —

/** One gap of the edition and what filled it. */
export type FilledGap = {
  reason: string;
  /** Blocks taken from the PDF shadow (a block cut at the gap's edge counts once). */
  blocks: number;
  /** Shadow blocks in the gap left out: a bare number, a title the edition already has (a running head), or words the edition prints next to the gap. */
  dropped?: number;
  words: number;
  notes: number;
  /** The PDF pages the filled blocks start on, first and last (absent when nothing was filled). */
  from?: { volume: number; pdfIndex: number };
  to?: { volume: number; pdfIndex: number };
  /** The opening words of the first filled block. */
  opening?: string;
};

/** What `fillGaps` reads of the PDF ingest run as the shadow. */
export type ShadowText = {
  blocks: Block[];
  linkedText?: Array<string | undefined>;
  footnotes: Array<{ number: number; label?: string; text: string; volume?: number; pdfIndex?: number }>;
};

/** The first label number for notes a gap-fill carries over: "104-9001" renders as 104 and is never an edition's label. */
const GAP_NOTE_BASE = 9000;

/** A shadow block's own text as inline Markdown, without its block prefix. */
function shadowText(block: Block, linked: string | undefined): string | string[] | undefined {
  switch (block.kind) {
    case "page":
      return undefined;
    case "list":
      if (linked) return linked.split("\n").map((line) => line.replace(/^(?:> )?- /, ""));
      return [...block.items];
    case "contents":
      return block.text;
    case "heading":
      return linked ? linked.replace(/^#{1,6} /, "") : block.text;
    case "quote":
      return linked
        ? linked
            .split(/\n>\n/)
            .map((paragraph) => paragraph.replace(/^> ?/gm, "").replace(/\n/g, " "))
            .join("\n\n")
        : block.text;
    default:
      return linked ?? block.text;
  }
}

/**
 * Fills each `gap` block of an edition with the PDF shadow's own blocks: the
 * text the PDF prints between the last word of the edition before the gap and
 * its first word after it, as the PDF ingest read it (reportsthatmatter-ivg.3).
 *
 * The edition says where it is incomplete (a gap block, placed by its adapter,
 * which knows which of its files are missing); the alignment says what is
 * missing, to the word. A shadow block that straddles a gap's edge is cut at
 * the first (or after the last) of its words inside the gap, so neither side
 * is duplicated. The notes the filled blocks cite come with them, from the
 * shadow's notes on their pages, relabelled "N-90xx" so they never collide with
 * the edition's; a marker whose note is not found is left as its bare number,
 * as the PDF prints it. Every filled block carries its PDF page as `source`.
 *
 * Text the PDF prints and the edition lacks *outside* a declared gap is not
 * filled: it stays a "PDF text not in the edition" suspect (a map legend, a
 * diagram's labels), because an edition that leaves something out on purpose
 * looks the same to the alignment as one that lost it.
 */
export function fillGaps(edition: Edition, pages: Page[], shadow: ShadowText): { edition: Edition; filled: FilledGap[] } {
  const gapAt = edition.blocks.flatMap((block, b) => (block.kind === "gap" ? [b] : []));
  if (!gapAt.length) return { edition, filled: [] };

  // the PDF body's words, as assembleEdition reads them (a page's lifted notes are not body)
  type PTok = Token & { page: number };
  const pdf: PTok[] = [];
  pages.forEach((page, p) => {
    const foot = page.footLines ?? 0;
    const text = page.lines.join("\n");
    const footStart = foot > 0 ? page.lines.slice(0, page.lines.length - foot).join("\n").length : text.length;
    for (const t of tokens(text)) if (t.start < footStart) pdf.push({ ...t, page: p });
  });
  const pdfWords = pdf.map((t) => t.word);

  // the edition's body words, each with its block
  const editionBlockOf: number[] = [];
  const editionWords: string[] = [];
  const blocks = structuredClone(edition.blocks);
  fieldsOf(blocks, []).forEach((field) => {
    for (const t of fieldTokens(field.get())) {
      editionWords.push(t.word);
      editionBlockOf.push(field.block);
    }
  });
  const { map: editionMap } = align(editionWords, pdfWords);

  // each gap's PDF stretch: after the last aligned edition word before it, before the first after it
  const bounds = gapAt.map((g) => {
    let lo = -1;
    let hi = pdf.length;
    for (let c = 0; c < editionWords.length; c++) {
      if (editionMap[c] < 0) continue;
      if (editionBlockOf[c] < g) lo = Math.max(lo, editionMap[c]);
      else if (editionBlockOf[c] > g && editionMap[c] < hi) hi = editionMap[c];
    }
    return { lo, hi };
  });
  const gapOfPdf = (j: number) => bounds.findIndex(({ lo, hi }) => j > lo && j < hi);

  // the shadow's blocks, each word placed in the PDF
  type Piece = { b: number; field: number; text: string; toks: Token[] };
  const pieces: Piece[] = [];
  const shadowWords: string[] = [];
  const shadowOwner: Array<{ piece: number; tok: number }> = [];
  const texts = shadow.blocks.map((block, b) => shadowText(block, shadow.linkedText?.[b]));
  texts.forEach((text, b) => {
    if (text === undefined) return;
    (Array.isArray(text) ? text : [text]).forEach((field, f) => {
      const toks = fieldTokens(field);
      toks.forEach((t, k) => {
        shadowWords.push(t.word);
        shadowOwner.push({ piece: pieces.length, tok: k });
      });
      pieces.push({ b, field: f, text: field, toks });
    });
  });
  const { map: shadowMap } = align(shadowWords, pdfWords);
  const pdfOf = pieces.map((piece) => new Array<number>(piece.toks.length).fill(-1));
  shadowOwner.forEach(({ piece, tok }, k) => (pdfOf[piece][tok] = shadowMap[k]));

  // which gap each shadow block belongs to: where most of its placed words are
  const blockGap = new Map<number, number>();
  const placed = new Map<number, number[]>();
  pieces.forEach((piece, i) => {
    const list = placed.get(piece.b) ?? [];
    for (const j of pdfOf[i]) if (j >= 0) list.push(j);
    placed.set(piece.b, list);
  });
  const order = [...placed.keys()].sort((a, b) => a - b);
  for (const b of order) {
    const js = placed.get(b)!;
    if (!js.length) continue;
    const votes = new Map<number, number>();
    for (const j of js) votes.set(gapOfPdf(j), (votes.get(gapOfPdf(j)) ?? 0) + 1);
    const [best, n] = [...votes].sort((x, y) => y[1] - x[1])[0];
    if (best >= 0 && n * 2 >= js.length) blockGap.set(b, best);
    else if (best >= 0 || votes.has(-1)) {
      // straddles an edge: kept, and cut to its words inside the gap, if a gap holds any of them
      const inside = [...votes].filter(([g]) => g >= 0).sort((x, y) => y[1] - x[1])[0];
      if (inside) blockGap.set(b, inside[0]);
    }
  }
  // a block none of whose words placed (a heading the contents supplied) goes with both neighbours, if they agree
  for (let k = 0; k < order.length; k++) {
    const b = order[k];
    if (placed.get(b)!.length) continue;
    let prev = k - 1;
    while (prev >= 0 && !placed.get(order[prev])!.length) prev--;
    let next = k + 1;
    while (next < order.length && !placed.get(order[next])!.length) next++;
    const gp = prev >= 0 ? blockGap.get(order[prev]) : undefined;
    const gn = next < order.length ? blockGap.get(order[next]) : undefined;
    if (gp !== undefined && gp === gn) blockGap.set(b, gp);
  }

  // the filled blocks, gap by gap, in the shadow's order
  const titles = new Set(
    edition.blocks.flatMap((block) => (block.kind === "heading" ? [fieldTokens(block.text).map((t) => t.word).join(" ")] : []))
  );
  const dropped = gapAt.map(() => 0);
  const fills: EditionBlock[][] = gapAt.map(() => []);
  const fillPages: Array<Array<{ volume: number; pdfIndex: number }>> = gapAt.map(() => []);
  const wordsIn = gapAt.map(() => 0);
  for (const b of order) {
    const g = blockGap.get(b);
    if (g === undefined) continue;
    const block = shadow.blocks[b];
    const own = pieces.flatMap((piece, i) => (piece.b === b ? [i] : []));
    // cut a paragraph or quotation at the gap's edge: from its first word inside, to after its last
    const cut = (i: number): string | undefined => {
      const piece = pieces[i];
      const inside = pdfOf[i].map((j) => j >= 0 && gapOfPdf(j) === g);
      const first = inside.indexOf(true);
      const last = inside.lastIndexOf(true);
      if (first < 0) return undefined;
      const allInside = pdfOf[i].every((j, k) => inside[k] || j < 0);
      if (allInside) return piece.text;
      const start = first === 0 ? 0 : piece.toks[first].start;
      const end = last === piece.toks.length - 1 ? piece.text.length : piece.toks[last + 1].start;
      return piece.text.slice(start, end).trim();
    };
    const page = (() => {
      const js = own.flatMap((i) => pdfOf[i].filter((j) => j >= 0 && gapOfPdf(j) === g));
      return js.length ? pages[pdf[Math.min(...js)].page] : block.at ? pages.find((p) => p.volume === block.at!.volume && p.pdfIndex === block.at!.pdfIndex) : undefined;
    })();
    const source: BlockSource | undefined = page
      ? { pdf: { volume: page.volume, pdfIndex: page.pdfIndex }, gap: (edition.blocks[gapAt[g]] as { reason: string }).reason }
      : undefined;
    let filled: EditionBlock | undefined;
    if (block.kind === "paragraph" || block.kind === "quote") {
      const text = own.length ? cut(own[0]) : (shadowText(block, shadow.linkedText?.[b]) as string);
      if (text) filled = { kind: block.kind, text };
    } else if (block.kind === "heading") filled = { kind: "heading", level: block.level, text: shadowText(block, shadow.linkedText?.[b]) as string };
    else if (block.kind === "contents") filled = { kind: "contents", text: block.text, page: block.page };
    else if (block.kind === "list") {
      const items = own.length ? own.map((i) => cut(i)).filter((t): t is string => Boolean(t)) : [...block.items];
      if (items.length) filled = { kind: "list", items, ...(block.quoted ? { quoted: true } : {}) };
    }
    if (!filled) continue;
    // what is not text the edition lacks: a bare number (a page number, a marker on its own line), and a
    // title the edition already holds (the PDF's running head, a divider page repeating a chapter's title)
    const words = fieldsOf([filled], []).flatMap((field) => fieldTokens(field.get()).map((t) => t.word));
    // (a contents entry among others is the contents page's own, and kept)
    const lone = (k: number) => shadow.blocks[k]?.kind !== "contents";
    // (a heading the layout showed set in the body's flow, by face and size, is not one: subsection titles recur)
    const runningHead = (filled.kind === "heading" && !block.layoutHeading) || (filled.kind === "contents" && lone(b - 1) && lone(b + 1));
    // and words the edition prints right there already: the aligner left a repeated phrase unmatched
    // (Hillsborough's terms of reference quote a clause that Appendix 2 quotes again), not text it lacks
    const nearby = ` ${edition.blocks
      .slice(Math.max(0, gapAt[g] - 100), gapAt[g] + 100)
      .flatMap((block) => fieldsOf([block], []).flatMap((field) => fieldTokens(field.get()).map((t) => t.word)))
      .join(" ")} `;
    // (not a heading: a short heading's words turn up in prose anywhere, "Lack of leadership", and a heading
    // the PDF set apart is not a phrase the aligner dropped)
    const repeated = filled.kind !== "contents" && filled.kind !== "heading" && words.length >= 3 && nearby.includes(` ${words.join(" ")} `);
    // A heading the edition holds right at the gap's edge, which the PDF repeats at the page where the gap
    // begins or ends (the web page ended on it): the edition's own is the one to keep.
    const atEdge =
      filled.kind === "heading" &&
      [edition.blocks[gapAt[g] - 1], edition.blocks[gapAt[g] + 1]].some(
        (neighbour) => neighbour?.kind === "heading" && fieldTokens(neighbour.text).map((t) => t.word).join(" ") === words.join(" ")
      );
    if (!words.some(hasLetter) || (runningHead && titles.has(words.join(" "))) || repeated || atEdge) {
      dropped[g]++;
      continue;
    }
    if (source) {
      filled.source = source;
      fillPages[g].push(source.pdf);
    }
    wordsIn[g] += fieldsOf([filled], []).reduce((n, field) => n + fieldTokens(field.get()).length, 0);
    fills[g].push(filled);
  }

  // the notes the filled blocks cite, from the shadow's notes on and after their pages
  const notes = [...edition.notes];
  const labelOf = (note: ShadowText["footnotes"][number]) => note.label ?? String(note.number);
  const used = new Set<number>();
  const noteCount = gapAt.map(() => 0);
  const pagePos = new Map(pages.map((page, p) => [`${page.volume}:${page.pdfIndex}`, p]));
  const notesFor: Array<EditionNote[]> = gapAt.map(() => []);
  fills.forEach((list, g) => {
    for (const block of list) {
      const at = block.source && "pdf" in block.source ? pagePos.get(`${block.source.pdf.volume}:${block.source.pdf.pdfIndex}`) : undefined;
      const relink = (text: string) =>
        text.replace(/\[\^([^\]]+)\]/g, (_whole, label: string) => {
          // the first unused note with this label on the block's page or a few after it (a paragraph runs on)
          const k = shadow.footnotes.findIndex((note, n) => {
            if (used.has(n) || labelOf(note) !== label) return false;
            const p = pagePos.get(`${note.volume}:${note.pdfIndex}`);
            return at === undefined || p === undefined || (p >= at && p <= at + 3);
          });
          if (k < 0) return label.replace(/-\d+$/, "");
          used.add(k);
          const note = shadow.footnotes[k];
          const fresh = `${String(note.number)}-${GAP_NOTE_BASE + g + 1}`;
          notesFor[g].push({ label: fresh, text: note.text });
          noteCount[g]++;
          return `[^${fresh}]`;
        });
      if (block.kind === "list") block.items = block.items.map(relink);
      else if (block.kind !== "gap" && block.kind !== "table") block.text = relink(block.text);
    }
  });

  // splice: each gap's fill where the gap was, its notes after the last note cited before it
  const out: EditionBlock[] = [];
  const cited = (block: EditionBlock): string[] => {
    const text = block.kind === "list" ? block.items.join(" ") : block.kind === "table" ? block.rows.flat().join(" ") : block.kind === "gap" ? "" : block.text;
    return [...text.matchAll(/\[\^([^\]]+)\]/g)].map((m) => m[1]);
  };
  const noteIndex = new Map(notes.map((note, n) => [note.label, n]));
  const insertAfter: number[] = [];
  let lastCited = -1;
  let g = 0;
  for (const block of blocks) {
    if (block.kind === "gap") {
      out.push(...fills[g]);
      insertAfter.push(lastCited);
      g++;
      continue;
    }
    for (const label of cited(block)) lastCited = Math.max(lastCited, noteIndex.get(label) ?? -1);
    out.push(block);
  }
  const allNotes: EditionNote[] = [];
  const byPosition = new Map<number, EditionNote[]>();
  insertAfter.forEach((after, k) => byPosition.set(after, [...(byPosition.get(after) ?? []), ...notesFor[k]]));
  allNotes.push(...(byPosition.get(-1) ?? []));
  notes.forEach((note, n) => {
    allNotes.push(note);
    allNotes.push(...(byPosition.get(n) ?? []));
  });

  const filled: FilledGap[] = gapAt.map((at, k) => {
    const first = fills[k][0];
    const opening = first ? fieldsOf([first], [])[0]?.get().split(/\s+/).slice(0, 8).join(" ") : undefined;
    return {
      reason: (edition.blocks[at] as { reason: string }).reason,
      blocks: fills[k].length,
      ...(dropped[k] ? { dropped: dropped[k] } : {}),
      words: wordsIn[k],
      notes: noteCount[k],
      ...(fillPages[k].length ? { from: fillPages[k][0], to: fillPages[k][fillPages[k].length - 1] } : {}),
      ...(opening ? { opening } : {}),
    };
  });
  return { edition: { blocks: out, notes: allNotes }, filled };
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
    case "gap":
      throw new Error(`cleanEdition: an unfilled gap reached the output (${block.reason})`);
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "quote":
      // a quotation of several paragraphs (a boxed extract) is one blockquote
      return block.text
        .split("\n\n")
        .map((paragraph) => `> ${escapeOpening(paragraph)}`)
        .join("\n>\n");
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
