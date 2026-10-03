import type { Layout, LayoutLine, PageLayout } from "./layout";
import type { Block } from "./paragraphs";
import type { Footnote } from "./footnotes";
import { linkInlineMarkers } from "./footnotes";
import { noteOffPage } from "./noteplace";

/**
 * The layout oracle (quality-harness plan §3.3): what the PDF's own layout
 * says the structure is, set against what the pipeline produced.
 *
 * Measure-only. Nothing here feeds back into any output, and it is not a
 * second parser: it derives *expected* headings, markers, paragraph starts
 * and quotations per page from font, size, colour and position, and counts
 * the disagreements. A count is a prompt to look, not a verdict: precision
 * per signal is measured against golden pages and recorded in the site's
 * `docs/quality-harness.md` before any signal is budgeted.
 *
 * Each produced element is located on its source page by its opening
 * characters. An element that cannot be located (a heading synthesised from
 * a contents list, garbled OCR) is counted under `unlocated`, not as a
 * disagreement.
 */

export type OracleSignal =
  | "headings-missed"
  | "headings-spurious"
  | "markers-unlinked"
  | "markers-spurious"
  | "paragraphs-oversplit"
  | "paragraphs-merged"
  | "quotes-spurious"
  | "quotes-missed"
  | "note-off-page";

export type OracleFinding = { signal: OracleSignal; volume: number; page: number; text: string };

export type PageCounts = Record<OracleSignal, number>;

export type OracleReport = {
  counts: PageCounts;
  /** What the layout expects, in total. */
  expected: { headings: number; markers: number; paragraphStarts: number; quoteRuns: number };
  /** What the pipeline produced that the layout could be compared with. */
  produced: { headings: number; markers: number; paragraphStarts: number; quotes: number };
  /** Produced elements whose opening could not be found on their source page. */
  unlocated: { headings: number; paragraphStarts: number; quotes: number };
  /** Per page, only where something disagrees; key `volume:page`. */
  pages: Record<string, PageCounts>;
  findings: OracleFinding[];
  /** The first few elements that could not be located, to see why. */
  unlocatedSamples: Array<{ kind: string; volume: number; page: number; text: string; reason: string }>;
};

export const ORACLE_SIGNALS: OracleSignal[] = [
  "headings-missed",
  "headings-spurious",
  "markers-unlinked",
  "markers-spurious",
  "paragraphs-oversplit",
  "paragraphs-merged",
  "quotes-spurious",
  "quotes-missed",
  "note-off-page",
];

const zero = (): PageCounts => Object.fromEntries(ORACLE_SIGNALS.map((s) => [s, 0])) as PageCounts;

/** Thresholds, in one place so a measurement can say what it measured with. */
export const ORACLE = {
  /** Heading: at least this much bigger than the body... */
  headingSizePt: 2,
  /** ...or a different colour, but then not smaller than the body by more than this. */
  headingColourFloorPt: 1,
  /** A heading runs to at most this many lines and characters. */
  headingMaxLines: 3,
  headingMaxChars: 160,
  /** A gap of this many line pitches between body lines starts a paragraph. */
  gapPitches: 1.4,
  /** A first line this far (ems) from the line under it starts a paragraph. */
  indentEm: 0.6,
  /** The line under it counts as flush with the margin within this (ems). */
  flushEm: 0.4,
  /** Quotation: both sides in from the body measure by this (ems). */
  quoteEm: 1,
  /** Text (digits aside) that repeats in the same place on this many pages is furniture. */
  furniturePages: 4,
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** The line's text without its label ("151." "(b)" "•"), normalised. */
const bare = (s: string) =>
  norm(s.trim().replace(/^(?:\d{1,4}(?:\.\d{1,4})*[.)]\s*|\d{1,4}(?:\.\d{1,4})*\s+|[a-z][.)]\s+|\([a-z0-9]{1,4}\)\s*|[•·▪–-]\s+)/, ""));

type At = { volume: number; page: number };
const at = (b: Block): At | undefined => (b.at ? { volume: b.at.volume, page: b.at.pdfIndex } : undefined);
const pageKey = (volume: number, page: number) => `${volume}:${page}`;

function blockTexts(b: Block): string[] {
  if (b.kind === "paragraph" || b.kind === "quote") return [b.text];
  if (b.kind === "list") return b.items;
  return [];
}

