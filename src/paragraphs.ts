import type { Layout } from "./layout";
import { isOffFaceBlock, layoutJoins, type PageBreakOptions } from "./pagebreaks";
import { normaliseWhitespace } from "./extract";
import { COLUMN_BREAK } from "./columns";

/**
 * Where a block came from in the source. Carried so a fidelity note or an OCR
 * suspect can say "Volume II, PDF page 412, printed 380" rather than a flat
 * index into a document that no longer exists as one file. `blocksToMarkdown`
 * ignores it: provenance is metadata about the text, not part of it.
 */
export type Provenance = { volume: number; pdfIndex: number; printed: number | null };

export type Block = (
  | {
      kind: "paragraph";
      text: string;
      /** A numbered finding's number (`numberedFindings`). */
      finding?: number;
    }
  | { kind: "list"; items: string[]; quoted: boolean }
  | { kind: "heading"; level: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "contents"; text: string; page: string }
  | {
      kind: "page";
      /** The printed number, or a roman folio's lowercase numeral (`romanFolios`). */
      number: number | string;
      /**
       * Which time this printed number has been seen. Absent for the first.
       *
       * These documents restart their pagination — front matter, then the
       * body, then appendices — so a printed number is not unique within one
       * report. Jack Smith prints "2" on three different pages. Without this
       * they all render `id="page-2"`, and `#page-2` silently resolves to the
       * first: not a broken citation, a quietly wrong one.
       */
      occurrence?: number;
    }
) & {
  at?: Provenance;
  /**
   * Nothing may be joined across this block. Set where one column of a page
   * ends and the next begins — they are adjacent in the stream but not in the
   * reading order of the sentence.
   */
  hardBreak?: true;
};

const HEADING_MAX_WORDS = 14;

/**
 * How far past the body margin a line must sit to read as a quotation.
 *
 * Five suits a document that insets its quotations generously. Litvinenko
 * does not — it sets body text at 7 and quotations at 10 — so a report whose
 * typography is tighter declares its own; see `quoteInset` in the passes.
 */
export const DEFAULT_QUOTE_INSET = 5;
const ROMAN = /^[IVXLC]+\.?$/;

const LEADERS = /[.·]{4,}\s*(\d{1,4})\s*$/;

/**
 * A bullet, and the text after it.
 *
 * True bullet glyphs only. A leading hyphen or en dash is far more often a
 * dash in running prose than a list marker, and mistaking one for the other
 * shreds a paragraph — the same trap that made the first footnote-marker rule
 * corrupt a citation.
 */
/** A page number after a footnote marker: '…7 March.97' / 'The end of the UN route'. */
const FOOTNOTE_TAIL = /[.?!"”)\]]\d{1,3}$/;

const BULLET = /^(\s*)([•·▪◦‣])\s+(\S.*)$/;

/**
 * A contents page, where entries wrap across several lines and only the last
 * carries the dot leaders. Parsing these line by line shreds one entry into a
 * heading, a block quote and a list item, so they get their own pass.
 */
export function isContentsPage(lines: string[]): boolean {
  return lines.filter((line) => LEADERS.test(line)).length >= 3;
}

/**
 * `recoverListedHeadings`: an entry whose title is long enough to squeeze its
 * leaders down to a single dot — "…as a result of military action in Iraq . 47".
 * Read as one more entry, rather than as the start of the next one (it ran into
 * "The UK's relationship with the US", and its "47" was linked as a footnote).
 */
const LONE_LEADER = /\s\.\s+(\d{1,4})\s*$/;

export function parseContentsPage(lines: string[], loneLeaders = false): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const single = normaliseWhitespace(line);
    const lone = loneLeaders && !LEADERS.test(single) ? single.match(LONE_LEADER) : null;
    const leaders = lone ?? single.match(LEADERS);

    if (!leaders) {
      buffer.push(single);
      continue;
    }

    const text = normaliseWhitespace(
      [...buffer, single.replace(lone ? LONE_LEADER : LEADERS, "")].join(" ")
    )
      .replace(/[.·\s]+$/, "")
      .trim();
    buffer = [];
    if (text) blocks.push({ kind: "contents", text, page: leaders[1] });
  }

  // A trailing fragment with no leaders is a heading on the contents page
  // itself ("TABLE OF CONTENTS"), not an entry.
  const leftover = normaliseWhitespace(buffer.join(" "));
  if (leftover) blocks.push({ kind: "paragraph", text: leftover });

  return blocks;
}

/**
 * A contents entry's leaders, tight ("……… 12") or spaced (". . . . 12"), and
 * the title before them. The PSI report spaces its dots, which `LEADERS` does
 * not read; this is only used to learn the titles (`listedHeadings`), not to
 * lay the page out.
 */
const SPACED_LEADERS = /^(.*?\S)\s*(?:[.·]\s?){4,}\s*\d{1,4}\s*$/;

/**
 * The titles a contents page lists, one per line that carries leaders to a
 * page number; nothing from a page with fewer than three such lines. A title
 * that wraps is read from its last line only ("III. HIGH RISK LENDING:" /
 * "CASE STUDY OF WASHINGTON MUTUAL BANK. . . 48"), which is also the line
 * the body sets as its heading.
 */
export function contentsTitles(lines: string[], recover = false): string[] {
  const read = (line: string): string | undefined => {
    const spaced = line.match(SPACED_LEADERS)?.[1];
    if (spaced || !recover) return spaced?.replace(/\s+/g, " ").trim();
    const flat = normaliseWhitespace(line);
    return LONE_LEADER.test(flat) ? flat.replace(LONE_LEADER, "").trim() : undefined;
  };
  const titles: string[] = [];
  lines.forEach((line, i) => {
    const title = read(line);
    if (!title) return;
    titles.push(title);
    // `recoverListedHeadings`: a title that wraps is also listed whole, so a
    // body that sets it over two lines can be matched against all of it.
    if (recover && i > 0 && lines[i - 1].trim() && !read(lines[i - 1])) {
      titles.push(normaliseWhitespace(`${lines[i - 1].trim()} ${title}`));
    }
  });
  return titles.length >= 3 ? titles : [];
}

/** A heading's number or letter: "I.", "A.", "CC.", "4.", "(3)", "(a)", "(iii)". */
const HEADING_MARKER =
  /^(?:\((?:\d{1,2}|[a-z]|[ivxlc]{1,6})\)|(?:[IVXLC]{1,6}|[A-Z]{1,2}|\d{1,2})\.)\s+/;

/**
 * What a heading and its contents entry have in common: the title without its
 * marker (a heading is emitted without one), trailing dots, typographic quotes
 * or case.
 */
export function headingKey(text: string): string {
  return normaliseWhitespace(text)
    .replace(HEADING_MARKER, "")
    .replace(/[.\s]+$/, "")
    .toLowerCase();
}

/**
 * What the contents lists for a report numbered by chapter and section
 * (`numberedSections`): each "8.1" section's title as the contents spells it,
 * and each chapter's title, so a chapter banner set over two lines can be
 * read as one.
 */
export type NumberedContents = {
  sections: Map<string, string>;
  chapters: Set<string>;
  /**
   * Divisions the contents names by word and label — "Chapter 1", "PART ONE",
   * "Appendix A" — keyed by `divisionKey`, each with its title. Columbia sets
   * its contents this way and opens each division on a page of its own under
   * a banner ("CHAPTER 1") with the title set apart from it.
   */
  divisions: Map<string, string>;
};

const SECTION_ENTRY = /^\s*(\d{1,2}\.\d{1,2})\s+(\S.*)$/;
const CHAPTER_ENTRY = /^\s*(\d{1,2})\.\s+(\S.*)$/;
const SECTION_OPENER = /^\s*(\d{1,2})\.\s?(\d{1,2})\s+(\S.*)$/;
/** The page number a contents entry ends on, after a space or its leaders. */
const ENTRY_PAGE = /(?:\s+|[.·…]{2,}\s*)(?:\d{1,4}|[ivxlc]{1,7})\s*$/;
/** Dot leaders left on a title once its page number is off. */
const TRAILING_LEADERS = /\s*(?:[.·…]\s?){2,}$/;

/** A division's label: a number, a numeral, a letter, or a number spelt out. */
const DIVISION_WORD = "(Part|Chapter|Appendix)";
const DIVISION_NUMBER =
  "(\\d{1,2}|[A-Z]|[IVXLC]{1,6}|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)";
/** "Chapter 1     The Evolution of the Space Shuttle Program" — at least two spaces apart. */
const DIVISION_ENTRY = new RegExp(`^\\s*${DIVISION_WORD}\\s+${DIVISION_NUMBER}\\s{2,}(\\S.*)$`, "i");
/** A banner naming a division and nothing else: "CHAPTER 1", "Part One". */
const DIVISION_BANNER = new RegExp(`^\\s*${DIVISION_WORD}\\s+${DIVISION_NUMBER}\\s*$`, "i");

function divisionKey(word: string, number: string): string {
  return `${word} ${number}`.toLowerCase();
}

/**
 * The letters and digits of a title, lower-cased. What a heading set in
 * capitals ("3.3 . . .AND IN THE FEDERAL AVIATION") and its contents entry
 * (". . . and in the Federal Aviation Administration") share, whatever the
 * typesetter did with the case, the spacing, the dashes and the dots.
 */
export function titleLetters(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The numbered sections and chapters a contents page lists, entries set
 * "8.1   The Summer of Threat 254" with a plain space before the page number.
 * An entry that wraps runs on until a line ends in its page number. Nothing
 * from a page with fewer than three section entries: this is a contents page,
 * not a page that happens to hold a numbered line.
 */
export function numberedContents(lines: string[]): NumberedContents {
  const sections = new Map<string, string>();
  const chapters = new Set<string>();
  const divisions = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    // A division entry may carry no page number of its own — Columbia's
    // "Chapter 1" line names the chapter, and its first section the page.
    const division = lines[i].match(DIVISION_ENTRY);
    if (division) {
      const title = normaliseWhitespace(
        division[3].replace(ENTRY_PAGE, "").replace(TRAILING_LEADERS, "")
      );
      if (title) divisions.set(divisionKey(division[1], division[2]), title);
      continue;
    }
    const section = lines[i].match(SECTION_ENTRY);
    const chapter = section ? null : lines[i].match(CHAPTER_ENTRY);
    const entry = section ?? chapter;
    if (!entry) continue;
    let text = entry[2];
    let j = i;
    while (!ENTRY_PAGE.test(text)) {
      const next = lines[j + 1];
      if (next === undefined || !next.trim() || SECTION_ENTRY.test(next) || CHAPTER_ENTRY.test(next)) {
        break;
      }
      text = `${text} ${next.trim()}`;
      j++;
    }
    if (!ENTRY_PAGE.test(text)) continue;
    i = j;
    const title = normaliseWhitespace(text.replace(ENTRY_PAGE, "").replace(TRAILING_LEADERS, ""));
    if (section) sections.set(section[1], title);
    else chapters.add(titleLetters(title));
  }
  return sections.size >= 3
    ? { sections, chapters, divisions }
    : { sections: new Map(), chapters: new Set(), divisions: new Map() };
}

/** A page a contents entry ends on, as a plain number, a roman numeral or a span of either ("xiii–xiv"). */
const SPACED_PAGE = /\s+((?:\d{1,4}|[ivxlc]{1,7})(?:[–-](?:\d{1,4}|[ivxlc]{1,7}))?)\s*$/;
/** A list of illustrations' entry: "p. 32–33     Flight paths and timelines". */
const PAGE_FIRST_ENTRY = /^\s*p\.\s*(\d{1,4}(?:[–-]\d{1,4})?)\s{2,}(\S.*)$/;

/** Whether a page is a list of illustrations: three or more entries opening on "p. N". */
export function isIllustrationList(lines: string[]): boolean {
  return lines.filter((line) => PAGE_FIRST_ENTRY.test(line)).length >= 3;
}

/**
 * A contents page whose entries are numbered and set with a plain space before
 * the page number, laid out as its entries (`contentsEntries`,
 * reportsthatmatter-5fn): each chapter ("8.") and section ("8.1") with its
 * title, as the contents spells it, and its page. An entry that wraps runs on
 * until a line ends in a page number. A title over the entries ("CONTENTS")
 * stays a heading; a lone roman numeral (the folio) is dropped.
 */
