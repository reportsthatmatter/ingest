import { normaliseWhitespace } from "./extract.js";
const NOTE_INLINE = /^\s{0,8}(\d{1,4})\s{0,3}(?=[A-Za-z"“(])/;
const NOTE_STACKED = /^\s{0,10}(\d{1,4})\s*$/;
/**
 * Parses a page's footnote block into individual notes, in either layout —
 * number inline with its text, or number alone on its line with the text
 * beneath. Continuation lines fold into the note above them.
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
export function linkInlineMarkers(text, known) {
    return text.replace(/([.,;:!?"'\)])\s+(\d{1,4})(?=\s|$)/g, (whole, punctuation, digits, offset) => {
        const value = Number.parseInt(digits, 10);
        if (!known.has(value))
            return whole;
        // Look at what sits immediately before the punctuation.
        const preceding = text.slice(Math.max(0, offset - 12), offset + 1);
        if (CITES_A_NUMBER.test(preceding))
            return whole;
        return `${punctuation}[^${value}]`;
    });
}
/**
 * One definition per note number.
 *
 * A number can arrive twice — most often because the note runs over a page
 * break and its tail is parsed as a fresh note. Dropping the second copy loses
 * that tail, so distinct text is appended instead; only exact repeats are
 * discarded.
 */
export function renderEndnotes(notes) {
    if (!notes.length)
        return "";
    const byNumber = new Map();
    for (const note of notes) {
        const parts = byNumber.get(note.number) ?? [];
        if (!parts.includes(note.text))
            parts.push(note.text);
        byNumber.set(note.number, parts);
    }
    return [...byNumber.entries()]
        .map(([number, parts]) => `[^${number}]: ${parts.join(" ")}`)
        .join("\n\n");
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