/** Whether each body line on the page opens a paragraph by its own layout. */
function paragraphStarts(
  page: PageLayout,
  fallbackPitch: number,
  skip: Set<LayoutLine>,
  /** The last line of body text on the page before, to say whether its paragraph ended there. */
  before?: LayoutLine
): Map<LayoutLine, boolean> {
  const out = new Map<LayoutLine, boolean>();
  const body = page.lines.filter((l) => l.body && !skip.has(l) && l.text.trim().length > 0);
  const pitch = page.pitch || fallbackPitch;
  body.forEach((l, i) => {
    const prev = body[i - 1];
    const next = body[i + 1];
    const em = l.size || 1;
    const thr = ORACLE.indentEm * em;
    const off = (x: LayoutLine) => Math.abs(x.left - page.left) >= thr;
    const above = prev && prev.top < l.top ? prev : undefined;
    // Anything but body text directly above (a heading, a label, a caption) opens a paragraph.
    let lead: LayoutLine | undefined;
    for (let j = l.index - 1; j >= 0 && !lead; j--) {
      const x = page.lines[j];
      if (!skip.has(x) && x.text.trim() && x.top < l.top - 2) lead = x;
    }
    let start = false;
    // (a short line: an italic or footnote-marker run mid-paragraph runs to the margin)
    if (lead && !lead.body && !lead.reachesRight && (!pitch || l.top - lead.top < 3 * pitch)) {
      start = true;
    } else if (above && pitch && l.top - above.top >= ORACLE.gapPitches * pitch) {
      start = true;
    } else if (above) {
      // A change of left against the line above: an indented or hanging first line, or a quotation
      // opening. Coming back to the margin from an indented line that was not itself an opening is
      // the text resuming after a quotation.
      // (the line above stops short of the margin, or this line is one indented line against flush
      // ones below: a hanging or wrapped line follows a full line and is followed by indented ones)
      const openingAgainstNext = next && next.top > l.top && Math.abs(next.left - page.left) < thr && Math.abs(l.left - next.left) >= thr;
      if (off(l) && Math.abs(l.left - above.left) >= thr && (!above.reachesRight || openingAgainstNext)) start = true;
      else if (!off(l) && off(above) && !out.get(above)) start = true;
    } else {
      // First line of the page. Indented against the line under it, or opening on a label, or the
      // paragraph above ended short of the margin on the page before: a start. Otherwise it
      // carries on from the page before, which is where a page-break severing shows.
      if (off(l) && next && next.top > l.top && Math.abs(l.left - next.left) >= thr) start = true;
      else if (STRONG_LABEL.test(l.text.trim())) start = true;
      else if (before && !before.reachesRight) start = true;
    }
    out.set(l, start);
  });
  return out;
}

/** A label that opens a numbered paragraph or a list item: "2.10.68", "(b)", a bullet. */
const STRONG_LABEL = /^(?:\d{1,3}(?:\.\d{1,4})+\.?\s|\d{1,4}\.\s|\([a-z0-9]{1,4}\)\s|[•·▪]\s)/;

type Run = {
  lines: LayoutLine[];
  /** Also in from the right: all but the last line stop short of the body's right edge. */
  both: boolean;
};

/**
 * Runs of 2+ consecutive lines in from the body margin. Most reports inset a
 * quotation on both sides, some (PSI) on the left only, so a run is a quotation
 * on the left alone and `both` says it was inset on the right too.
 */
function quoteRuns(page: PageLayout, bodySize: number, skip: Set<LayoutLine>): Run[] {
  const runs: Run[] = [];
  let cur: LayoutLine[] = [];
  const flush = () => {
    if (cur.length >= 2) {
      // all but the last line of a quotation run to its own (narrower) right edge, short of the body's
      const full = cur.slice(0, -1);
      runs.push({ lines: cur, both: full.every((l) => l.rightGapEm >= 0.8 * ORACLE.quoteEm) });
    }
    cur = [];
  };
  for (const l of page.lines) {
    if (!skip.has(l) && l.size > 0 && Math.abs(l.size - bodySize) <= 1.5 && l.indentEm >= ORACLE.quoteEm && !l.label) cur.push(l);
    else flush();
  }
  flush();
  return runs;
}

/**
 * A raised number that opens its line is a note's own number, on a page of
 * notes (Columbia's and Deepwater's endnotes) or at the foot of one (Lehman's
 * footnotes), not a marker in the text. A marker sits after a word.
 * Labelled notes (`[^N-label]`, Saville's, the hybrid path's) are read as note N:
 * the raised digits in the PDF are N.
 */