export function spacedContentsBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let open: string[] = [];
  let sawEntry = false;
  let lastListed = false;
  const flush = (): void => {
    const text = normaliseWhitespace(open.join(" "));
    open = [];
    if (!text) return;
    if (!sawEntry && text === text.toUpperCase() && /[A-Z]{4}/.test(text)) {
      blocks.push({ kind: "heading", level: 2, text });
    } else {
      blocks.push({ kind: "paragraph", text });
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!open.length) {
      if (/^[ivxlc]{1,7}$/.test(line)) continue;
      if (!sawEntry && line === line.toUpperCase() && /[A-Z]{4}/.test(line) && !SPACED_PAGE.test(line)) {
        // A title may be set over two lines ("LIST OF ILLUSTRATIONS" / "AND TABLES").
        const prev = blocks[blocks.length - 1];
        if (prev?.kind === "heading") prev.text = normaliseWhitespace(`${prev.text} ${line}`);
        else blocks.push({ kind: "heading", level: 2, text: normaliseWhitespace(line) });
        continue;
      }
      const listed = line.match(PAGE_FIRST_ENTRY);
      if (listed) {
        blocks.push({ kind: "contents", text: normaliseWhitespace(listed[2]), page: listed[1] });
        sawEntry = true;
        lastListed = true;
        continue;
      }
      // The wrapped tail of an illustration entry belongs to the entry above.
      const last = blocks[blocks.length - 1];
      if (lastListed && last?.kind === "contents") {
        last.text = normaliseWhitespace(`${last.text} ${line}`);
        continue;
      }
    }
    open.push(line);
    const text = normaliseWhitespace(open.join(" "));
    const page = text.match(SPACED_PAGE);
    if (!page || text.length === page[0].length) continue;
    const title = text.slice(0, text.length - page[0].length).trim();
    open = [];
    sawEntry = true;
    const label = title.match(/^(\d{1,2}\.\d{1,2}|\d{1,2}\.)\s+(\S.*)$/);
    const shown = label ? `${label[1].replace(/^(\d+)\.$/, "$1\\.")} ${label[2]}` : title;
    blocks.push({ kind: "contents", text: shown, page: page[1] });
  }
  flush();
  return blocks;
}

const SUBHEAD_SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with", "vs",
]);

/**
 * A short title-case line set alone above the paragraph it heads
 * (`shortSubheads`, reportsthatmatter-5u2): "The Drumbeat Begins" over "In the
 * spring of 2001, the level of reporting…". Preceded by a blank line (or the
 * page's first), at most seven words and sixty characters, every word capitalised
 * bar the small ones, no sentence punctuation or digit at the end, and
 * followed with no blank by a full line opening a sentence at the same indent.
 * A short line cannot end a paragraph and still be followed by more of it, so
 * a short line opening one is a title; the full next line is what separates it
 * from a figure's label.
 */
