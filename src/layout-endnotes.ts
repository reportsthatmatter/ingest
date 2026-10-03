import { normaliseWhitespace } from "./extract";
import type { Footnote } from "./footnotes";
import type { Layout, LayoutLine } from "./layout";
import type { Block } from "./paragraphs";

/**
 * Endnotes read off the PDF's layout (reportsthatmatter-b89, reportsthatmatter-izw).
 *
 * Some reports print their notes in sections of their own, numbered afresh
 * for each chapter: Deepwater Horizon in one "Endnotes" appendix with a
 * "Chapter One" ... "Chapter Ten" subhead before each chapter's notes;
 * Columbia at the end of each chapter, under "ENDNOTES FOR CHAPTER 5", set in
 * two columns. `pdftotext -layout` cannot be read as notes on those pages:
 * Columbia's two columns of notes arrive on one line each ("The citations
 * that contain ... CAB or      9"), and Deepwater sets half its note numbers
 * as a small number on a line of its own, so the text-based readers kept the
 * notes as body paragraphs and the body's markers had nothing to open.
 *
 * The layout says what each line is: a notes section opens under a heading
 * "Endnotes" / "Notes" (optionally "for Chapter 5") set bigger than the
 * body; a note opens on its number, raised or set small at the column's
 * note margin; its other lines hang under it; a subhead set bigger than the
 * notes restarts the numbering for the next chapter. Each note is labelled
 * `N-C` (note N of the C-th chapter whose notes the report prints), and the
 * body's markers are linked to the notes of the chapter they sit in, which is
 * found by its heading: the subhead's or the section heading's own words
 * ("Chapter One", "CHAPTER 5") open a body heading ("Chapter One: ...",
 * "Chapter 5: From Challenger to Columbia"). Notes printed at the back are
 * never paired with a marker by page.
 */

/** A notes section's heading: "ENDNOTES", "Notes", "ENDNOTES FOR CHAPTER 5", "Notes to Appendix A". */
const NOTES_HEAD = /^(?:end\s?)?notes(?:\s+(?:for|to)\s+(.{1,40}))?$/i;

/** How far a note's number may run ahead of the note before it (a note set where the reader missed it). */
const MAX_NOTE_STEP = 8;

/** One chapter whose notes the report prints: its label, the words its body heading opens with, and its note numbers. */
export type EndnoteChapter = {
  /** `C` in `N-C`: 1-based, in the order the notes are printed. */
  key: number;
  /** The words that name it ("Chapter One", "CHAPTER 5"), or undefined when nothing names it. */
  name?: string;
  numbers: Set<number>;
  /** Where its notes section opens: its body ends there at the latest. */
  notesAt: { volume: number; pdfIndex: number };
};

type PageAt = { index: number; volume: number; pdfIndex: number; printed: number | null };

export type EndnotesPage = {
  /** The text reader's own lines printed above the section heading: the page's body, to be read as before. */
  body: string[];
  /**
   * The section heading and its preamble (what precedes the first note), as the layout sets them. Added
   * to the body after the page's furniture is taken off: Columbia repeats its preamble under every
   * section heading, and on a page of notes those lines sit at the page's edge, where repetition is
   * what marks furniture.
   */
  heading: string[];
  notes: Footnote[];
};

const squash = (s: string) => s.replace(/\s+/g, "");
const lettersOf = (s: string) => s.replace(/[^\p{L}]/gu, "").length;
const normal = (s: string) => normaliseWhitespace(s.replace(/ /g, " "));
const familyBase = (family: string) => family.replace(/(?:Bold)?(?:Italic|Oblique)$/i, "").replace(/[-,]$/, "");

/** Words for matching a chapter name against a heading: lower case, letters and digits. */
export function headingWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Reads the notes sections page by page, in document order. Holds the open
 * section (if any) across pages.
 */
export class LayoutEndnotesReader {
  readonly chapters: EndnoteChapter[] = [];
  private open = false;
  private noteSize = 0;
  private noteFamily = "";
  private columns: number[] = [];
  private prev = 0;
  private current: Footnote | undefined;
  private furnitureKeys = new Map<number, Map<string, number>>();

  constructor(private readonly layout: Layout) {}

