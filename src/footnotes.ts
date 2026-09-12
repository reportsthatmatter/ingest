import { normaliseWhitespace } from "./extract";

export type Footnote = {
  number: number;
  text: string;
  page: number;
  volume?: number;
  pdfIndex?: number;
  /** The printed page number the note sits on — what a correction's `where` scopes against. */
  printed?: number | null;
};

const NOTE_INLINE = /^\s{0,8}(\d{1,4})\s{0,3}(?=[A-Za-z"“(])/;
const NOTE_STACKED = /^\s{0,10}(\d{1,4})\s*$/;

/**
 * A note-start whose digit is followed by exactly one stray OCR character
 * before its real text — the "I" of "Ibid." landing as "%" or "!" ("0
 * %id.", from "6 Ibid." with the "6" itself misread; "216 !d.", from
 * "Id."). One character only, and it must not itself be a digit: anything
 * looser (an open run of junk, or tolerating a second digit) starts
 * matching ordinary citation continuations — "45. Ibid" (a page number
 * ending a wrapped citation) or "25 42 U.S.C. § 4332(c)." (a footnote
 * whose real text happens to start with a number) are far more common in
 * these documents than a genuinely garbled note-start, and either shape
 * tried unconditionally collapsed US v. Deepwater Horizon's recognised
 * footnote count from 775 to under 300 (reportsthatmatter-lie). Matching
 * this pattern is therefore only ever a *candidate* — see parseFootnotes
 * for the confirmation that decides whether to trust it.
 */
const GARBLED_INLINE = /^\s{0,8}(\d{1,4})\s{0,3}[^\sA-Za-z\d]\s{0,3}(?=[A-Za-z"“(])/;

type Token =
  | { kind: "inline"; number: number; text: string }
  | { kind: "stacked"; number: number }
  | { kind: "garbled"; text: string; raw: string }
  | { kind: "text"; raw: string };

function classify(line: string): Token {
  const inline = line.match(NOTE_INLINE);
  if (inline) {
    return {
      kind: "inline",
      number: Number.parseInt(inline[1], 10),
      text: normaliseWhitespace(line.slice(inline[0].length)),
    };
  }

  const stacked = line.match(NOTE_STACKED);
  if (stacked) {
    return { kind: "stacked", number: Number.parseInt(stacked[1], 10) };
  }

  const garbled = line.match(GARBLED_INLINE);
  if (garbled) {
    return { kind: "garbled", text: normaliseWhitespace(line.slice(garbled[0].length)), raw: line };
  }

  return { kind: "text", raw: line };
}

/**
 * Parses a page's footnote block into individual notes, in either layout —
 * number inline with its text, or number alone on its line with the text
 * beneath. Continuation lines fold into the note above them.
 *
 * A run of one or more GARBLED_INLINE candidates is only split out under
 * its own number when the next cleanly-read number confirms exactly how
 * many notes are missing — e.g. 5, one candidate, then a clean 7 proves
 * the candidate is 6. Without that confirmation (a second gap in the same
 * run, or the block simply ending) the count is ambiguous, so the run
 * folds upward exactly as it always has: a wrong guess would mislabel a
 * real note under someone else's number, which is worse than an honest
 * merge (reportsthatmatter-lie).
 */
export function parseFootnotes(lines: string[], page: number): Footnote[] {
  const tokens = lines.filter((line) => line.trim()).map(classify);
  const notes: Footnote[] = [];

  const append = (text: string) => {
    const last = notes[notes.length - 1];
    if (!last) return;
    last.text = normaliseWhitespace(`${last.text} ${text}`);
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.kind === "inline") {
      notes.push({ number: token.number, text: token.text, page });
      i += 1;
      continue;
    }

    if (token.kind === "stacked") {
      notes.push({ number: token.number, text: "", page });
      i += 1;
      continue;
    }

    if (token.kind === "text") {
      append(token.raw);
      i += 1;
      continue;
    }

    // A garbled candidate: collect the whole run of garbled/text tokens up
    // to the next clean boundary (or the end of the block) before deciding
    // whether it can be split at all.
    const runStart = i;
    let j = i;
    while (j < tokens.length && (tokens[j].kind === "garbled" || tokens[j].kind === "text")) {
      j += 1;
    }
    const boundary = tokens[j];
    const lastNumber = notes.length ? notes[notes.length - 1].number : undefined;
    const garbledCount = tokens.slice(runStart, j).filter((t) => t.kind === "garbled").length;

    const confirmed =
      boundary !== undefined &&
      lastNumber !== undefined &&
      (boundary.kind === "inline" || boundary.kind === "stacked") &&
      boundary.number === lastNumber + garbledCount + 1;

    let expected = (lastNumber ?? 0) + 1;
    for (let k = runStart; k < j; k++) {
      const t = tokens[k];
      if (t.kind === "garbled" && confirmed) {
        notes.push({ number: expected, text: t.text, page });
        expected += 1;
      } else if (t.kind === "garbled") {
        append(t.raw);
      } else if (t.kind === "text") {
        append(t.raw);
      }
    }
    i = j;
  }

  // A stacked note whose text never arrived carries nothing worth keeping.
  return notes.filter((note) => note.text);
}

/**
 * Rewrites the bare superscript numbers left inline by OCR into markdown
 * footnote references.
 *
 * Only numbers that match a note we actually collected are converted, and only
 * where they sit after sentence-like text — otherwise ordinary figures in the
 * prose ("about 12,000 voters") would be mangled into references.
 */
/**
 * Reference-like abbreviations that are followed by a number which is *not* a
 * footnote marker: "ECF No. 252", "at 79", "n. 452", "§ 371". Linking these
 * corrupts the citation into a reference to an unrelated note.
 */
const CITES_A_NUMBER =
  /(\b(?:nos?|nn?|pp?|art|ch|sec|para|vol|ex|fig|tbl|id|at|see)\.?|§)\s*$/i;

/**
 * A month name *immediately* after the candidate — allowing only more
 * punctuation and one more "and DD" — is a day in a date list, not a
 * footnote: "made on 11,[^13] and 19 March 2003" (reportsthatmatter-axw).
 * Reports with thousands of footnotes make this common: virtually every
 * day-of-month number (1-31) is *some* footnote's number somewhere in a
 * document that size, so the "is N known" check alone barely filters
 * day-of-month candidates at all.
 *
 * Deliberately tight: the month has to follow with nothing but whitespace,
 * commas, and at most one more bare number in between. Loosening this to "a
 * month anywhere in the next N characters" breaks a real footnote that
 * happens to sit before a sentence mentioning a date — "told him the same.
 * 10 On November 13," is footnote 10, not a date, and "On November" would
 * satisfy a looser check.
 */
const MONTH_SOON_AFTER =
  /^[\s,]{0,4}(?:and\s+\d{1,2}[\s,]{0,4})?(January|February|March|April|May|June|July|August|September|October|November|December)\b/i;

/**
 * A phone-number-shaped run right after the candidate ("7219 3890") is the
 * rest of a phone number, not a footnote — a repeated "Telephone orders: 20
 * 7219 3890" block in Leveson's back matter, apparently a UK "020" area code
 * with its leading zero already lost before this pass ever sees it
 * (reportsthatmatter-axw). Specific on purpose — two groups of exactly four
 * digits — so it does not also swallow a genuine footnote that happens to
 * precede an ordinary number (a page count, a year).
 */
const PHONE_NUMBER_SOON_AFTER = /^\s+\d{4}\s+\d{4}\b/;

export function linkInlineMarkers(text: string, known: Set<number>): string {
  return text.replace(
    /([.,;:!?"'\)])\s+(\d{1,4})(?=\s|$)/g,
    (whole, punctuation: string, digits: string, offset: number) => {
      const value = Number.parseInt(digits, 10);
      if (!known.has(value)) return whole;

      // Look at what sits immediately before the punctuation.
      const preceding = text.slice(Math.max(0, offset - 12), offset + 1);
      if (CITES_A_NUMBER.test(preceding)) return whole;

      // Look at what follows the candidate.
      const followingStart = offset + whole.length;
      const following = text.slice(followingStart, followingStart + 28);
      if (MONTH_SOON_AFTER.test(following)) return whole;
      if (PHONE_NUMBER_SOON_AFTER.test(following)) return whole;

      return `${punctuation}[^${value}]`;
    }
  );
}

/**
 * One definition per genuinely distinct note.
 *
 * A number can repeat for two different reasons, and they need opposite
 * handling. **Adjacent** entries sharing a number are the same note: either
 * an exact repeat (the note was collected twice, nothing new) or a tail that
 * ran over a page break and got re-parsed as a fresh note — concatenated
 * back onto the entry above it rather than dropped. **Non-adjacent** entries
 * sharing a number are different notes: a report whose numbering restarts
 * (Leveson: per chapter) reuses "20" for something else once the previous
 * chapter's own "20" is many notes behind it in this array — collapsing
 * those together, as a single global `Map` keyed by number used to, meant a
 * chapter's footnote reference could resolve to a different chapter's text
 * (reportsthatmatter-ooj). Those keep separate definitions under the same
 * `[^N]` label; `markdown.ts`'s `withSidenotes` resolves each reference
 * against them positionally, in the order both were written — sound because
 * both the references in the body and the definitions collected here follow
 * the same page-by-page reading order, and a note is normally cited once.
 */
export function renderEndnotes(notes: Footnote[]): string {
  if (!notes.length) return "";

  const merged: Footnote[] = [];
  for (const note of notes) {
    const previous = merged[merged.length - 1];
    if (previous && previous.number === note.number) {
      if (previous.text !== note.text) previous.text = `${previous.text} ${note.text}`;
      continue;
    }
    merged.push({ ...note });
  }

  return merged.map((note) => `[^${note.number}]: ${note.text}`).join("\n\n");
}

/**
 * Footnote markers that sit flush against the word before them.
 *
 * OCR frequently drops the space before a superscript, leaving "diarrhoea112"
 * or "childhood.1" — a bare number in the prose where a reference should be.
 * The Litvinenko report carries roughly 230 of them.
 *
 * A first attempt keyed on punctuation and case, and corrupted a real
 * citation: "Section V.D.2" became a marker. That reversion is the constraint
 * on any retry — a rule that damages genuine text is worse than a bare
 * number, because a bare number is visibly a gap while corrupted text reads
 * as the document.
 *
 * So this is a lookup rather than a typographic guess. A candidate is only a
 * marker if a note with that number was actually collected **near this page**.
 * Page locality is what makes it safe: these documents number notes
 * sequentially, so a three-digit number fused to a word on page 40 is a
 * marker only if the notes around page 40 include it. A measurement or a
 * model number will not be.
 */
export function linkFlushMarkers(text: string, plausible: Set<number>): string {
  if (!plausible.size) return text;

  return text.replace(
    /([a-zà-ÿ]{3,}[.,;:!?]?)(\d{1,3})(?=[\s,.;:)\]]|$)/g,
    (whole, head: string, digits: string) => {
      const value = Number.parseInt(digits, 10);
      if (!plausible.has(value)) return whole;
      return `${head}[^${value}]`;
    }
  );
}
