import { normaliseWhitespace } from "./extract.js";
/**
 * A note-start's text may follow the digit either directly (the common
 * case, requiring only whitespace between) or past exactly one stray OCR
 * character ("0 %id.", from "6 Ibid." with the "6" misread and the "I" of
 * "Ibid." landing as "%"; "216 !d." with "Id."'s "I" landing as "!") — or
 * may itself simply start with a number, which is legitimate and common
 * ("42 U.S.C. § 4332(c)."). These need separate, narrower branches, not one
 * shared permissive lookahead:
 *
 * - Allowing the junk hop *and* a digit lookahead together matches ordinary
 *   dates ("4/2010 Evaluation of...") as a bogus note, since the "/" would
 *   count as the stray character and "2010" as the following text.
 * - Allowing a digit lookahead with *no* required space lets a number split
 *   against itself: "109" alone backtracks to digit "10" plus a zero-width
 *   lookahead at its own trailing "9", misreading a stacked note's whole
 *   number as "10" with body text "9". A real digit-led citation is always
 *   separated from its note number by an actual space, so that branch
 *   requires one.
 */
const NOTE_INLINE = /^\s{0,8}(\d{1,4})(?:\s{0,3}[^\sA-Za-z\d]\s{0,3}(?=[A-Za-z"“(])|\s{0,3}(?=[A-Za-z"“(])|\s{1,3}(?=[0-9]))/;
const NOTE_STACKED = /^\s{0,10}(\d{1,4})\s*$/;
/**
 * Parses a page's footnote block into individual notes, in either layout —
 * number inline with its text, or number alone on its line with the text
 * beneath. Continuation lines fold into the note above them.
 *
 * A note whose leading digit(s) OCR outright misread (not just surrounded
 * by noise, but wrong: "6" read as "0") still parses as its own note under
 * the wrong number — NOTE_INLINE has no way to know the digit is wrong. A
 * repair pass afterwards catches the case where a number breaks the
 * sequence but the note *two* past it confirms exactly one is missing (5,
 * misread-as-0, 7 — 7 proves the middle one is 6) and relabels just that
 * one note. Without that confirmation — a bigger gap, or the run ending —
 * the count stays ambiguous and the number is left as read: a wrong guess
 * would mislabel a real note under someone else's number, worse than a
 * visibly-off one (reportsthatmatter-lie).
 */
export function parseFootnotes(lines, page) {
    const notes = [];
    const append = (text) => {
        const last = notes[notes.length - 1];
        if (!last)
            return;
        last.text = normaliseWhitespace(`${last.text} ${text}`);
    };
    for (const line of lines) {
        if (!line.trim())
            continue;
        const inline = line.match(NOTE_INLINE);
        if (inline) {
            notes.push({
                number: Number.parseInt(inline[1], 10),
                text: normaliseWhitespace(line.slice(inline[0].length)),
                page,
            });
            continue;
        }
        const stacked = line.match(NOTE_STACKED);
        if (stacked) {
            notes.push({ number: Number.parseInt(stacked[1], 10), text: "", page });
            continue;
        }
        append(line);
    }
    for (let i = 1; i < notes.length - 1; i++) {
        const prev = notes[i - 1].number;
        const next = notes[i + 1].number;
        if (notes[i].number !== prev + 1 && next === prev + 2) {
            notes[i] = { ...notes[i], number: prev + 1 };
        }
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
const CITES_A_NUMBER = /(\b(?:nos?|nn?|pp?|art|ch|sec|para|vol|ex|fig|tbl|id|at|see)\.?|§)\s*$/i;
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
const MONTH_SOON_AFTER = /^[\s,]{0,4}(?:and\s+\d{1,2}[\s,]{0,4})?(January|February|March|April|May|June|July|August|September|October|November|December)\b/i;
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
export function linkInlineMarkers(text, known) {
    return text.replace(/([.,;:!?"'\)])\s+(\d{1,4})(?=\s|$)/g, (whole, punctuation, digits, offset) => {
        const value = Number.parseInt(digits, 10);
        if (!known.has(value))
            return whole;
        // Look at what sits immediately before the punctuation.
        const preceding = text.slice(Math.max(0, offset - 12), offset + 1);
        if (CITES_A_NUMBER.test(preceding))
            return whole;
        // Look at what follows the candidate.
        const followingStart = offset + whole.length;
        const following = text.slice(followingStart, followingStart + 28);
        if (MONTH_SOON_AFTER.test(following))
            return whole;
        if (PHONE_NUMBER_SOON_AFTER.test(following))
            return whole;
        return `${punctuation}[^${value}]`;
    });
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
export function renderEndnotes(notes) {
    if (!notes.length)
        return "";
    const merged = [];
    for (const note of notes) {
        const previous = merged[merged.length - 1];
        if (previous && previous.number === note.number) {
            if (previous.text !== note.text)
                previous.text = `${previous.text} ${note.text}`;
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
export function linkFlushMarkers(text, plausible) {
    if (!plausible.size)
        return text;
    return text.replace(/([a-zà-ÿ]{3,}[.,;:!?]?)(\d{1,3})(?=[\s,.;:)\]]|$)/g, (whole, head, digits) => {
        const value = Number.parseInt(digits, 10);
        if (!plausible.has(value))
            return whole;
        return `${head}[^${value}]`;
    });
}