  /** Lines that recur in the same place on three or more pages of the volume (running heads, folios, banners). */
  private isFurniture(line: LayoutLine): boolean {
    let keys = this.furnitureKeys.get(line.volume);
    if (!keys) {
      keys = new Map();
      for (const p of this.layout.pages(line.volume)) {
        const seen = new Set<string>();
        for (const l of this.layout.lines(line.volume, p)) {
          const k = this.placeKey(l);
          if (seen.has(k)) continue;
          seen.add(k);
          keys.set(k, (keys.get(k) ?? 0) + 1);
        }
      }
      this.furnitureKeys.set(line.volume, keys);
    }
    return (keys.get(this.placeKey(line)) ?? 0) >= 3;
  }

  private placeKey(l: LayoutLine): string {
    return `${normal(l.text).replace(/\d+/g, "#").toLowerCase()}|${Math.round(l.top / 20)}`;
  }

  /** A section heading on this line, with the words after "for" when it has them. */
  private headOf(line: LayoutLine, bodySize: number): { name?: string } | undefined {
    if (line.size < bodySize + 1) return undefined;
    const m = normal(line.text).match(NOTES_HEAD);
    if (!m) return undefined;
    return m[1] ? { name: m[1] } : {};
  }

  private inNotesFace(l: LayoutLine): boolean {
    return familyBase(l.family) === this.noteFamily && Math.abs(l.size - this.noteSize) <= 1.5;
  }

  /** A number set alone in a smaller face, the note's text on the next line (Deepwater). */
  private smallNumber(l: LayoutLine): number | undefined {
    const m = l.text.trim().match(/^(\d{1,4})$/);
    if (!m || familyBase(l.family) !== this.noteFamily || l.size >= this.noteSize - 0.5) return undefined;
    return Number(m[1]);
  }

  private columnOf(l: LayoutLine): number {
    let c = 0;
    for (const [i, left] of this.columns.entries()) if (left <= l.left + 3) c = i;
    return c;
  }

  /** A note's opening on this line: its number and the text after it. */
  private opener(l: LayoutLine): { number: number; text: string } | undefined {
    const small = this.smallNumber(l);
    if (small !== undefined) return { number: small, text: "" };
    const run = l.raised[0];
    if (run && run.offset === 0 && /^\d{1,4}$/.test(run.text) && run.left - l.left < 5) {
      return { number: Number(run.text), text: l.text.slice(run.text.length) };
    }
    // An unraised "12 Text" at the column's note margin (the left of its raised openers).
    const m = l.text.match(/^\s*(\d{1,4})\s+(\S.*)$/);
    const margin = this.columns[this.columnOf(l)];
    if (m && margin !== undefined && Math.abs(l.left - margin) <= 2) return { number: Number(m[1]), text: m[2] };
    return undefined;
  }

  /** The column note margins on a page: the lefts of its raised openers, clustered. */
  private learnColumns(lines: LayoutLine[]): void {
    const lefts = lines
      .filter((l) => this.inNotesFace(l) && l.raised[0]?.offset === 0 && /^\d/.test(l.text.trim()))
      .map((l) => l.left)
      .sort((a, b) => a - b);
    const columns: number[] = [];
    for (const left of lefts) {
      if (!columns.length || left - columns[columns.length - 1] > 40) columns.push(left);
    }
    if (columns.length) this.columns = columns;
  }

  private sortByColumn(lines: LayoutLine[]): LayoutLine[] {
    return [...lines].sort((a, b) => this.columnOf(a) - this.columnOf(b) || a.top - b.top || a.left - b.left);
  }