export function shortSubheadAt(lines: string[], i: number): boolean {
  const text = normaliseWhitespace(lines[i] ?? "");
  const next = lines[i + 1];
  if (!text || text.length > 60 || !next?.trim()) return false;
  if (i > 0 && lines[i - 1].trim()) return false;
  if (/[.,;:?!”")\]\d]$/.test(text) || text === text.toUpperCase()) return false;
  const words = text.split(" ");
  if (words.length > 7) return false;
  if (!/^[A-Z]/.test(words[0])) return false;
  for (const word of words) {
    if (/^[A-Z0-9“"(]/.test(word) || SUBHEAD_SMALL_WORDS.has(word.toLowerCase())) continue;
    return false;
  }
  const follow = normaliseWhitespace(next);
  if (follow.length < 60 || !/^[A-Z“"(]/.test(follow)) return false;
  return Math.abs(indentOf(next) - indentOf(lines[i])) <= 2;
}

/**
 * A body line that opens a section the contents lists: its number, then its
 * title however the body sets it — in capitals, wrapped over lines, spaced
 * differently. The heading is the contents' own text, "8.1 The Summer of
 * Threat", and `end` the last line it took.
 */
function numberedSectionAt(
  lines: string[],
  i: number,
  sections: Map<string, string>
): { text: string; end: number } | null {
  // The body may space its number ("5. 7 THE RETURN OF SCHEDULE PRESSURE").
  const opener = lines[i].match(SECTION_OPENER);
  const number = opener ? `${opener[1]}.${opener[2]}` : "";
  const title = opener ? sections.get(number) : undefined;
  if (!opener || !title) return null;
  const target = titleLetters(title);
  let read = titleLetters(opener[3]);
  let end = i;
  while (read !== target && target.startsWith(read) && lines[end + 1]?.trim()) {
    end++;
    read += titleLetters(lines[end]);
  }
  return read === target ? { text: `${number} ${title}`, end } : null;
}

/**
 * The divisions a contents page lists (`listedDivisions`): its parts,
 * chapters and appendices by label and number, and the unlabelled entries
 * around them ("Foreword", "Endnotes", "Index"), each with its title as the
 * contents spells it. `used` records which have been found in the body, so
 * each opens once.
 */
export type ListedDivision = {
  /** "chapter", "part", "appendix"…; absent for an unlabelled entry. */
  kind?: string;
  /** The division's number, canonical: "3" for "3", "III" or "Three"; "a" for "Appendix A". */
  number?: string;
  title: string;
};
export type ListedDivisions = { entries: ListedDivision[]; used: Set<ListedDivision> };

const DIVISION_OPENER =
  /^\s*(Part|Chapter|Appendix|Annex|Volume|Section)\s+(\d{1,3}|[IVXLC]{1,7}|[A-Z]|[A-Za-z]{3,9})(?![\w-])[:.]?\s*(.*)$/i;
/** A contents entry's page, arabic or roman, after a gap wider than a word space. */
const CONTENTS_PAGE = /\s{2,}(?:\d{1,4}|[ivxlc]{1,7})\s*$/;
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

/**
 * A division's number however it is set: "3", "III", "Three" all read "3";
 * an appendix's or annex's letter stays a letter ("Appendix C" is not 100).
 * Null for anything that is not a number, so "Chapter on" opens nothing.
 */
function divisionNumber(kind: string, token: string): string | null {
  const t = token.toLowerCase();
  if (/^\d+$/.test(t)) return String(Number(t));
  if (/^(appendix|annex)$/i.test(kind) && /^[a-z]$/.test(t)) return t;
  const word = NUMBER_WORDS.indexOf(t);
  if (word > 0) return String(word);
  if (/^[ivxlc]+$/.test(t)) {
    let value = 0;
    for (let k = 0; k < t.length; k++) {
      const here = ROMAN_VALUES[t[k]];
      const next = ROMAN_VALUES[t[k + 1]] ?? 0;
      value += here < next ? -here : here;
    }
    return String(value);
  }
  return null;
}

/**
 * What a contents page lists, when its entries are set as divisions with a
 * page after a gap rather than dot leaders: "Chapter 3      55" over its
 * title lines, "PART II: Explosion and Aftermath:" wrapping to its page on
 * the next line, "Foreword      vi". A labelled entry whose own line carries
 * the page takes the lines below it as its title, up to the next entry; one
 * whose line has no page runs on until a line does. Nothing from a page with
 * fewer than three labelled entries.
 */
export function divisionContents(lines: string[]): ListedDivision[] {
  const entries: ListedDivision[] = [];
  let labelled = 0;
  const filled = lines.map((line, i) => i).filter((i) => lines[i].trim());
  for (let k = 0; k < filled.length; k++) {
    const line = lines[filled[k]];
    const paged = CONTENTS_PAGE.test(line);
    const opener = line.replace(CONTENTS_PAGE, "").match(DIVISION_OPENER);
    const number = opener ? divisionNumber(opener[1], opener[2]) : null;
    if (opener && number) {
      const own = normaliseWhitespace(opener[3]);
      const title = own ? [own] : [];
      const opensNext = (at: number) => {
        const next = lines[filled[at]]?.match(DIVISION_OPENER);
        return Boolean(next && divisionNumber(next[1], next[2]));
      };
      let located = paged;
      if (paged && !own) {
        // "Chapter 3   55", its title on the lines below.
        while (k + 1 < filled.length && !opensNext(k + 1) && !CONTENTS_PAGE.test(lines[filled[k + 1]])) {
          title.push(normaliseWhitespace(lines[filled[++k]]));
        }
      } else if (!paged) {
        // "PART II: Explosion and Aftermath:", its page on a later line.
        while (k + 1 < filled.length && !opensNext(k + 1)) {
          const next = lines[filled[++k]];
          title.push(normaliseWhitespace(next.replace(CONTENTS_PAGE, "")));
          if (CONTENTS_PAGE.test(next)) {
            located = true;
            break;
          }
        }
      }
      // An entry is located by a page; a division named in running text
      // ("Section 1. Establishment. There is…") is not one.
      if (!located || !title.length) continue;
      entries.push({ kind: opener[1].toLowerCase(), number, title: title.join(" ") });
      labelled++;
    } else if (paged) {
      // Not the page's own running number ("v   v").
      const title = normaliseWhitespace(line.replace(CONTENTS_PAGE, ""));
      if (/[a-z]{3}/i.test(title) && !/^[ivxlc\d\s]+$/i.test(title)) entries.push({ title });
    }
  }
  return labelled >= 3 ? entries : [];
}

/**
 * A body line that opens a division the contents lists: "Chapter Three" over
 * the title's wrapped lines, "Appendix A", a blank, then "Commission
 * Members", or a lone "ENDNOTES". The letters must spell the listed title
 * exactly; a title the body sets longer than the contents ("Executive
 * Order-- National Commission on…" for "Executive Order") is taken as the
 * body sets it, provided it ends in a blank line within a line of passing the
 * listed one. The heading is the body's label ("Chapter Three") and the
 * contents' title; `end` is the last line it took.
 */
function listedDivisionAt(
  lines: string[],
  i: number,
  divisions: ListedDivisions
): { text: string; level: number; end: number; entry: ListedDivision } | null {
  const line = lines[i];
  const opener = line.match(DIVISION_OPENER);
  const number = opener ? divisionNumber(opener[1], opener[2]) : null;
  const candidates = divisions.entries.filter(
    (entry) =>
      !divisions.used.has(entry) &&
      (entry.kind
        ? opener && number && entry.kind === opener[1].toLowerCase() && entry.number === number
        : true)
  );
  for (const entry of candidates) {
    const target = titleLetters(entry.title);
    if (!target) continue;
    const first = entry.kind ? opener![3] : line;
    let read = titleLetters(first);
    const taken = [first.trim()];
    let end = i;
    // At most a dozen lines: a chapter opener sets its title a word or two to a line.
    while (read !== target && target.startsWith(read) && end - i < 12) {
      const next = lines[end + 1];
      if (next === undefined) break;
      // Blank lines inside a title only before any of it has been read
      // ("Appendix A", a blank, "Commission Members").
      if (!next.trim()) {
        if (read) break;
        end++;
        continue;
      }
      end++;
      read += titleLetters(next);
      taken.push(next.trim());
    }
    let title: string | null = null;
    if (read === target) title = entry.title;
    else if (entry.kind && read.length > target.length && read.startsWith(target)) {
      // The body's title runs past the contents'; accept it only as a title
      // block of its own, ended by a blank line.
      let k = end;
      if (lines[k + 1]?.trim() && !lines[k + 2]?.trim()) {
        k++;
        taken.push(lines[k].trim());
      }
      if (!lines[k + 1]?.trim()) {
        end = k;
        title = normaliseWhitespace(taken.join(" "));
      }
    }
    if (title === null) continue;
    divisions.used.add(entry);
    const kind = entry.kind ?? "";
    const label = entry.kind ? normaliseWhitespace(`${opener![1]} ${opener![2]}`) : "";
    const level = /^(chapter|section)$/.test(kind) ? 3 : 2;
    return { text: label ? `${label}: ${title}` : title, level, end, entry };
  }
  return null;
}

/**
 * A numbered heading's title that wraps onto a short line of its own
 * (`wrappedHeadings`): "4. The Need for Increased Research and Development
 * to Improve Spill" over "Response". The line is folded in when it is a few
 * words, every one capitalised but the small words, and ends on no stop.
 */
function headingTail(line: string | undefined): string | null {
  if (!line?.trim()) return null;
  const text = normaliseWhitespace(line);
  const words = text.split(/\s+/);
  if (words.length > 6 || /[.?!:;,]$/.test(text)) return null;
  if (/^([IVXLC]{1,6}|[A-Z]|\d{1,2})\.\s/.test(text)) return null;
  if (!/^[A-Z]/.test(text)) return null;
  const titular = words.every((word) => /^[A-Z("'“]/.test(word) || STOPWORD.test(word));
  return titular ? text : null;
}

/** Leading-space count, which `pdftotext -layout` preserves from the page. */
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * The most common indent among content lines — the left margin of running text.
 * Paragraph-initial lines sit measurably to the right of it.
 */
export function bodyIndent(lines: string[]): number {
  const counts = new Map<number, number>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = indentOf(line);
    counts.set(indent, (counts.get(indent) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [indent, count] of counts) {
    // On a tie prefer the smaller indent: continuation lines sit at the left
    // margin, and treating a first-line indent as the margin would merge every
    // paragraph on the page into one.
    if (count > bestCount || (count === bestCount && indent < best)) {
      best = indent;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Words a finished title does not end on. A heading closing on a preposition or
 * an article has been cut off by the line break, not written that way.
 */
const DANGLING =
  /\b(of|the|a|an|in|to|for|and|or|with|by|from|that|was|is|are|were|on|at|as|its|their|his|her)$/i;

/**
 * Words that carry no case information of their own, so their being lower-case
 * in a title says nothing. Anything *else* lower-case in a would-be title is a
 * verb or a common noun — i.e. the line is a sentence, not a title.
 */
const STOPWORD =
  /^(of|the|a|an|in|to|for|and|or|nor|with|by|from|that|as|at|on|is|was|were|are|be|been|its?|it|their|his|her|our|my|your|has|have|had|but|not|no|than|then|so|if|when|which|who|whom|whose|into|upon|per|via)$/i;

/**
 * An inquiry report's top-level divisions carry their own number in the label
 * — "Part 4:", "Chapter 1:", "Appendix 3:" — which the single-letter marker
 * regex in `isHeadingLine` does not cover. `Part`, `Appendix`, `Annex` and `Volume`
 * are top level (h2); `Chapter` and `Section` nest under them (h3).
 */
const DIVISION_LABEL = /^(Part|Chapter|Appendix|Annex|Volume|Section)\s+(\d{1,3}|[IVXLC]{1,7})\b/;
const DIVISION_TOP = /^(Part|Appendix|Annex|Volume)$/;

/** A heading this pipeline emitted for a numbered division, by its text. */
export function isDivisionHeading(text: string): boolean {
  return /^(Part|Chapter|Appendix|Annex|Volume|Section) (?:\d{1,3}|[IVXLC]{1,7}):/.test(
    text
  );
}

/**
 * A common quantity word immediately after the candidate ("1.8 million
 * people…") means the number is a mid-sentence figure, not a paragraph
 * number — a genuine paragraph does not open with a bare unit word as its
 * first word of prose. "...The Sun's article...suggested\n\n1.8 million
 * people on sickness benefit were fit for work..." reads "1.8" as opening
 * paragraph 1.8 (Leveson), when it is a statistic the line wrapped after.
 */
const QUANTITY_WORD_FOLLOWS =
  /^(per\s?cent|percent|million|billion|thousand|hundred|degrees?|inches?|centimetres?|centimeters?|metres?|meters?|miles?|kilometres?|kilometers?|pounds?|kg|km|years?|months?|weeks?|days?|hours?|minutes?|seconds?|times)\b/i;

/**
 * "7.1", "10.14" — the chapter.paragraph numbering these reports run
 * throughout.
 *
 * The second number is mandatory on purpose. A bare "N." alone is far too
 * common a shape for an ordinary sentence to end a wrapped line on by
 * coincidence — "...Mr Sokolenko was allocated room\n\n382. Mr Begak had
 * checked in..." reads "382" as the start of paragraph 382, when it is
 * just a room number the line wrapped after. Requiring both halves is what
 * makes this safe to use as a paragraph-break signal (numberedParagraphs,
 * reportsthatmatter-hzf): a genuine two-part chapter.paragraph number is
 * not a shape ordinary prose produces by accident — except a quantity,
 * which is, hence the second guard above.
 */
function opensNumberedParagraph(text: string): boolean {
  const match = text.trim().match(/^\d{1,3}[.)]\d{1,3}\s+(.*)$/);
  if (!match) return false;
  return !QUANTITY_WORD_FOLLOWS.test(match[1]);
}

/**
 * Titles are set in caps or title case; running prose is not. Used to tell a
 * numbered heading from a numbered sentence.
 */
function isTitular(text: string): boolean {
  if (text === text.toUpperCase()) return true;
  const words = text.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length < 2) return false;
  const capitalised = words.filter((word) => /^[A-Z]/.test(word)).length;
  return capitalised / words.length >= 0.6;
}

export function danglesMidPhrase(text: string): boolean {
  return !/[.?!:]$/.test(text) && DANGLING.test(text.trim());
}

/**
 * A table-of-contents (or tabular list) entry: either dot leaders running to
 * a page number, or — in born-digital reports that right-align with spaces
 * instead — a gap wide enough that it can only be column alignment, not
 * ordinary word spacing.
 *
 * The gap alone is not enough: a footnote marker that wraps onto its own
 * short line ("previously reported results.   197") has exactly the same
 * shape and would otherwise be read as a contents entry, severing the
 * sentence and inventing a fake page listing. What tells them apart is the
 * character right before the gap — a title never ends the way a sentence
 * fragment does, on ".", "," ";" or ":".
 */
const TOC_ENTRY = /[.·]{4,}\s*\d{1,4}\s*$|(?<![.,;:])[ \t]{3,}\d{1,4}\s*$/;

/** Section headings carry the printed page number after the title. */
function stripTrailingPageNumber(text: string): string {
  // "ENDNOTES FOR CHAPTER 1" ends on the chapter's number, not a page's.
  if (/\b(?:part|chapter|appendix|section|volume)\s+\d{1,4}$/i.test(text)) return text.trim();
  return text.replace(/\s+\d{1,4}$/, "").trim();
}

const ALIGNED = /\S {3,}\S/;

/**
 * A page laid out as a table rather than as prose.
 *
 * Column alignment is the tell: a run of three or more spaces between text is
 * how `pdftotext -layout` renders a column boundary, and prose almost never
 * produces one. Measured across the corpus, a docket table scores 0.41 while
 * prose pages score 0.04-0.12, so the two do not overlap.
 */
export function isTabularPage(lines: string[]): boolean {
  const content = lines.filter((line) => line.trim().length > 0);
  if (content.length < 8) return false;
  return content.filter((line) => ALIGNED.test(line)).length / content.length >= 0.25;
}

/**
 * Which lines sit inside a table, judged by their neighbours.
 *
 * Page-level is too blunt: a page can carry a chronology table and a real
 * division heading at once, and suppressing headings across the whole page
 * cost Litvinenko 26 of them and Leveson 16. A table row's *neighbours* are
 * column-aligned; a heading's are blank or prose.
 *
 * The row that prompted this carries no alignment of its own — the docket's
 * description column wraps onto its own line — so the line itself cannot be
 * the test.
 */
export function tabularContext(lines: string[]): boolean[] {
  const WINDOW = 3;
  return lines.map((_, i) => {
    let before = 0;
    let after = 0;
    for (let j = Math.max(0, i - WINDOW); j < i; j++) {
      if (ALIGNED.test(lines[j])) before++;
    }
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + WINDOW); j++) {
      if (ALIGNED.test(lines[j])) after++;
    }
    // Aligned rows on *both* sides. A table's own title has rows only after
    // it — "Appendix 4: Chronology" heads a chronology table — and treating
    // that as tabular cost Litvinenko and Leveson genuine division headings.
    return before > 0 && after > 0;
  });
}

function isHeadingLine(
  text: string,
  allowDivisions = true,
  allowAllCaps = true,
  allowNumbered = true
): { level: number; text: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Contents entries look exactly like headings but are a listing of them.
  if (TOC_ENTRY.test(trimmed)) return null;

  const body = stripTrailingPageNumber(trimmed);
  if (!body || body.split(/\s+/).length > HEADING_MAX_WORDS) return null;
  if (/[;:,]$/.test(body)) return null;
  // "…should be rede-" is a line break inside a word, never a finished title.
  if (/[-­‐]$/.test(body)) return null;

  // "Part 4:  Why would anyone wish to kill" — a division that names its own
  // number. The title may wrap onto the next line (rejoined in `toBlocks`),
  // and a line that merely opens "Part 5 above…" is prose, not a division, so
  // the tail after the number has to read like a title: begin with a capital
  // or a quote and not trail off on a comma or full stop.
  const division = allowDivisions ? body.match(DIVISION_LABEL) : null;
  if (division) {
    const rest = body.slice(division[0].length).replace(/^:\s*/, "").trim();
    if (rest && /^["'(A-Z0-9]/.test(rest) && !/[.,;]$/.test(rest)) {
      const label = `${division[1]} ${division[2]}`;
      return {
        level: DIVISION_TOP.test(division[1]) ? 2 : 3,
        text: `${label}: ${rest}`,
      };
    }
  }

  // "I. THE RESULTS OF THE INVESTIGATION" — roman numeral sections.
  // "A. Mr. Trump's Pressure on State Officials" — lettered subsections.
  const numbered = allowNumbered ? body.match(/^([IVXLC]{1,6}|[A-Z]|\d{1,2})\.\s+(.+)$/) : null;
  if (numbered) {
    const title = numbered[2].trim();
    // A numbered *sentence* is a list item, not a heading. Reports set their
    // recommendations this way — "1. NASA should closely scrutinize each of the
    // concerns raised by …" — and reading them as structure fills the contents
    // with half-sentences. A wrapped narrative fragment ("On 23 November 2006,
    // Alexander Litvinenko died at University") clears the title-case bar on
    // its proper nouns alone and does not end on a full stop, so the tell is a
    // lower-case content word left once the stop-words are removed.
    const proseWord = title
      .split(/\s+/)
      .some((w) => /^[a-z]/.test(w) && /[a-z]/.test(w) && !STOPWORD.test(w));
    if (
      /^[A-Z]/.test(title) &&
      !/[.?!]$/.test(title) &&
      isTitular(title) &&
      !proseWord
    ) {
      // "C." and "D." are both letters and Roman numerals, so the marker
      // cannot tell us the level. In these reports the top-level sections are
      // set in caps and the subsections in title case, which can.
      const isSection = title === title.toUpperCase();
      // A report that opts out of all-caps headings sets its quoted documents
      // in caps, lettered items and all ("B. HE BELIEVES…" in a Saville
      // signal); as a heading it would lose its "B." too.
      if (!isSection || allowAllCaps) return { level: isSection ? 2 : 3, text: title };
    }
  }

  // A standalone all-caps line with no terminal punctuation. Financial reports
  // set their tables in caps too, so a "heading" carrying money, percentages,
  // long numbers or a list of tickers is data, not structure.
  const letters = body.replace(/[^A-Za-z]/g, "");
  if (
    allowAllCaps &&
    letters.length >= 4 &&
    body === body.toUpperCase() &&
    !/[.]$/.test(body) &&
    !/[$%]/.test(body) &&
    !/\d{3}/.test(body) &&
    (body.match(/,/g) ?? []).length < 2 &&
    letters.length / body.length > 0.6 &&
    // A single token in caps is an acronym on its own line ("RISC", "G-BNWX)"),
    // not a section title — real ones run to at least two words, or are a
    // single long word ("INTRODUCTION"). An embedded digit or hyphen is the
    // giveaway of a code, not a word.
    (/\s/.test(body) ? true : letters.length >= 5 && !/[-\d]/.test(body))
  ) {
    return { level: 2, text: body };
  }

  return null;
}

/**
 * A contents entry located by paragraph rather than page: "Internment   8.35".
 * Saville opens each chapter with one of these (`chapterContents`).
 */
const PARAGRAPH_CONTENTS_ENTRY = /^(.*\S)(?<![.,;:])[ \t]{3,}(\d{1,2}\.\d{1,3})\s*$/;
/** The column label over a contents list's locators. */
const CONTENTS_COLUMN_LABEL = /^\s*(?:Paragraphs?|Pages?)\s*$/;

/**
 * Tidies a paragraph-located contents list before it is read: drops the
 * "Paragraph" label over its locator column, which otherwise folds into the
 * chapter title above it ("Chapter 3: The events of the day Paragraph"), and
 * rejoins an entry that wraps before its locator —
 *
 *   The meeting between the British and Northern Irish Prime Ministers on
 *   7th October 1971                                                   8.89
 *
 * — only inside a run of entries, and only at the entries' own indent.
 */
function joinParagraphContents(lines: string[]): string[] {
  const out: string[] = [];
  const nextFilled = (i: number) => {
    for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return j;
    return -1;
  };
  let inList = false;
  let listIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      out.push(line);
      continue;
    }
    const next = nextFilled(i);
    const nextIsEntry = next >= 0 && PARAGRAPH_CONTENTS_ENTRY.test(lines[next]);
    if (CONTENTS_COLUMN_LABEL.test(line) && nextIsEntry) {
      inList = true;
      continue;
    }
    if (PARAGRAPH_CONTENTS_ENTRY.test(line)) {
      inList = true;
      listIndent = indentOf(line);
      out.push(line);
      continue;
    }
    // An entry too long to leave the usual gap before its locator:
    // "…Brian Faulkner on 27th January 1972 9.499". Only inside a list, at
    // its indent — alone, a line ending on a paragraph number is prose.
    const tight = line.match(/^(.*\S)\s(\d{1,2}\.\d{1,3})\s*$/);
    if (inList && tight && Math.abs(indentOf(line) - listIndent) <= 1) {
      out.push(`${tight[1]}   ${tight[2]}`);
      continue;
    }
    if (
      inList &&
      next === i + 1 &&
      nextIsEntry &&
      Math.abs(indentOf(line) - indentOf(lines[next])) <= 1
    ) {
      lines = [...lines];
      lines[next] = `${line.replace(/\s+$/, "")} ${lines[next].trimStart()}`;
      continue;
    }
    inList = false;
    out.push(line);
  }
  return out;
}

/**
 * Reads the structure a report's own contents lists name (`chapterContents`).
 *
 * A body line that is exactly the title of a paragraph-located contents entry
 * is the subsection heading that entry points at — Saville's subsections are
 * set in plain sentence case, which nothing else can tell from a short
 * paragraph. And a chapter title cut at a line wrap ("Chapter 8: The period
 * from August to" / "December 1971") is completed when the two together are
 * exactly an entry in the contents. Exact matches only: the contents is the
 * document's own statement of its structure, and a near miss is not one.
 */
export function contentsHeadings(blocks: Block[]): Block[] {
  const entries = new Set<string>();
  const subsections = new Set<string>();
  for (const block of blocks) {
    if (block.kind !== "contents") continue;
    entries.add(block.text);
    if (/^\d{1,2}\.\d{1,3}$/.test(block.page)) subsections.add(block.text);
  }
  if (!entries.size) return blocks;

  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const next = blocks[i + 1];
    if (
      block.kind === "heading" &&
      isDivisionHeading(block.text) &&
      !entries.has(block.text) &&
      next?.kind === "paragraph" &&
      entries.has(`${block.text} ${next.text}`)
    ) {
      out.push({ ...block, text: `${block.text} ${next.text}` });
      i++;
      continue;
    }
    // An outline entry whose title wraps: "Chapter 24: The movement of Mortar
    // Platoon Armoured Personnel Carriers into" / "the Bogside   27" — the
    // first line reads as a division, the tail as an entry of its own.
    if (
      block.kind === "heading" &&
      isDivisionHeading(block.text) &&
      next?.kind === "contents" &&
      /^[a-z]/.test(next.text)
    ) {
      out.push({ ...next, text: `${block.text} ${next.text}` });
      i++;
      continue;
    }
    // A subsection title joined onto the end of the paragraph before it,
    // across a page break: "…shared by many others in 1 PARA. A "plan within
    // a plan"".
    if (block.kind === "paragraph") {
      const title = [...subsections].find(
        (t) => block.text.endsWith(` ${t}`) && /[.!?"”]$/.test(block.text.slice(0, -t.length - 1))
      );
      if (title) {
        out.push({ ...block, text: block.text.slice(0, -title.length - 1) });
        out.push({ kind: "heading", level: 4, text: title, at: block.at });
        continue;
      }
    }
    if (block.kind === "paragraph" && subsections.has(block.text)) {
      out.push({ kind: "heading", level: 4, text: block.text, at: block.at });
      continue;
    }
    out.push(block);
  }
  return out;
}

/**
 * The outline a report's contents sets out (`contentsOutline`): every entry's
 * title, by its level and letters, and every prefix of those letters, so a
 * body heading can be followed across the lines it wraps over.
 */
export type Outline = {
  entries: Map<string, { title: string; level: number }>;
  prefixes: Set<string>;
};

export function emptyOutline(): Outline {
  return { entries: new Map(), prefixes: new Set() };
}

/**
 * An outline label and the title after it: "IV.", "A.", "3.", "c.", "(2)",
 * "(b)", "(iii)", and the single letter closing on its bracket alone, "a)"
 * (the Valukas Report's Repo 105 sections run a) to j) before they turn to
 * "(1)").
 */
const OUTLINE_LABEL =
  /^\s*(\((?:\d{1,2}|[a-z]{1,4})\)|[a-z]\)|(?:[IVXLC]{1,6}|[A-Za-z]|\d{1,2})\.)\s+(\S.*)$/;
/**
 * Spaced leaders to a page number, ". . . . 219", ending a contents entry —
 * two dots at the least, where a long title leaves no room for more.
 */
const LEADER_TAIL = /\s*(?:\.\s?){2,}\s*(\d{1,4})\s*$/;

/**
 * An outline label's level. A roman numeral over a title in capitals is a
 * top-level part ("V. DEFENDANTS DEVISED…"); "I." over a title in title case
 * is the ninth lettered section. Capital letters and numbers are the
 * sections a reader pages through; anything below is a subheading within one.
 */
function outlineLevel(label: string, title: string): number {
  if (/^[IVXLC]+\.$/.test(label) && title === title.toUpperCase()) return 2;
  if (/^(?:[A-Z]|\d{1,2})\.$/.test(label)) return 3;
  return 4;
}

export type OutlineEntry = { label: string; title: string; page: string; level: number };

/**
 * The entries of a contents page set out as an outline, each opening on its
 * label and wrapping until its spaced leaders reach a page number:
 *
 *   C.   TIRC/CTR -- Tobacco Industry Research Committee/Council
 *        for Tobacco Research-USA . . . . . . . . . . . . 26
 *
 * Nothing from a page with fewer than three entries.
 */
export function readContentsOutline(lines: string[]): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  let open: { label: string; parts: string[] } | null = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const label: RegExpMatchArray | null = open ? null : line.match(OUTLINE_LABEL);
    if (label) open = { label: label[1], parts: [label[2]] };
    else if (open) open.parts.push(line.trim());
    else continue;
    const text = normaliseWhitespace(open.parts.join(" "));
    const tail = text.match(LEADER_TAIL);
    if (!tail) continue;
    const title = text.replace(LEADER_TAIL, "").trim();
    entries.push({ label: open.label, title, page: tail[1], level: outlineLevel(open.label, title) });
    open = null;
  }
  return entries.length >= 3 ? entries : [];
}

/**
 * A contents page read as an outline, laid out as its entries: each with its
 * label, as the contents numbers it, and its page. A title over the entries
 * ("TABLE OF CONTENTS") stays a heading.
 */
export function outlineContentsBlocks(lines: string[], entries: OutlineEntry[]): Block[] {
  const blocks: Block[] = [];
  const first = lines.findIndex((line) => OUTLINE_LABEL.test(line));
  const title = normaliseWhitespace(lines.slice(0, Math.max(first, 0)).join(" "));
  if (title && title === title.toUpperCase() && /[A-Z]{4}/.test(title)) {
    blocks.push({ kind: "heading", level: 2, text: title });
  }
  for (const entry of entries) {
    // "- 1. Title" would nest an ordered list in the contents' bullet.
    const label = entry.label.replace(/^(\d+)\./, "$1\\.");
    blocks.push({ kind: "contents", text: `${label} ${entry.title}`, page: entry.page });
  }
  return blocks;
}

/** Adds a contents page's entries to the outline the body is read against. */
export function learnOutline(outline: Outline, entries: OutlineEntry[]): void {
  for (const entry of entries) {
    const letters = titleLetters(entry.title);
    const key = `${entry.level}:${letters}`;
    if (!outline.entries.has(key)) outline.entries.set(key, { title: entry.title, level: entry.level });
    for (let n = 1; n <= letters.length; n++) outline.prefixes.add(`${entry.level}:${letters.slice(0, n)}`);
  }
}

/**
 * The body lines that open a heading the outline lists: a label, then the
 * title letter for letter as the contents gives it, across as many lines as
 * it wraps over. A footnote marker the title carries ("THE ENTERPRISE9") is
 * kept after it. Keyed by the first line; `end` is the last line it took.
 */
function readOutline(
  lines: string[],
  outline: Outline
): Map<number, { text: string; level: number; end: number }> {
  const found = new Map<number, { text: string; level: number; end: number }>();
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i].match(OUTLINE_LABEL);
    if (!label) continue;
    const level = outlineLevel(label[1], normaliseWhitespace(label[2]));
    let read = titleLetters(label[2]);
    let end = i;
    const at = (letters: string) => outline.entries.get(`${level}:${letters}`);
    while (!at(read) && !at(read.replace(/\d+$/, "")) && outline.prefixes.has(`${level}:${read}`)) {
      const next = lines[end + 1];
      if (!next?.trim()) break;
      end++;
      read += titleLetters(next);
    }
    const entry = at(read);
    const marked = entry ? null : at(read.replace(/\d+$/, ""));
    if (!entry && !marked) continue;
    const marker = marked ? read.match(/\d+$/)![0] : "";
    found.set(i, { text: `${(entry ?? marked)!.title}${marker}`, level, end });
    i = end;
  }
  return found;
}

/**
 * A line set in the middle of the page — "FINDINGS OF FACT" — rather than
 * inset from the left like a quotation: about as far from the right edge of
 * the page's text as from the left.
 */
function isCentred(line: string, width: number): boolean {
  const left = indentOf(line);
  const right = width - line.trimEnd().length;
  return left >= 20 && Math.abs(left - right) <= 0.3 * (left + right);
}

/** The next finding number a report numbered throughout expects (`numberedFindings`). */
export type FindingCounter = { next: number };

const FINDING_LINE = /^\s*(\d{1,4})\.\s+\S/;

/**
 * Which lines open a numbered finding: indented past the margin, carrying the
 * next number in the report's sequence (or one of the two after it, so a
 * single misread does not lose every finding that follows), on a page that is
 * not a contents page, and not a contents entry nor a heading — "3.
 * Tobacco Institute Committees" is an outline label, not finding 3 — unless
 * its number is exactly the next. Advances the counter as it goes; the value
 * at each line is its finding number, 0 where none opens.
 */
function readFindings(
  lines: string[],
  margin: number,
  counter: FindingCounter,
  isHeading: (text: string, allowDivisions: boolean) => unknown
): number[] {
  // A contents page numbers its entries too, and they wrap without leaders:
  // "1.   Research Review Committee, Research Liaison Committee,".
  if (lines.filter((line) => SPACED_LEADERS.test(line)).length >= 3) return lines.map(() => 0);
  return lines.map((line) => {
    const match = line.match(FINDING_LINE);
    if (!match || indentOf(line) <= margin || TOC_ENTRY.test(line)) return 0;
    const n = Number.parseInt(match[1], 10);
    if (n < counter.next || n > counter.next + 2) return 0;
    // A title-case opening reads as a heading ("71. Geoffrey F. Todd,
    // Executive Director of the Tobacco Research Council, a British"), so
    // only the exact next number overrides one.
    if (n !== counter.next && isHeading(normaliseWhitespace(line), true)) return 0;
    counter.next = n + 1;
    return n;
  });
}

/**
 * Reflows hard-wrapped lines back into paragraphs.
 *
 * The signal is indentation: a line indented past the running left margin opens
 * a new paragraph. Blank lines are a secondary signal, and block quotes (set
 * far to the right) are kept as quotes.
 */
/**
 * A line that opens a quotation which neither it nor the line after it
 * closes: the first line of a quoted document — a draft clause's title, an
 * advert's copy, set in capitals ('"GUARANTEE OF MEDIA FREEDOM' / '(1) The
 * Secretary of State…', Leveson; reportsthatmatter-djy) — never a title of
 * the report's own. A quoted title that wraps closes on its next line
 * ('"THE SYSTEM WAS' / 'BLINKING RED"', the 9/11 Commission).
 */
function opensUnclosedQuotation(text: string, lines: string[], at: number): boolean {
  const trimmed = text.trim();
  if (!/^["\u201c\u2018]/.test(trimmed) || /["\u201d\u2019]/.test(trimmed.slice(1))) return false;
  for (let j = at + 1; j < lines.length; j++) {
    if (!lines[j].trim()) continue;
    return !/["\u201d\u2019]/.test(lines[j]);
  }
  return true;
}

export function toBlocks(
  lines: string[],
  documentMargin?: number,
  quoteInset: number = DEFAULT_QUOTE_INSET,
  numberedParagraphs = false,
  allCapsHeadings = true,
  paragraphContents = false,
  numberedHeadings = true,
  listed?: Set<string>,
  numbered?: NumberedContents,
  findings?: FindingCounter,
  outline?: Outline,
  divisions?: ListedDivisions,
  wrappedHeadings = false,
  hangingIndents = false,
  unmarkedHeadings = false,
  numberedOutsideTables = false,
  recoverListedHeadings = false,
  letteredItems = false
): Block[] {
  if (paragraphContents) lines = joinParagraphContents(lines);
  // With `listedHeadings`, a would-be heading the contents does not name is
  // text: judged before anything else looks at the line, so a quoted cue line
  // counts as part of its quotation rather than as structure beside it.
  // `contentsOutline`: once the contents has been read, a heading is one it
  // lists, or a title centred on the page; anything else heading-shaped —
  // advertising copy in capitals, a quoted document's caption — is text.
  const outlined = outline?.entries.size ? readOutline(lines, outline) : undefined;
  const width = Math.max(0, ...lines.map((line) => line.trimEnd().length));
  // A line continuing a sentence from the one above it is not a title, however
  // it sits: '…deleted Star's onsert statement that "ALL SMOKED' / 'TOBACCO
  // PRODUCTS ARE ADDICTIVE AND POSE'.
  const runsOn = (at: number) => {
    for (let j = at - 1; j >= 0; j--) {
      if (lines[j].trim()) return !/[.:;?!"”)\]]$/.test(lines[j].trim());
    }
    return false;
  };
  // `unmarkedHeadings`: whether the nearest non-blank line before `at`, on
  // this page, is a safe place for a bare heading to start — it ends a
  // sentence, or it is itself a heading the contents names (two of these can
  // sit back to back with nothing between them, a section directly over its
  // own first subsection). Nothing before it on the page at all is
  // unknowable, since it may continue a sentence from the page before.
  const priorEndsCleanly = (at: number): boolean => {
    for (let j = at - 1; j >= 0; j--) {
      const prior = lines[j];
      if (!prior.trim()) continue;
      if (listed?.has(headingKey(normaliseWhitespace(prior)))) return true;
      return /[.:;?!"”)\]]$/.test(prior.trim()) || (recoverListedHeadings && FOOTNOTE_TAIL.test(prior.trim()));
    }
    return false;
  };
  // `recoverListedHeadings`: a contents entry may also open the page, where nothing
  // above it can say whether it starts a block or finishes a sentence from the
  // page before. It must then look like a title and be followed at once by
  // what a heading is followed by: a numbered paragraph, or another heading
  // the contents names. "reconstruction." (the tail of a sentence) fails the
  // first test; "Negotiation of resolution 1441" / "119. There were…" passes.
  const opensPageAsHeading = (text: string, at: number, span = 1): boolean => {
    for (let j = at - 1; j >= 0; j--) if (lines[j].trim()) return false;
    if (!/^[A-Z0-9]/.test(text) || /[.,;:]$/.test(text)) return false;
    let seen = 0;
    for (let j = at + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (!next) continue;
      if (++seen < span) continue;
      return /^\d{1,4}\.\s+\S/.test(next) || Boolean(listed?.has(headingKey(normaliseWhitespace(next))));
    }
    return false;
  };
  // `recoverListedHeadings`: a contents entry the body sets over two lines
  // ("The gap between the Permanent Members of the Security Council" /
  // "widens"). The two physical lines, joined, are the entry letter for
  // letter; neither is, alone. The first line opens the heading, under the
  // same guard as any bare heading; the second is read as its continuation
  // and the usual rejoin makes one heading of them.
  const joinsWith = (a: number, b: number): boolean =>
    a >= 0 && b < lines.length && Boolean(lines[a].trim()) && Boolean(lines[b].trim()) &&
    Boolean(listed?.has(headingKey(normaliseWhitespace(`${lines[a].trim()} ${lines[b].trim()}`))));
  const isHeading = (
    text: string,
    allowDivisions: boolean,
    at?: number
  ): { level: number; text: string; bare?: boolean } | null => {
    if (outlined && (at === undefined || !isCentred(lines[at], width) || runsOn(at))) return null;
    if (at !== undefined && opensUnclosedQuotation(text, lines, at)) return null;
    // `numberedHeadingsOutsideTables`: a lettered or numbered row of a table or
    // two-column list ("C. Hobson Bryan   Jill Jonnes") is not a heading.
    const numberedHere =
      numberedHeadings && !(numberedOutsideTables && at !== undefined && inTable[at]);
    const heading = isHeadingLine(text, allowDivisions, allCapsHeadings, numberedHere);
    // `recoverListedHeadings`: a caps title that ends in a number ("…RESOLUTION
    // 1483") has the number read as a page number and trimmed, so the heading
    // found no longer matches the contents. Judge the whole line instead.
    const trimmedAway =
      recoverListedHeadings && heading && listed && !listed.has(headingKey(heading.text)) && listed.has(headingKey(text));
    if (heading && !trimmedAway) return listed && !listed.has(headingKey(heading.text)) ? null : heading;
    // `unmarkedHeadings`: the other half of `listedHeadings` — a line with no
    // heading shape of its own (no caps, number or division label) is still
    // the heading the contents names, when it matches one letter for letter.
    // `bare`: an exact match against the contents, never a wrapping fragment
    // of the heading before or after it — two of these can sit on consecutive
    // lines with no blank between (a section heading directly over its first
    // subsection), and neither may absorb the other the way a heading whose
    // title merely runs long does.
    // Only where the nearest line before it on the same page either ends
    // cleanly or is itself a heading the contents names: the first line of a
    // page can equally be the tail end of a sentence carried over from the
    // page before, invisible here ("...to oversee the UK contribution to
    // post-conflict" / page break / "reconstruction." — which happens to be
    // a real heading elsewhere in this report). Nothing before it at all, on
    // its page, is unknowable and so unsafe.
    if (unmarkedHeadings && at !== undefined && listed?.has(headingKey(text)) &&
      (priorEndsCleanly(at) || (recoverListedHeadings && opensPageAsHeading(text, at)))
    ) {
      return { level: heading?.level ?? 3, text, bare: true as const };
    }
    if (recoverListedHeadings && unmarkedHeadings && at !== undefined && listed) {
      if (joinsWith(at, at + 1) && !listed.has(headingKey(text)) && (priorEndsCleanly(at) || opensPageAsHeading(text, at, 2))) {
        return { level: 3, text };
      }
      if (
        joinsWith(at - 1, at) &&
        (priorEndsCleanly(at - 1) || opensPageAsHeading(lines[at - 1].trim(), at - 1, 2))
      ) {
        return { level: 3, text };
      }
    }
    return null;
  };
  // The left margin is a property of the document's layout, not of one page. A
  // short page — the last of a section, say — can have too few lines to infer
  // it from, and getting it wrong turns an ordinary paragraph into a quote.
  const margin = documentMargin ?? bodyIndent(lines);
  const hanging =
    hangingIndents || letteredItems
      ? hangingItems(lines, hangingIndents, letteredItems ? margin + quoteInset : 0)
      : null;
  const blocks: Block[] = [];

  // A row of a table is not a division. The Jack Smith docket lists "Section 4
  // Filing and an Adjournment of the CIPA Section 5 Deadline" as a filing
  // description, and read as a division that manufactures a heading — colon
  // and all — out of a table cell (#120).
  const inTable = tabularContext(lines);

  // A block quote is a *sustained* run of indented lines. A paragraph's first
  // line is indented just as deeply but is followed by lines back at the
  // margin — judging on indent alone splits sentences in half and quotes the
  // opening clause. It is the *sustained* part that does the work, which is
  // why the inset itself can be small: Litvinenko sets its body at 7 and its
  // quotations at 10, and requiring five put every quotation on that page
  // back into the prose.
  // Headings and contents entries are indented too, so they must not count as
  // quote neighbours — otherwise the first line of the paragraph beneath a
  // heading looks like the continuation of an indented block and gets quoted.
  // `numberedFindings`: the lines that open the next finding in sequence.
  const findingAt = findings ? readFindings(lines, margin, findings, isHeading) : [];

  const outlineLines = new Set<number>();
  for (const [start, heading] of outlined ?? []) {
    for (let j = start; j <= heading.end; j++) outlineLines.add(j);
  }
  const structural = lines.map((line, i) => {
    if (outlineLines.has(i)) return true;
    if (!line.trim() || findingAt[i]) return false;
    // TOC_ENTRY's whitespace-gap branch needs the line's real spacing, which
    // normaliseWhitespace below would collapse away before it gets a look.
    return (
      TOC_ENTRY.test(line) ||
      isHeading(normaliseWhitespace(line), !inTable[i], i) !== null
    );
  });

  const quoted = lines.map((line, i) => {
    if (hanging?.continues[i]) return false;
    if (!line.trim() || structural[i] || findingAt[i] || indentOf(line) < margin + quoteInset) {
      return false;
    }
    const neighbour = (j: number) => {
      const other = lines[j];
      return (
        Boolean(other?.trim()) &&
        !structural[j] &&
        !findingAt[j] &&
        indentOf(other) >= margin + quoteInset
      );
    };
    return neighbour(i - 1) || neighbour(i + 1);
  });

  let current: string[] = [];
  let currentStart = 0;
  let currentKind: "paragraph" | "quote" = "paragraph";
  let currentFinding: number | undefined;

  // The column a division heading's title starts at, while its title may still
  // be wrapping onto aligned continuation lines below it. -1 once the title is
  // complete (a blank line, a nested heading, or the first paragraph).
  let openDivisionIndent = -1;
  const DIVISION_LINE =
    /^(\s*)(?:Part|Chapter|Appendix|Annex|Volume|Section)\s+(?:\d{1,3}|[IVXLC]{1,7}):?\s+/;

  // An open list, and the column its items' text starts at. A line indented to
  // that column is the wrapped tail of the item above it, not a new block —
  // getting this wrong is what put text out of order (issue #12).
  let list: string[] | null = null;
  let listTextIndent = 0;

  // Which lines belong to a run that *opens* with a bullet.
  //
  // This is what tells a list apart from a quoted document that happens to
  // contain bullets. Both are indented runs, so indentation cannot separate
  // them. In the PSI report the bulleted passages are quoted emails: the run
  // opens with quoted prose and the bullets appear inside it, and lifting them
  // out breaks the quotation apart. A list of the kind issue #12 reported is a
  // run that is bullets from its first line.
  const inBulletRun = lines.map(() => false);
  for (let start = 0; start < lines.length; start++) {
    if (!lines[start].trim()) continue;
    let end = start;
    while (end + 1 < lines.length && lines[end + 1].trim()) end++;
    if (BULLET.test(lines[start])) {
      for (let j = start; j <= end; j++) inBulletRun[j] = true;
    }
    start = end;
  }

  // Headings read from the contents (`numberedSections`) are complete as
  // they stand: nothing below them is folded in as a wrapped title.
  const complete = new Set<Block>();
  // The last line a numbered section's heading took.
  let taken = -1;
  // Division banners and the title lines they took (`divisionBanners`).
  const banners = numbered?.divisions.size ? divisionBanners(lines, numbered.divisions) : null;

  const flush = () => {
    if (!current.length) return;
    const text = normaliseWhitespace(current.join(" "));
    current = [];
    const finding = currentFinding;
    currentFinding = undefined;
    if (!text) return;
    if (finding !== undefined) {
      blocks.push({ kind: "paragraph", text, finding });
      return;
    }
    // A paragraph that is only a number is page furniture the footer sweep
    // missed, not content.
    if (/^\d{1,4}$/.test(text)) return;

    if (currentKind === "quote") {
      blocks.push({ kind: "quote", text });
      return;
    }
    const heading = isHeading(text, !inTable[currentStart], currentStart);
    if (heading) blocks.push({ kind: "heading", ...heading });
    else blocks.push({ kind: "paragraph", text });
  };

  for (const [i, line] of lines.entries()) {
    if (i <= taken) continue;
    const banner = banners?.headings.get(i);
    if (banner) {
      flush();
      list = null;
      openDivisionIndent = -1;
      const heading: Block = { kind: "heading", level: 2, text: banner };
      complete.add(heading);
      blocks.push(heading);
      continue;
    }
    if (banners?.title.has(i)) continue;
    if (line === COLUMN_BREAK) {
      flush();
      list = null;
      openDivisionIndent = -1;
      const last = blocks[blocks.length - 1];
      if (last) last.hardBreak = true;
      continue;
    }

    if (!line.trim()) {
      flush();
      openDivisionIndent = -1;
      // A blank line does not end a list: these documents routinely set one
      // between bullets.
      continue;
    }

    const bullet = inBulletRun[i] ? line.match(BULLET) : null;
    if (bullet) {
      flush();
      openDivisionIndent = -1;
      listTextIndent = line.length - bullet[3].length;
      if (!list) {
        list = [];
        // A list inside a quoted document stays inside it: these reports quote
        // guidance and emails that carry their own bullets, and dropping the
        // quotation would present someone else's words as the report's.
        blocks.push({ kind: "list", items: list, quoted: quoted[i] });
      }
      list.push(normaliseWhitespace(bullet[3]));
      continue;
    }

    if (list) {
      // Indented to the item text and not structure of its own: the rest of
      // the item above.
      if (inBulletRun[i] && !structural[i] && indentOf(line) >= listTextIndent - 1) {
        list[list.length - 1] = normaliseWhitespace(
          `${list[list.length - 1]} ${line.trim()}`
        );
        continue;
      }
      list = null;
    }

    // A section the contents lists, by its number: read before anything else
    // judges the line, because the body sets these titles in capitals that
    // may carry a date ("9.2 SEPTEMBER 11, 2001") or wrap, and as ordinary
    // caps headings they were lost into the paragraph below or fused onto
    // the chapter banner above.
    // A part, chapter or appendix the contents lists (`listedDivisions`),
    // its title spelt out over the lines of a chapter opener.
    const division = divisions ? listedDivisionAt(lines, i, divisions) : null;
    if (division) {
      flush();
      list = null;
      openDivisionIndent = -1;
      const heading: Block = { kind: "heading", level: division.level, text: division.text };
      complete.add(heading);
      blocks.push(heading);
      taken = division.end;
      continue;
    }

    const section = numbered ? numberedSectionAt(lines, i, numbered.sections) : null;
    if (section) {
      flush();
      list = null;
      openDivisionIndent = -1;
      // Level 3, one below the chapter banner ("8", set by the all-caps
      // heading path below at level 2), when the contents also names bare
      // numbered chapters (`numbered.chapters`, "8.  Title"): otherwise the
      // contents has no chapter level at all, every section flush with its
      // chapter (reportsthatmatter-u88). A report whose chapters are instead
      // named by word and label ("Chapter 1", Columbia) opens them with
      // `divisionBanners` at level 2 already, flat with its own sections —
      // nesting under a banner that pass never emits would just orphan them.
      const level = numbered?.chapters.size ? 3 : 2;
      const heading: Block = { kind: "heading", level, text: section.text };
      complete.add(heading);
      blocks.push(heading);
      taken = section.end;
      continue;
    }

    const listedHeading = outlined?.get(i);
    if (listedHeading) {
      flush();
      list = null;
      openDivisionIndent = -1;
      const heading: Block = { kind: "heading", level: listedHeading.level, text: listedHeading.text };
      complete.add(heading);
      blocks.push(heading);
      taken = listedHeading.end;
      continue;
    }

    // Headings and contents entries are recognisable on their own, and on
    // structured pages the indentation alone will not separate them — the
    // table of contents is set at a single indent throughout.
    const single = normaliseWhitespace(line);

    // Matched against the raw line, not `single` — the whitespace-gap branch
    // needs real spacing, which normaliseWhitespace collapses to one space.
    const contents =
      line.match(/^(.*\S)(?:[.·]{4,}\s*|(?<![.,;:])[ \t]{3,})(\d{1,4})\s*$/) ??
      (paragraphContents ? line.match(PARAGRAPH_CONTENTS_ENTRY) : null);
    if (contents && contents[1].trim()) {
      let text = normaliseWhitespace(contents[1]).replace(/[.·\s]+$/, "").trim();
      // An entry that wraps carries its page number on its last line only, so
      // its first line arrives alone and reads as a heading — "Chapter 7:
      // Conclusions and recommendations for future regulation" / "of the press
      // 1748" — and a section opens on the contents page (reportsthatmatter-djy).
      // No entry opens in lower case: the line above is the entry's head.
      if (/^[a-z]/.test(text)) {
        const last = blocks[blocks.length - 1];
        // The head is one line: a paragraph running into a footer-shaped line
        // ("…heating. Report Volume I August 2003   149", Columbia) is not.
        if (current.length === 1 && currentKind === "paragraph" && currentFinding === undefined) {
          text = normaliseWhitespace([...current, text].join(" "));
          current = [];
        } else if (!current.length && last?.kind === "heading" && !complete.has(last)) {
          blocks.pop();
          text = normaliseWhitespace(`${last.text} ${text}`);
        }
      }
      flush();
      openDivisionIndent = -1;
      blocks.push({ kind: "contents", text, page: contents[2] });
      continue;
    }

    // A heading that wraps onto a line beginning lowercase is not detected as a
    // heading at all — "…the evenhanded administration of the" / "law was served
    // by Mr. Trump's prosecution" — so the title ships stopping mid-phrase and
    // its tail becomes a stray paragraph.
    const openHeading = blocks[blocks.length - 1];
    if (
      !findingAt[i] &&
      !current.length &&
      openHeading?.kind === "heading" &&
      !complete.has(openHeading) &&
      danglesMidPhrase(openHeading.text) &&
      /^[a-z]/.test(single)
    ) {
      openHeading.text = `${openHeading.text} ${single}`;
      continue;
    }

    // A division title ("Part 6:  The polonium trail – events in") that runs
    // past one line continues on lines aligned under it. The tail is ordinary
    // title-case text — neither all-caps nor numbered — so it is not caught as
    // a heading of its own; fold it back in until the title is complete.
    if (
      !current.length &&
      openDivisionIndent >= 0 &&
      openHeading?.kind === "heading" &&
      isDivisionHeading(openHeading.text) &&
      !structural[i] &&
      !findingAt[i] &&
      !opensNumberedParagraph(single) &&
      indentOf(line) >= openDivisionIndent - 2
    ) {
      openHeading.text = `${openHeading.text} ${single}`;
      continue;
    }
    openDivisionIndent = -1;

    const standalone = findingAt[i] ? null : isHeading(single, !inTable[i], i);
    if (standalone) {
      flush();
      if (isDivisionHeading(standalone.text)) {
        openDivisionIndent = line.match(DIVISION_LINE)?.[0].length ?? indentOf(line);
      }
      const previous = blocks[blocks.length - 1];
      // A heading too long for one line continues on the next, where it is
      // detected as a second heading. Rejoin them rather than shipping a title
      // that stops mid-phrase.
      if (
        previous?.kind === "heading" &&
        !complete.has(previous) &&
        previous.level === standalone.level &&
        !/[.?!:]$/.test(previous.text) &&
        // A line that opens its own numbering starts a new heading, not a
        // continuation. Test for the numbering, not the first letter — "I" and
        // "C" begin plenty of ordinary words.
        !/^([IVXLC]{1,6}|[A-Z]|\d{1,2})\.\s/.test(single) &&
        !standalone.bare
      ) {
        previous.text = `${previous.text} ${standalone.text}`;
      } else {
        const heading: Block = { kind: "heading", level: standalone.level, text: standalone.text };
        if (standalone.bare) complete.add(heading);
        blocks.push(heading);
      }
      // `wrappedHeadings`: the rest of the title, on a short line below.
      const opened = blocks[blocks.length - 1];
      const tail =
        wrappedHeadings &&
        !inTable[i] &&
        /^([IVXLC]{1,6}|[A-Z]|\d{1,2})\.\s/.test(single) &&
        opened.kind === "heading" &&
        !/[.?!:]$/.test(opened.text)
        ? headingTail(lines[i + 1])
        : null;
      if (tail && opened.kind === "heading" && !structural[i + 1]) {
        opened.text = `${opened.text} ${tail}`;
        taken = i + 1;
      }
      continue;
    }

    const indent = indentOf(line);
    const kind: "paragraph" | "quote" = quoted[i] ? "quote" : "paragraph";
    // These reports' own "7.1", "10.14" numbering is a hanging indent — the
    // number sits at the margin and the paragraph's own text one tab-stop
    // in, the same column ordinary continuation lines sit at — so indent
    // alone cannot tell a numbered opener apart from the line above
    // continuing. Most of the time a blank line does that job instead, but
    // it is not reliable: some pages carry one between every numbered
    // paragraph, others carry none at all, and where it is missing five and
    // more consecutive paragraphs silently weld into one
    // (reportsthatmatter-hzf).
    //
    // Opt-in, and it must stay that way: a report that does not number its
    // paragraphs this way still has plenty of lines that coincidentally open
    // with a decimal-shaped number wrapped onto its own line — "5.8 to\n7.0
    // percent" reads as "5.8 to" ending a paragraph and "7.0 percent..."
    // opening a new one, a measurement severed mid-sentence, in a document
    // (Challenger's test-method appendices) that never numbers a paragraph
    // this way at all. Confirmed empirically: applying this unconditionally
    // moved every report in the corpus, not just the ones that use the
    // convention.
    const startsParagraph =
      Boolean(findingAt[i]) ||
      (!quoted[i] &&
        !hanging?.continues[i] &&
        (indent > margin + 1 ||
          (numberedParagraphs && opensNumberedParagraph(single)) ||
          Boolean(hanging?.opens[i])));

    if ((startsParagraph || kind !== currentKind) && current.length) flush();

    currentKind = kind;
    if (!current.length) currentStart = i;
    if (findingAt[i]) currentFinding = findingAt[i];
    current.push(line.trim());
  }

  flush();
  if (numbered?.chapters.size) joinChapterBanners(blocks, numbered.chapters);
  return blocks;
}

/**
 * Items set with a hanging indent under a label (`hangingIndents`):
 *
 *     F6.3-1     The foam strike was first seen by the Intercenter Photo
 *                Working Group on the morning of Flight Day Two …
 *
 * Columbia sets every finding, recommendation and observation this way. The
 * wrapped lines sit well past the margin, so they read as a quotation cut
 * from the item's first line ("…on the morn-" / "> ing of Flight Day Two"),
 * and a label at the margin opened no paragraph of its own, so one item ran
 * on into the next. A label here is a short token carrying a digit, set two
 * or more spaces before its text; the item is the lines indented to that
 * text, within a character.
 */
function hangingItems(
  lines: string[],
  numbered = true,
  letteredBelow = 0
): { opens: boolean[]; continues: boolean[] } {
  const opens = lines.map(() => false);
  const continues = lines.map(() => false);
  for (let i = 0; i < lines.length; i++) {
    let label = numbered ? lines[i].match(/^(\s*)(?=\S*\d)(\S{2,12})( {2,})\S/) : null;
    // `letteredItems`: a sub-item's own letter ("a.", "(b)", "iv.") over its
    // wrapped lines, wherever it sits short of a quotation's inset.
    if (!label && letteredBelow) {
      label = lines[i].match(/^(\s*)(\(?(?:[a-z]|[ivx]{1,4})[.)])( {2,})\S/);
      if (label && indentOf(lines[i]) >= letteredBelow) label = null;
    }
    if (!label) continue;
    const column = label[0].length - 1;
    let k = i + 1;
    while (k < lines.length && lines[k].trim() && Math.abs(indentOf(lines[k]) - column) <= 1) {
      continues[k] = true;
      k++;
    }
    if (k === i + 1) continue;
    opens[i] = true;
    i = k - 1;
  }
  return { opens, continues };
}

/**
 * Where a division opens under a banner that names it and nothing else —
 * "CHAPTER 1", "Part One", "APPENDIX A" — with its title set apart on lines
 * of its own ("The Evolution of the" / "Space Shuttle Program"), and the
 * contents lists the division by that label (`numberedSections`).
 *
 * The title is looked for anywhere on the page, not just below the banner:
 * Columbia centres it over a two-column page, and read column by column it
 * can open either column. It is found by its letters against the contents'
 * title, across consecutive lines, so the page's own case and line breaks do
 * not matter; the heading is the page's own words, "Chapter 1: The Evolution
 * of the Space Shuttle Program". A banner whose title is not found on the page
 * is left alone.
 */
function divisionBanners(
  lines: string[],
  divisions: Map<string, string>
): { headings: Map<number, string>; title: Set<number> } {
  const headings = new Map<number, string>();
  const title = new Set<number>();
  for (const [i, line] of lines.entries()) {
    const banner = line.match(DIVISION_BANNER);
    const listed = banner ? divisions.get(divisionKey(banner[1], banner[2])) : undefined;
    if (!banner || !listed) continue;
    const target = titleLetters(listed);
    let found: number[] | null = null;
    for (let start = 0; start < lines.length && !found; start++) {
      if (start === i || !lines[start].trim() || title.has(start)) continue;
      let read = "";
      const run: number[] = [];
      for (let k = start; k < lines.length && k !== i && lines[k].trim(); k++) {
        read += titleLetters(lines[k]);
        run.push(k);
        if (read === target) {
          found = run;
          break;
        }
        if (!target.startsWith(read)) break;
      }
    }
    if (!found) continue;
    for (const k of found) title.add(k);
    const word = banner[1][0].toUpperCase() + banner[1].slice(1).toLowerCase();
    const number = /^\d|^[A-Z]$|^[IVXLC]+$/.test(banner[2])
      ? banner[2].toUpperCase()
      : banner[2][0].toUpperCase() + banner[2].slice(1).toLowerCase();
    const text = normaliseWhitespace(found.map((k) => lines[k]).join(" "));
    headings.set(i, `${word} ${number}: ${text}`);
  }
  return { headings, title };
}

/**
 * A chapter banner set over two lines that each end like a title ("WHAT TO
 * DO?" / "A GLOBAL STRATEGY") is read as two headings; where together they
 * are a chapter the contents lists, they are one.
 */
function joinChapterBanners(blocks: Block[], chapters: Set<string>): void {
  for (let k = 0; k + 1 < blocks.length; k++) {
    const a = blocks[k];
    const b = blocks[k + 1];
    if (a.kind !== "heading" || b.kind !== "heading" || a.level !== b.level) continue;
    if (chapters.has(titleLetters(a.text)) || !chapters.has(titleLetters(a.text + b.text))) continue;
    a.text = `${a.text} ${b.text}`;
    blocks.splice(k + 1, 1);
  }
}

/**
 * Rejoins paragraphs split by a page break.
 *
 * Each page is parsed on its own, so a sentence running over the foot of one
 * page and onto the next arrives as two paragraphs — and, because the second
 * half starts with a lowercase word, as visibly broken prose.
 */
/**
 * Abbreviations that end in a full stop without ending a sentence. Without
 * these, a page break falling between "Mr." and "Trump" leaves a paragraph
 * opening mid-sentence — and in a document about Mr. Trump, that is often.
 */
const ABBREVIATION =
  /\b(mr|mrs|ms|dr|prof|sen|rep|gov|st|nos?|vs?|inc|co|corp|ltd|jr|sr|u\.s|e\.g|i\.e|cf|ch|art|sec|fig|para|pp?|ecf|tr)\.$/i;

/** A single initial — "Donald J." — is not a sentence end either. */
const INITIAL = /\b[A-Z]\.$/;

export function endsSentence(text: string): boolean {
  const terminal = text.trim().replace(/["')\]]+$/, "");
  if (!/[.?!:;]$/.test(terminal)) return false;
  if (ABBREVIATION.test(text) || INITIAL.test(text)) return false;
  return true;
}

export type MergeOptions = {
  /**
   * The PDF's line layout, when the host supplied one. Read by `layoutJoins`
   * (the `layoutPageJoins` pass); nothing else here looks at it.
   */
  layout?: Layout;
  /**
   * The `pageBreakContinuations` pass (reportsthatmatter-ca3, -kb4): look past
   * every page marker, not just one, and read a page-opening quotation that
   * carries on a sentence as the rest of that sentence. See the pass.
   */
  continuations?: boolean;
  /**
   * `pageBreakContinuations({ quoteTails: true })` (reportsthatmatter-nen): a
   * quotation's first line left as prose at the foot of a page is joined into
   * the rest of the quotation on the next. See the pass.
   */
  quoteTails?: boolean;
  /**
   * The `quoteRunOn` pass (reportsthatmatter-m2y): a paragraph opening a page
   * in lower case carries on the quotation above when that stops mid-sentence.
   */
  quoteRunOn?: boolean;
  /**
   * The `photoCredits` pass (reportsthatmatter-xay): a photo credit
   * ("Mark Wilson/Getty Images") between a paragraph and its continuation is
   * set aside, and the continuation rejoins the paragraph it continues.
   */
  photoCredits?: boolean;
  /**
   * `letteredItems`: a block opening on its own item letter ("b. On 4
   * November…") is the next item, not the lower-case rest of the sentence
   * above, however the item above ends.
   */
  letteredItems?: boolean;
  /**
   * The `quoteListRunOns` pass (reportsthatmatter-38s.9): a block quotation
   * or list item running over a page arrives as two quotations or two lists.
   * The second joins the first when the first stops mid-sentence and the
   * second opens in lower case, on no label of its own. Text only.
   */
  quoteListRunOns?: boolean;
  /**
   * The `layoutPageJoins` pass (reportsthatmatter-38s.10): a paragraph the
   * text rules leave split at a page break joins the one above when the
   * layout says it runs on (rules R1 and R2; see the pass). Needs `layout`.
   */
  layoutJoins?: PageBreakOptions;
};

/** An item's own letter: "b." or "(c)" or "iv.", then its text. */
const ITEM_LABEL = /^\(?(?:[a-z]|[ivx]{1,4})[.)]\s+\S/;

/** Opens on a quotation mark, perhaps behind an ellipsis: `"… if Mr Wallis`. */
const OPENS_QUOTATION = /^(?:\.\.\.\s*|…\s*)?["\u201c\u2018']/;

/**
 * Introduces what follows: a finished sentence or a colon, perhaps with the
 * footnote number the pipeline has not linked yet — "He said:414",
 * "suggested that:[^605]".
 */
function introduces(text: string): boolean {
  if (endsSentence(text)) return true;
  return /[.?!:]["'\u201d\u2019)\]]*\s?(?:\d{1,4}|\[\^\d+\])$/.test(text.trim());
}

/** "Mark Wilson/Getty Images", "Patrick Semansky/Associated Press": a short byline with a slash, no sentence. */
export function isPhotoCredit(text: string): boolean {
  const t = text.trim();
  return t.length <= 90 && !endsSentence(t) && /^[A-Z][\w.'’&-]*(?: [\w.'’&-]+){0,5}\/[A-Z]/.test(t) && !/[,;]$/.test(t);
}

/** Lower case, or punctuation no sentence opens on. */
const CONTINUATION = /^[a-z,;]/;

/** A lone OCR glyph (a degree sign for a raised digit) before a lower-case word. */
const STRAY_GLYPH = /^[°º˚]\s+(?=[a-z])/;

/**
 * A quotation opening a page that is really the rest of the sentence above:
 * a skewed scan insets a page's first lines, so they read as a quotation.
 *
 * A genuine quotation is introduced (the paragraph above ends a sentence, on
 * "as follows:" say) or opens on a quotation mark or bracket, so neither is
 * taken. Otherwise it continues the sentence if it opens in lower case, or if
 * it stops mid-sentence itself and the page's next block carries on in lower
 * case — the sentence running in through the inset lines and out again.
 */
function continuesSentence(quote: string, next: Block | undefined): boolean {
  if (/^["\u201c\u2018'[(]/.test(quote)) return false;
  if (CONTINUATION.test(quote)) return true;
  return (
    !endsSentence(quote) &&
    next?.kind === "paragraph" &&
    CONTINUATION.test(next.text)
  );
}

/**
 * Whether `blocks[index]` is the first block read from its page: what stands
 * before it in the page-by-page reading is a page marker or another page's
 * block. A paragraph that only *started* on an earlier page (it was joined
 * over the break already) does not make the next block on this page a page
 * break.
 */
function opensPage(blocks: Block[], index: number): boolean {
  const block = blocks[index];
  for (let i = index - 1; i >= 0; i--) {
    const before = blocks[i];
    if (before.kind === "page") return true;
    if (before.at === undefined || block.at === undefined) return false;
    return before.at.pdfIndex !== block.at.pdfIndex || before.at.volume !== block.at.volume;
  }
  return false;
}

export function mergeAcrossPages(blocks: Block[], options: MergeOptions = {}): Block[] {
  const merged: Block[] = [];

  for (const [index, block] of blocks.entries()) {
    // A page marker sits exactly where a sentence is most likely to be split,
    // so look past it — then leave it after the joined paragraph, since the
    // sentence belongs to the page it started on. A paragraph that fills a
    // whole page leaves that page's marker behind it too, so with
    // `continuations` look past every marker in the run.
    let markerIndex =
      merged.length && merged[merged.length - 1].kind === "page"
        ? merged.length - 1
        : -1;
    if (options.continuations) {
      while (markerIndex > 0 && merged[markerIndex - 1].kind === "page") markerIndex -= 1;
    }
    const previous = merged[markerIndex === -1 ? merged.length - 1 : markerIndex - 1];

    // A scan's stray glyph between two lines of one paragraph: the OCR read
    // the raised digits of a footnote marker ("mate.140") as a lone "°" on a
    // line of its own, which parsed as a paragraph break, and left "° running
    // mate." opening a block (Jack Smith p.36, reportsthatmatter-ky1o). A
    // lone glyph and then lower case, after a paragraph that stops mid-
    // sentence, is the paragraph carrying on: drop the glyph and let the
    // lower-case rule below join it.
    if (
      options.layoutJoins?.scanned &&
      block.kind === "paragraph" &&
      block.finding === undefined &&
      previous?.kind === "paragraph" &&
      !endsSentence(previous.text) &&
      STRAY_GLYPH.test(block.text)
    ) {
      block.text = block.text.replace(STRAY_GLYPH, "");
    }

    // A word broken by the page break. Whether the hyphen belongs to the word
    // or to the typesetter cannot be known for certain, but the case of what
    // follows is a good guide: "Co-" + "Conspirator" is a real compound,
    // "regu-" + "lation" is a line break.
    if (previous?.hardBreak) {
      merged.push(block);
      continue;
    }

    const acrossPages =
      previous?.at === undefined ||
      block.at === undefined ||
      previous.at.pdfIndex !== block.at.pdfIndex;

    // A block quotation or a list item that runs over the foot of a page: the
    // next page is parsed on its own, so the rest arrives as a second quotation
    // (or list). Join only a lower-case opening that is not an item's own
    // label ("b. On 4 November", "(c) the"), after a block that stops
    // mid-sentence, across a page, and look past every page marker, leaving
    // them after the joined block.
    if (options.quoteListRunOns && (block.kind === "quote" || block.kind === "list")) {
      let tail = merged.length - 1;
      while (tail >= 0 && merged[tail].kind === "page") tail -= 1;
      const above = tail >= 0 ? merged[tail] : undefined;
      const overPage =
        tail < merged.length - 1 &&
        (above?.at === undefined ||
          block.at === undefined ||
          above.at.pdfIndex !== block.at.pdfIndex);
      if (!above?.hardBreak && overPage) {
        if (
          block.kind === "quote" &&
          above?.kind === "quote" &&
          !endsSentence(above.text) &&
          CONTINUATION.test(block.text) &&
          !ITEM_LABEL.test(block.text)
        ) {
          // "pro-" + "actively": a word the page break cut, as at a paragraph's.
          above.text = /[-­‐]$/.test(above.text)
            ? above.text.replace(/[-­‐]$/, "") + block.text
            : `${above.text} ${block.text}`;
          continue;
        }
        // A list item whose run-over opens the next page inset: the page
        // parser reads its hanging indent as a quotation (9/11 p.415), so
        // the quotation is the rest of the item.
        if (
          block.kind === "quote" &&
          above?.kind === "list" &&
          above.items.length > 0 &&
          CONTINUATION.test(block.text) &&
          !ITEM_LABEL.test(block.text)
        ) {
          const last = above.items[above.items.length - 1];
          if (!endsSentence(last) && !/;\s*(?:and|or)$/.test(last.trim())) {
            above.items[above.items.length - 1] = /[-­‐]$/.test(last)
              ? last.replace(/[-­‐]$/, "") + block.text
              : `${last} ${block.text}`;
            continue;
          }
        }
        if (
          block.kind === "list" &&
          above?.kind === "list" &&
          above.quoted === block.quoted &&
          above.items.length > 0 &&
          block.items.length > 0
        ) {
          const last = above.items[above.items.length - 1];
          const first = block.items[0];
          // "…; and" ends its item: the next one is a new item, whatever its case.
          if (
            !endsSentence(last) &&
            !/;\s*(?:and|or)$/.test(last.trim()) &&
            CONTINUATION.test(first) &&
            !ITEM_LABEL.test(first)
          ) {
            above.items[above.items.length - 1] = /[-­‐]$/.test(last)
              ? last.replace(/[-­‐]$/, "") + first
              : `${last} ${first}`;
            above.items.push(...block.items.slice(1));
            continue;
          }
        }
      }
    }

    if (
      block.kind === "paragraph" &&
      previous?.kind === "paragraph" &&
      /[-­‐]$/.test(previous.text)
    ) {
      const stem = previous.text.replace(/[-­‐]$/, "");
      if (/^[A-Z]/.test(block.text)) {
        // A capitalised continuation is a real compound — "Co-" + "Conspirator"
        // — but only across a page break. Within a page the next block is a
        // new element, and a two-column page puts the foot of the left column
        // beside the head of the right, where this glued "Orbital Ac-" onto
        // "Figure 2.1-3".
        if (!acrossPages) {
          merged.push(block);
          continue;
        }
        previous.text = `${stem}-${block.text}`;
      } else {
        previous.text = stem + block.text;
      }
      continue;
    }

    // A list item wrapping over the foot of a page arrives as a paragraph,
    // because each page is parsed on its own and the open list does not
    // survive the break. Left alone it reads after the list — the same
    // out-of-order defect as issue #12, one page-break narrower.
    if (
      block.kind === "paragraph" &&
      previous?.kind === "list" &&
      previous.items.length > 0 &&
      // A lowercase opening is the signal, not the punctuation the item ends
      // on: these items routinely end ")" or ";" mid-sentence, and a genuinely
      // new paragraph after a list opens with a capital.
      /^[a-z,;]/.test(block.text)
    ) {
      const last = previous.items.length - 1;
      previous.items[last] = `${previous.items[last]} ${block.text}`;
      continue;
    }

    // A continuation arriving straight after a photo credit: the credit was
    // set at the foot or head of the page, between the paragraph and the rest
    // of its sentence. Look back past it (and the caption or other complete
    // paragraph beside it) for the paragraph left unfinished.
    if (
      options.photoCredits &&
      block.kind === "paragraph" &&
      block.finding === undefined &&
      previous?.kind === "paragraph" &&
      isPhotoCredit(previous.text) &&
      /^[a-z,;]/.test(block.text)
    ) {
      let seen = 0;
      let target: Block | undefined;
      for (let i = merged.length - 2; i >= 0 && seen < 3; i--) {
        const candidate = merged[i];
        if (candidate.kind === "page") continue;
        // A caption ("Oiled Sargassum") also ends without a full stop; only a
        // paragraph of real length is a sentence left unfinished.
        if (candidate.kind === "paragraph" && !endsSentence(candidate.text) && candidate.text.length >= 120) {
          target = candidate;
          break;
        }
        seen += 1;
      }
      if (target && target.kind === "paragraph") target.text = `${target.text} ${block.text}`;
      else merged.push(block);
      continue;
    }

    if (
      options.continuations &&
      block.kind === "quote" &&
      previous?.kind === "paragraph" &&
      acrossPages &&
      !endsSentence(previous.text) &&
      continuesSentence(block.text, blocks[index + 1])
    ) {
      const at = markerIndex === -1 ? merged.length - 1 : markerIndex - 1;
      // What stands above the paragraph. A contents entry there is a stray
      // page-edge line ("J   204"), and introduces nothing.
      let above = at - 1;
      while (above >= 0 && merged[above].kind === "contents") above -= 1;
      const before = above >= 0 ? merged[above] : undefined;
      if (options.quoteTails) {
        // The quotation's first line, read as prose because one line at the
        // foot of a page cannot show its inset: the paragraph joins the quote.
        if (
          OPENS_QUOTATION.test(previous.text) &&
          (before === undefined || before.kind !== "paragraph" || introduces(before.text))
        ) {
          merged[at] = { kind: "quote", text: `${previous.text} ${block.text}`, at: previous.at };
          continue;
        }
        // Between a quotation that stops mid-sentence and the rest of it: a
        // footnote or page-edge line read into the body, not the sentence's
        // head. Joining here would make the quotation's tail into prose. A
        // quotation trailing off on an ellipsis is finished, and a numbered
        // paragraph is a paragraph whatever stands above it.
        if (
          before?.kind === "quote" &&
          !endsSentence(before.text) &&
          !/(?:…|\.\.\.)["'\u201d\u2019]?$/.test(before.text.trim()) &&
          !/^\d+(?:\.\d+)+\s/.test(previous.text)
        ) {
          merged.push(block);
          continue;
        }
      }
      previous.text = `${previous.text} ${block.text}`;
      continue;
    }

    // A quotation that stops mid-sentence at the foot of a page and carries on
    // as a paragraph on the next: the next page's lines sit at the margin, so
    // are not read as an inset. Only across a page, and only in lower case.
    if (
      options.quoteRunOn &&
      block.kind === "paragraph" &&
      block.finding === undefined &&
      previous?.kind === "quote" &&
      acrossPages &&
      !endsSentence(previous.text) &&
      /^[a-z,;]/.test(block.text)
    ) {
      previous.text = `${previous.text} ${block.text}`;
      continue;
    }

    if (
      block.kind === "paragraph" &&
      block.finding === undefined &&
      previous?.kind === "paragraph" &&
      !endsSentence(previous.text) &&
      // A lowercase opening is the usual sign of a continuation. After an
      // abbreviation the next word is often a name, so allow either.
      !(options.letteredItems && ITEM_LABEL.test(block.text)) &&
      (/^[a-z,;]/.test(block.text) ||
        ABBREVIATION.test(previous.text) ||
        INITIAL.test(previous.text))
    ) {
      previous.text = `${previous.text} ${block.text}`;
      continue;
    }

    // What text alone cannot see: a run-on opening on a capital, a digit or a
    // bracket, or one past a sentence that ends a full justified last line.
    // The layout decides (`layoutPageJoins`); never into a label or a finding.
    if (
      options.layoutJoins &&
      options.layout &&
      block.kind === "paragraph" &&
      block.finding === undefined &&
      previous?.kind === "paragraph" &&
      acrossPages &&
      block.at !== undefined &&
      opensPage(blocks, index) &&
      !(options.letteredItems && ITEM_LABEL.test(block.text)) &&
      layoutJoins(options.layout, previous.text, block.text, block.at, options.layoutJoins)
    ) {
      previous.text = `${previous.text} ${block.text}`;
      continue;
    }

    // The same, past a footnote's run-over: the foot of the page leaves the
    // paragraph, then (in a smaller face, with no number) the rest of a note
    // begun on the page before, then the new page. The run-over stays where it
    // is; the continuation joins the paragraph above it. Same rules, same
    // layout test, on the paragraph and the block (reportsthatmatter-j6qm).
    if (
      options.layoutJoins &&
      options.layout &&
      block.kind === "paragraph" &&
      block.finding === undefined &&
      block.at !== undefined &&
      previous?.kind === "paragraph" &&
      previous.at !== undefined &&
      previous.at.pdfIndex !== block.at.pdfIndex &&
      opensPage(blocks, index) &&
      !(options.letteredItems && ITEM_LABEL.test(block.text)) &&
      isOffFaceBlock(options.layout, previous.text, previous.at)
    ) {
      let target = (markerIndex === -1 ? merged.length : markerIndex) - 2;
      while (
        target >= 0 &&
        merged[target].kind === "paragraph" &&
        merged[target].at?.pdfIndex === previous.at.pdfIndex &&
        isOffFaceBlock(options.layout, (merged[target] as { text: string }).text, previous.at)
      ) {
        target -= 1;
      }
      const above = target >= 0 ? merged[target] : undefined;
      if (
        above?.kind === "paragraph" &&
        above.finding === undefined &&
        above.at?.pdfIndex === previous.at.pdfIndex &&
        layoutJoins(options.layout, above.text, block.text, block.at, options.layoutJoins)
      ) {
        above.text = `${above.text} ${block.text}`;
        continue;
      }
    }
    merged.push(block);
  }

  return merged;
}

export function blocksToMarkdown(
  blocks: Block[],
  options: { escapeNumberedParagraphs?: boolean; escapeLeadingHash?: boolean } = {}
): string {
  return blocks
    .map((block) => {
      // "3437. Projects…" is an ordered list to Markdown; a finding is a
      // paragraph that opens with its number (`numberedFindings`). A report
      // numbered at the margin instead has no finding sequence to match, but
      // `numberedParagraphs` has already decided the line opens a paragraph,
      // so any leading number there is the paragraph's own
      // (`escapeNumberedParagraphs`, reportsthatmatter-4qw).
      if (
        block.kind === "paragraph" &&
        (block.finding !== undefined ||
          (options.escapeNumberedParagraphs && /^\d{1,4}\.\s/.test(block.text)))
      ) {
        return block.text.replace(/^(\d+)\./, "$1\\.");
      }
      const markdown = blockToMarkdown(block);
      return options.escapeLeadingHash ? escapeHash(block, markdown) : markdown;
    })
    .join("\n\n");
}

/** "# x" opens a heading; "\# x" is the text. Headings themselves are left alone. */
function escapeHash(block: Block, markdown: string): string {
  if (block.kind === "paragraph") return markdown.replace(/^(#{1,6})(?=\s|$)/, "\\$1");
  if (block.kind === "quote") return markdown.replace(/^> (#{1,6})(?=\s|$)/, "> \\$1");
  if (block.kind === "list") return markdown.replace(/^((?:> )?- )(#{1,6})(?=\s|$)/gm, "$1\\$2");
  return markdown;
}

function blockToMarkdown(block: Block): string {
  if (block.kind === "heading") return `${"#".repeat(block.level)} ${block.text}`;
  if (block.kind === "quote") return `> ${block.text}`;
  // Em dash rather than a full stop: the inline-marker pass keys off
  // sentence punctuation, and a contents page number is not a footnote.
  if (block.kind === "contents") return `- ${block.text} — ${block.page}`;
  if (block.kind === "page") {
    return block.occurrence
      ? `%%page ${block.number}#${block.occurrence}%%`
      : `%%page ${block.number}%%`;
  }
  if (block.kind === "list") {
    const prefix = block.quoted ? "> - " : "- ";
    return block.items.map((item) => `${prefix}${item}`).join("\n");
  }
  return block.text;
}