function definesNote(line: LayoutLine, run: { text: string; left: number }): boolean {
  return line.text.trim().startsWith(run.text) && run.left - line.left < 5;
}

function furniture(layout: Layout): Set<LayoutLine> {
  // Running heads and folios: the same text (digits aside) in the same place on several pages.
  const place = (l: LayoutLine) => `${norm(l.text.replace(/\d+/g, ""))}|${Math.round(l.top / 20)}`;
  const pagesWith = new Map<string, Set<string>>();
  const all: LayoutLine[] = [];
  for (let v = 1; v <= layout.volumes; v++) {
    for (const p of layout.pages(v)) {
      for (const l of layout.lines(v, p)) {
        all.push(l);
        const k = place(l);
        if (!pagesWith.has(k)) pagesWith.set(k, new Set());
        pagesWith.get(k)!.add(pageKey(v, p));
      }
    }
  }
  const out = new Set<LayoutLine>();
  for (const l of all) {
    if (!norm(l.text.replace(/\d+/g, "")) || (pagesWith.get(place(l))?.size ?? 0) >= ORACLE.furniturePages) out.add(l);
  }
  return out;
}

type Heading = { lines: LayoutLine[]; text: string };

function expectedHeadings(page: PageLayout, bodyFont: { size: number; color: string }, skip: Set<LayoutLine>): Heading[] {
  const bodyLine = page.lines.find((l) => l.body);
  // (a page that is mostly footnotes takes their face for its body; its text, at the document's
  // size, is not "bigger" than that: measure against the larger of the two)
  const size = Math.max(bodyLine?.size ?? bodyFont.size, bodyFont.size);
  const color = bodyLine?.color ?? bodyFont.color;
  const out: Heading[] = [];
  let cur: LayoutLine[] = [];
  const flush = () => {
    const text = cur.map((l) => l.text.trim()).join(" ");
    // A heading is short. A long run, or one whose lines run to the right margin like a justified
    // paragraph, is body text in a coloured or larger face (a call-out, a pull-quote).
    const justified = cur.length >= 2 && cur.slice(0, -1).every((l) => l.reachesRight);
    if (cur.length && cur.length <= ORACLE.headingMaxLines && text.length <= ORACLE.headingMaxChars && !justified) out.push({ lines: cur, text });
    cur = [];
  };
  for (const l of page.lines) {
    const letters = l.text.replace(/[^\p{L}]/gu, "").length;
    const bigger = l.size >= size + ORACLE.headingSizePt;
    const colour = l.color !== color && l.size >= size - ORACLE.headingColourFloorPt;
    const is =
      !l.body && !skip.has(l) && letters >= 3 && l.text.length <= 200 && (bigger || colour) && l.raised.length === 0 &&
      !/^[“"‘']/.test(l.text.trim());
    if (is) {
      const last = cur[cur.length - 1];
      // a wrapped heading: same font, the next line down within a line and a half
      if (last && (l.font !== last.font || l.top - last.top > 1.6 * Math.max(l.height, last.height) || l.top < last.top)) flush();
      cur.push(l);
    } else flush();
  }
  flush();
  return out;
}

const starts = (a: string, b: string, n = 10) => {
  const k = Math.min(n, a.length, b.length);
  return k >= 3 && a.slice(0, k) === b.slice(0, k);
};

/** The first line on a page whose bare text opens with `text`'s first characters. */
function locate(lines: LayoutLine[], text: string, n = 12): LayoutLine | undefined {
  const head = bare(text).slice(0, n);
  if (head.length < 3) return undefined;
  return lines.find((l) => {
    const b = bare(l.text);
    return b.length >= Math.min(head.length, 3) && (b.startsWith(head) || (b.length < head.length && head.startsWith(b)));
  });
}

/**
 * Measures one report's produced blocks against the PDF's layout.
 *
 * `footnotes` supplies the note numbers a marker may link to, as the pipeline
 * itself links them (`linkInlineMarkers`).
 */
export function measureLayout(
  layout: Layout,
  blocks: Block[],
  footnotes: Array<Pick<Footnote, "number"> & Partial<Pick<Footnote, "text" | "label" | "volume" | "pdfIndex">>> = [],
  /**
   * `relink: false` when `blocks` come from `finalBlocks` and their markers are the pipeline's own.
   * Re-linking them with `linkInlineMarkers` counts links the reader never sees wherever the
   * pipeline did not run it (a report whose layout decides its markers, `layoutMarkers`; paragraph notes).
   */
  options: {
    relink?: boolean;
    /**
     * Count `note-off-page`: references whose rendered note was printed more than a page from the
     * marker (`noteOffPage`). Only for a report whose notes are page footnotes (`hasPageNotes`), and
     * needs `blocks` from `finalBlocks`; `footnotes` must be the whole `IngestResult.footnotes`.
     */
    noteOffPage?: boolean;
  } = {}
): OracleReport {
  const relink = options.relink ?? true;
  const counts = zero();
  const pages: Record<string, PageCounts> = {};
  const findings: OracleFinding[] = [];
  const expected = { headings: 0, markers: 0, paragraphStarts: 0, quoteRuns: 0 };
  const produced = { headings: 0, markers: 0, paragraphStarts: 0, quotes: 0 };
  const unlocated = { headings: 0, paragraphStarts: 0, quotes: 0 };
  const note = (signal: OracleSignal, volume: number, page: number, text: string) => {
    counts[signal]++;
    (pages[pageKey(volume, page)] ??= zero())[signal]++;
    findings.push({ signal, volume, page, text: text.slice(0, 90) });
  };

  const unlocatedSamples: OracleReport["unlocatedSamples"] = [];
  const miss = (kind: string, volume: number, page: number, text: string, reason: string) => {
    if (unlocatedSamples.length < 200) unlocatedSamples.push({ kind, volume, page, text: text.slice(0, 70), reason });
  };

  const known = new Set(footnotes.map((n) => n.number));
  const fur = furniture(layout);
  const notesBy = new Map<string, string[]>();
  for (const n of footnotes) {
    if (n.text === undefined || n.pdfIndex === undefined) continue;
    const k = pageKey(n.volume ?? 1, n.pdfIndex);
    notesBy.set(k, [...(notesBy.get(k) ?? []), bare(n.text).slice(0, 40)]);
  }
  // A note that runs over the page starts the next page's block of lines: look a page either side.
  const notesOn = (v: number, p: number) => [p - 1, p, p + 1].flatMap((q) => notesBy.get(pageKey(v, q)) ?? []);
  const bodyFont = layout.bodyFont;

  // Produced elements by page.
  const byPage = new Map<string, Block[]>();
  for (const b of blocks) {
    const a = at(b);
    if (!a) continue;
    const k = pageKey(a.volume, a.page);
    byPage.set(k, [...(byPage.get(k) ?? []), b]);
  }

  // Pitch to fall back on where a page has too few body lines to say.
  const pitches: number[] = [];
  for (let v = 1; v <= layout.volumes; v++) for (const p of layout.pages(v)) pitches.push(layout.page(v, p)!.pitch);
  const nonzero = pitches.filter(Boolean).sort((a, b) => a - b);
  const fallbackPitch = nonzero[Math.floor(nonzero.length / 2)] ?? 0;

  // Markers are matched across the page break, so keep each page's pool.
  const pool = new Map<string, string[]>();
  const producedMarkers: Array<{ volume: number; page: number; label: string }> = [];

  for (let v = 1; v <= layout.volumes; v++) {
    for (const p of layout.pages(v)) {
      const page = layout.page(v, p)!;
      const lines = page.lines;
      const mine = byPage.get(pageKey(v, p)) ?? [];

      // — Headings —
      const wantHeadings = expectedHeadings(page, bodyFont, fur);
      const madeHeadings = mine.filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading");
      expected.headings += wantHeadings.length;
      for (const h of wantHeadings) {
        const text = norm(h.text);
        if (!madeHeadings.some((m) => starts(norm(m.text), text, 12))) note("headings-missed", v, p, h.text);
      }
      for (const m of madeHeadings) {
        const line = locate(lines, m.text, 10);
        if (!line) {
          unlocated.headings++;
          continue;
        }
        produced.headings++;
        // set in the body's own font, on a body line: a caption or a lead-in read as a heading
        if (line.body && !wantHeadings.some((h) => h.lines.includes(line))) note("headings-spurious", v, p, m.text);
      }

      // — Paragraph boundaries —
      // Footnote text is set in the body font too; the pipeline reads it as notes, not blocks.
      const noteHeads = notesOn(v, p);
      const skip = new Set([...fur, ...lines.filter((l) => noteHeads.some((h) => h.startsWith(bare(l.text).slice(0, 14)) && bare(l.text).length >= 6))]);
      const prevPage = layout.page(v, p - 1);
      const before = prevPage && [...prevPage.lines].reverse().find((l) => l.body && !fur.has(l) && l.text.trim().length > 0);
      const startOf = paragraphStarts(page, fallbackPitch, skip, before || undefined);
      const wantStarts = [...startOf].filter(([, s]) => s).map(([l]) => l);
      expected.paragraphStarts += wantStarts.length;
      const heads: string[] = [];
      for (const b of mine) {
        if (b.kind === "paragraph" || b.kind === "quote" || b.kind === "list") {
          for (const t of blockTexts(b)) heads.push(bare(t).slice(0, 40));
        }
      }
      for (const l of wantStarts) {
        const k = bare(l.text).slice(0, 20);
        if (k.length < 3) continue;
        if (!heads.some((h) => h.startsWith(k))) note("paragraphs-merged", v, p, l.text);
      }
      for (const b of mine) {
        if (b.kind !== "paragraph" && b.kind !== "quote") continue;
        const line = locate(lines, b.text, 12);
        if (!line || !line.body) {
          unlocated.paragraphStarts++;
          miss("paragraph", v, p, b.text, line ? "not body font" : "not on page");
          continue;
        }
        produced.paragraphStarts++;
        if (!startOf.get(line)) note("paragraphs-oversplit", v, p, b.text);
      }

      // — Quotations —
      const runs = quoteRuns(page, page.lines.find((l) => l.body)?.size ?? bodyFont.size, skip);
      expected.quoteRuns += runs.filter((r) => r.both).length;
      const quotes = mine.filter((b): b is Extract<Block, { kind: "quote" }> => b.kind === "quote");
      const inRun = new Set(runs.flatMap((r) => r.lines));
      for (const q of quotes) {
        const line = locate(lines, q.text, 12);
        if (!line) {
          unlocated.quotes++;
          continue;
        }
        produced.quotes++;
        if (!inRun.has(line)) note("quotes-spurious", v, p, q.text);
      }
      for (const r of runs.filter((x) => x.both)) {
        const k = bare(r.lines[0].text).slice(0, 20);
        if (k.length >= 3 && !quotes.some((q) => bare(q.text).startsWith(k))) note("quotes-missed", v, p, r.lines[0].text);
      }

      // — Markers —
      const labels: string[] = [];
      // (a page that is mostly footnotes has the notes' face as its body: take the document's too)
      const inBody = (l: LayoutLine) => l.body || (Math.abs(l.size - bodyFont.size) < 0.5 && l.color === bodyFont.color);
      for (const l of lines) if (inBody(l)) for (const r of l.raised) if (/^\d{1,4}$/.test(r.text) && !definesNote(l, r)) labels.push(r.text);
      expected.markers += labels.length;
      pool.set(pageKey(v, p), labels);
      for (const b of mine) {
        for (const t of blockTexts(b)) {
          const linked = relink && known.size ? linkInlineMarkers(t, known) : t;
          for (const m of linked.matchAll(/\[\^(\d+)(?:-[^\]\s]+)?\]/g)) producedMarkers.push({ volume: v, page: p, label: m[1] });
        }
      }
    }
  }

  // A produced marker consumes an expected one on its own page, else on the next (a paragraph
  // carried over the break holds markers from both). What is left over is unlinked.
  produced.markers = producedMarkers.length;
  for (const m of producedMarkers) {
    let hit = false;
    for (const q of [m.page, m.page + 1]) {
      const labels = pool.get(pageKey(m.volume, q));
      const i = labels?.indexOf(m.label) ?? -1;
      if (labels && i >= 0) {
        labels.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (!hit) note("markers-spurious", m.volume, m.page, `[^${m.label}]`);
  }
  for (const [k, labels] of pool) {
    const [v, p] = k.split(":").map(Number);
    for (const label of labels) note("markers-unlinked", v, p, label);
  }

  if (options.noteOffPage) {
    for (const o of noteOffPage(blocks, footnotes as Footnote[])) {
      note("note-off-page", o.volume, o.page, `[^${o.label}] opens a note from ${o.definedVolume > 1 || o.volume > 1 ? `vol ${o.definedVolume} ` : ""}p.${o.definedPage}`);
    }
  }

  return { counts, expected, produced, unlocated, pages, findings, unlocatedSamples };
}