  /**
   * One page. Returns undefined when the page is not part of a notes
   * section (its body is left as the text reader made it).
   */
  page(at: PageAt, rawBody: string[]): EndnotesPage | undefined {
    const page = this.layout.page(at.volume, at.pdfIndex);
    if (!page) return undefined;
    const bodySize = Math.max(this.layout.bodyFont.size, Number(page.bodyFont.split("|")[1]) || 0);
    const inPage = page.lines.filter((l) => l.left >= 0 && l.left < page.width && l.text.trim());
    const head = inPage.find((l) => this.headOf(l, bodySize) && !this.isFurniture(l));

    if (!head && !this.open) return undefined;

    let body: string[] = [];
    const heading: string[] = [];
    let region = inPage;
    if (head) {
      this.closeNote();
      const name = this.headOf(head, bodySize)!.name;
      region = inPage.filter((l) => l.top >= head.top - 1 && l !== head);
      const opening = region.find((l) => l.raised[0]?.offset === 0 && /^\d/.test(l.text.trim()));
      if (!opening) return undefined;
      this.open = true;
      this.noteSize = opening.size;
      this.noteFamily = familyBase(opening.family);
      this.columns = [];
      this.prev = 0;
      this.sectionAt = at;
      if (name !== undefined) this.startChapter(name, at);
      // The body keeps what is printed above the heading (in the text reader's own lines), then the
      // heading and the section's preamble as the layout sets them.
      const headText = normal(head.text);
      // (the line that is the heading: a running head "Endnotes   307   307" also holds its words)
      const key = squash(headText).toLowerCase();
      const cut = rawBody.findIndex((line) => squash(line).toLowerCase() === key);
      body = cut >= 0 ? rawBody.slice(0, cut) : [];
      body.push(...this.furnitureLines(inPage, cut >= 0 ? rawBody.slice(cut + 1) : rawBody, head.top));
      heading.push(cut >= 0 ? rawBody[cut].replace(/\S.*$/, headText) : headText, "");
    }

    this.learnColumns(region);
    const lines = this.sortByColumn(
      rejoinRows(region).filter((l) => this.inNotesFace(l) || this.smallNumber(l) !== undefined || this.bigLine(l))
    );

    // A page after the section's own: still the section only if it reads as notes.
    if (!head) {
      const first = lines.find((l) => !(this.bigLine(l) && this.isFurniture(l)));
      if (!first) return { body: this.furnitureLines(inPage, rawBody), heading: [], notes: [] };
      const firstOpen = this.opener(first);
      const continues =
        (this.inNotesFace(first) || this.smallNumber(first) !== undefined) &&
        (!firstOpen || this.inSequence(firstOpen.number));
      const subhead = this.bigLine(first) && this.subheadAt(lines, 0);
      if (!continues && !subhead) {
        this.closeNote();
        this.open = false;
        return undefined;
      }
      body = this.furnitureLines(inPage, rawBody);
    }

    const notes: Footnote[] = [];
    const preamble: string[] = [];
    let lastTop: number | undefined;
    let prevLine: LayoutLine | undefined;
    for (const [i, l] of lines.entries()) {
      if (this.bigLine(l)) {
        if (this.isFurniture(l)) continue;
        if (this.subheadAt(lines, i)) {
          this.closeNote();
          this.startChapter(normal(l.text), this.sectionAt ?? at);
          this.prev = 0;
        }
        continue;
      }
      // A note set in its neighbour's hang (Deepwater ch. 5 notes 151-152): the very next number,
      // after a paragraph's gap.
      const hung = l.text.match(/^\s*(\d{1,4})\s+(\S.*)$/);
      const open =
        this.opener(l) ??
        (hung && Number(hung[1]) === this.prev + 1 && prevLine && l.top - prevLine.top > 1.4 * l.height
          ? { number: Number(hung[1]), text: hung[2] }
          : undefined);
      prevLine = l;
      if (open && this.inSequence(open.number) && this.chapters.length) {
        this.closeNote();
        this.current = {
          number: open.number,
          label: `${open.number}-${this.chapters[this.chapters.length - 1].key}`,
          text: normal(open.text),
          page: at.index,
          volume: at.volume,
          pdfIndex: at.pdfIndex,
          printed: at.printed,
        };
        this.chapters[this.chapters.length - 1].numbers.add(open.number);
        this.prev = open.number;
        notes.push(this.current);
        continue;
      }
      if (this.current) {
        this.current.text = joinLine(this.current.text, l.text);
        continue;
      }
      // Before the first note: the section's preamble, kept in the body.
      if (head && this.inNotesFace(l)) {
        if (lastTop !== undefined && l.top - lastTop > 1.5 * l.height) preamble.push("");
        preamble.push(normal(l.text));
        lastTop = l.top;
      }
    }
    heading.push(...preamble);
    return { body, heading, notes };
  }

  /**
   * The text reader's lines that hold only the page's running head or foot (Columbia's "238   Report
   * Volume I   August 2003", Deepwater's "Endnotes   307   307"): kept, so the furniture pass finds
   * them on every page as before and reads the printed page number off them.
   */
  private furnitureLines(inPage: LayoutLine[], raw: string[], below = -Infinity): string[] {
    const pieces = inPage
      .filter((l) => l.top > below && !this.inNotesFace(l) && this.smallNumber(l) === undefined && this.isFurniture(l))
      .map((l) => squash(l.text))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (!pieces.length) return [];
    return raw.filter((line) => {
      let rest = squash(line);
      if (!rest) return false;
      for (const piece of pieces) rest = rest.replace(piece, "");
      return !rest;
    });
  }

  /** Where the open section's heading is: its chapters' bodies end there at the latest. */
  private sectionAt: PageAt | undefined;

  private startChapter(name: string, at: { volume: number; pdfIndex: number }): void {
    this.chapters.push({
      key: this.chapters.length + 1,
      name,
      numbers: new Set(),
      notesAt: { volume: at.volume, pdfIndex: at.pdfIndex },
    });
  }

  private inSequence(n: number): boolean {
    return n > this.prev && n <= this.prev + MAX_NOTE_STEP;
  }

  private bigLine(l: LayoutLine): boolean {
    return l.size >= this.noteSize + 2 && lettersOf(l.text) >= 3;
  }

  /** A big line that the numbering restarts under: the next line is note 1. */
  private subheadAt(lines: LayoutLine[], i: number): boolean {
    const next = lines.slice(i + 1).find((l) => !this.bigLine(l));
    const open = next && this.opener(next);
    return open?.number === 1 && normal(lines[i].text).length <= 80;
  }

  private closeNote(): void {
    this.current = undefined;
  }
}

/**
 * A note's opening line that `pdftohtml` split in two: the raised number and an italic title in one
 * line, the roman author's name printed between them a pixel lower in another ("56 Sea Turtles…" and
 * "NOAA,", Deepwater p.355, 69 notes). The fragment that starts just after the number is put back
 * there.
 */
function rejoinRows(lines: LayoutLine[]): LayoutLine[] {
  const taken = new Set<LayoutLine>();
  const out: LayoutLine[] = [];
  for (const l of lines) {
    const run = l.raised[0];
    if (taken.has(l) || !run || run.offset !== 0 || !/^\d{1,4}$/.test(run.text)) {
      out.push(l);
      continue;
    }
    const reach = l.left + (run.text.length + 1) * l.size * 0.7;
    const inner = lines.find(
      (f) => f !== l && !taken.has(f) && Math.abs(f.top - l.top) <= 3 && f.left > l.left && f.left <= reach && !/^\s*\d/.test(f.text)
    );
    if (!inner) {
      out.push(l);
      continue;
    }
    taken.add(inner);
    out.push({ ...l, text: `${run.text} ${inner.text.trim()} ${l.text.slice(run.text.length).trim()}` });
  }
  return out.filter((l) => !taken.has(l));
}

/** A note's next printed line, joined as pdftotext joins a wrapped line (hyphens are rejoined later). */
function joinLine(text: string, line: string): string {
  return normal(`${text} ${line}`);
}

/**
 * Which printed chapter each body block belongs to, for linking its markers.
 *
 * A chapter's body opens at the first heading, after the previous chapter's,
 * whose words begin with the chapter's name ("Chapter One" opens "Chapter
 * One: “Everyone involved…”"), and runs to the next chapter's heading or to
 * where its own notes are printed, whichever comes first. A chapter with no
 * name, or whose heading is not found, links nothing: a bare number is
 * visibly a gap, a marker opening another chapter's note reads as the
 * document.
 */
export function chapterOfBlocks(blocks: Block[], chapters: EndnoteChapter[]): Map<Block, EndnoteChapter> {
  const out = new Map<Block, EndnoteChapter>();
  const starts: Array<{ at: number; chapter: EndnoteChapter }> = [];
  let from = 0;
  for (const chapter of chapters) {
    if (!chapter.name) continue;
    const name = headingWords(chapter.name);
    if (!name) continue;
    for (let i = from; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind !== "heading") continue;
      const words = headingWords(b.text);
      if (words === name || words.startsWith(`${name} `)) {
        starts.push({ at: i, chapter });
        from = i + 1;
        break;
      }
    }
  }
  for (const [k, start] of starts.entries()) {
    const nextAt = starts[k + 1]?.at ?? blocks.length;
    const notes = start.chapter.notesAt;
    for (let i = start.at; i < nextAt; i++) {
      const b = blocks[i];
      const at = b.at;
      if (at && (at.volume ?? 1) === notes.volume && at.pdfIndex >= notes.pdfIndex) break;
      if (at && (at.volume ?? 1) > notes.volume) break;
      out.set(b, start.chapter);
    }
  }
  return out;
}
