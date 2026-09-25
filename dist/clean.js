import { normaliseWhitespace } from "./extract.js";
const PAGE_EDGE_DEPTH = 3;
const MIN_REPEATED_FURNITURE = 3;
const PAGE_NUMBER = /^\s*(\d{1,4}|[ivxlcdm]{1,8})\s*$/i;
/**
 * Two layouts, both common.
 *
 * Inline — the number sits hard against its text:
 *   `110   See 3/1/2007 Washington Mutual Inc. 10-K filing.`
 *
 * Stacked — the number is alone on its line and the text follows beneath:
 *   `110`
 *   `    See 3/1/2007 Washington Mutual Inc. 10-K filing.`
 *
 * The Jack Smith report uses the first, the PSI financial crisis report the
 * second, and supporting only one finds seven notes in a document with
 * thousands.
 */
export const FOOTNOTE_INLINE = /^\s{0,8}(\d{1,4})\s{0,3}(?=[A-Za-z"“(])/;
const FOOTNOTE_STACKED = /^\s{0,10}(\d{1,4})\s*$/;
/** Candidate note openings on a page, in either layout. */
export function noteCandidates(lines) {
    const candidates = [];
    for (let i = 0; i < lines.length; i++) {
        const inline = lines[i].match(FOOTNOTE_INLINE);
        if (inline) {
            candidates.push({ line: i, note: Number.parseInt(inline[1], 10) });
            continue;
        }
        const stacked = lines[i].match(FOOTNOTE_STACKED);
        if (!stacked)
            continue;
        // A lone number is only a note opening if prose follows it. Note text
        // frequently opens with a date or a docket number ("4/2010 Evaluation of
        // …"), so require words rather than a leading letter.
        const next = lines.slice(i + 1).find((line) => line.trim());
        if (next && /[A-Za-z]{2}/.test(next) && !FOOTNOTE_STACKED.test(next)) {
            candidates.push({ line: i, note: Number.parseInt(stacked[1], 10) });
        }
    }
    return candidates;
}
/**
 * Separates the three things a scanned report page contains: the running body,
 * the footnote block at the foot of the page, and the printed page number.
 *
 * Footnotes are found by walking up from the bottom: the block is the trailing
 * run of lines that starts with an ascending footnote number. Walking upward
 * matters because footnote numbers also appear inline in the body.
 */
/**
 * Takes the printed page number off a page, if it carries one.
 *
 * It sits alone on a line, at the foot or the head — the Jack Smith report
 * uses a footer, the PSI report a header, and looking in only one place loses
 * page anchors for half the archive.
 */
export function takePrintedNumber(input) {
    const lines = [...input];
    let printed = null;
    const takeNumber = (index) => {
        const value = Number.parseInt(lines[index].trim(), 10);
        if (Number.isNaN(value))
            return;
        printed = value;
        lines.splice(index, 1);
    };
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
        if (!lines[i].trim())
            continue;
        if (PAGE_NUMBER.test(lines[i]))
            takeNumber(i);
        break;
    }
    if (printed === null) {
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            if (!lines[i].trim())
                continue;
            if (PAGE_NUMBER.test(lines[i]))
                takeNumber(i);
            break;
        }
    }
    return { printed, lines };
}
/**
 * Separates the footnote block at the foot of a page from the running body.
 *
 * The notes sit as a consecutively numbered run. Anchor on that run rather
 * than on the first number seen — wrapped case citations ("575 F.3d 726,
 * 735 …") look identical to a note opening, and only the numbering tells them
 * apart. Walking upward matters because footnote numbers also appear inline.
 */
export function splitFootnoteBlock(lines, expectedNote) {
    const candidates = noteCandidates(lines);
    if (!candidates.length)
        return { body: lines, footnotes: [], runOver: [] };
    const start = chooseBlockStart(candidates, expectedNote, lines.length);
    if (start === null)
        return { body: lines, footnotes: [], runOver: [] };
    const at = start.line;
    if (isDisplacedFirstLine(lines, at)) {
        // The note's number, then the line that belongs straight after it.
        return {
            body: lines.slice(0, at - 1),
            footnotes: [lines[at], lines[at - 1], ...lines.slice(at + 1)],
            runOver: [],
        };
    }
    const from = runOverStart(lines, at);
    return { body: lines.slice(0, from), footnotes: lines.slice(at), runOver: lines.slice(from, at) };
}
const indentOf = (line) => line.length - line.trimStart().length;
/**
 * A note's first line of text set *above* its own number.
 *
 * The number is superscript, so it sits a fraction lower than the words
 * beside it, and `pdftotext -layout` sometimes files it (with a word or two)
 * on the line below the rest of that line:
 *
 *   `     ECF No. 252 at 48-49 & nn.250-253; SCO-00310619 (…); SCO-00310626`
 *   `40 See`
 *
 * Left alone, the upper line is the last line of the body and the note loses
 * its opening (Jack Smith, PDF pp.20, 33, 47, 65: reportsthatmatter-g1f).
 *
 * The shape is exact enough to trust: the note's own line is short (a lone
 * number, or a number and a word), the displaced line sits directly on it,
 * and the displaced line is indented by about the width of what was lifted
 * out of it. A body line directly above a note starts at the same margin as
 * the note, so it fails the indent test.
 */
function isDisplacedFirstLine(lines, at) {
    if (at < 1)
        return false;
    const opening = lines[at];
    const above = lines[at - 1];
    if (!above.trim())
        return false;
    const head = opening.trim();
    if (head.length > DISPLACED_OPENING_MAX)
        return false;
    const inset = indentOf(above) - indentOf(opening);
    if (inset < 1 || inset > head.length + 1)
        return false;
    // What the note's text continues with, below its number, sits back at the
    // note margin. Text indented beneath a lone number is the ordinary stacked
    // layout (PSI, Litvinenko), whose line above is the previous note's.
    const below = lines.slice(at + 1).find((line) => line.trim());
    return below === undefined || indentOf(below) <= indentOf(opening);
}
/** "40 See", "104": longer than this and the note's line carried its own text. */
const DISPLACED_OPENING_MAX = 8;
/**
 * Where a footnote block really starts, when it opens with the tail of the
 * previous page's last note.
 *
 * A note that runs over a page break continues at the top of the next
 * page's block, *above* the first note that starts there, and carries no
 * number of its own. Anchoring the block on that first number left the
 * run-over in the body, where it read as a paragraph of raw citations and
 * split the sentence it landed inside (Jack Smith, reportsthatmatter-g1f).
 *
 * The run-over is the unbroken run of lines sitting directly on the first
 * note, with the gap between body and notes (two or more blank lines) above
 * it, or two lines or more of it, on a page whose body is double-spaced. Its lines following one another
 * with no blank between is what tells it apart from that body, whose lines
 * are each followed by one. A single-spaced page has no such contrast, so it
 * is left exactly as it was.
 */
function runOverStart(lines, at) {
    let top = at;
    while (top > 0 && lines[top - 1].trim())
        top -= 1;
    if (top === at)
        return at;
    let gap = 0;
    while (top - gap - 1 >= 0 && !lines[top - gap - 1].trim())
        gap += 1;
    // Nothing above the run at all: the whole page is the block's, and there
    // is no body line to tell the run from.
    if (top - gap === 0)
        return at;
    // One line under a single blank is spaced exactly like a line of the body
    // above it; a wider gap, or a second line with no blank before it, is not.
    if (gap < RUN_OVER_MIN_GAP && at - top < 2)
        return at;
    // Only a double-spaced body makes an unbroken run stand out. On a
    // single-spaced page the body's own last paragraph is exactly such a run
    // (Litvinenko sets its paragraphs straight onto their notes), and taking it
    // would move prose, headings and all, into a footnote.
    return isDoubleSpaced(lines.slice(0, top - gap)) ? top : at;
}
const RUN_OVER_MIN_GAP = 2;
/** Most of the text lines are followed by a blank: the page is set double-spaced. */
function isDoubleSpaced(lines) {
    const text = lines.filter((line) => line.trim()).length;
    if (text < DOUBLE_SPACED_MIN_LINES)
        return false;
    let followed = 0;
    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim() && !lines[i + 1].trim())
            followed += 1;
    }
    return followed / text >= 0.6;
}
/**
 * Fewer text lines than this and a page's spacing cannot be told. Three is
 * enough when every one of them is followed by a blank (Jack Smith PDF p.14);
 * a lone running header above the gap, as on Litvinenko's pages, is not.
 */
const DOUBLE_SPACED_MIN_LINES = 3;
/** Where a page came from, carried through so a review note can cite it. */
function provenance(page) {
    return { index: page.index, volume: page.volume, pdfIndex: page.pdfIndex };
}
/**
 * The two page-local passes composed: take the printed number, then separate
 * the footnote block from the body. Kept as one entry point because that is
 * the order they must run in — the page number would otherwise look like a
 * stacked note opening.
 */
export function splitPage(page, expectedNote) {
    const { printed, lines } = takePrintedNumber(page.lines);
    const { body, footnotes, runOver } = splitFootnoteBlock(lines, expectedNote);
    return { ...provenance(page), printed, body, footnotes, ...(runOver.length ? { runOver } : {}) };
}
/**
 * Removes running headers and footers that recur at a page edge. PDF text
 * extraction cannot distinguish these from the report body, but their repeated
 * position can: a real line of prose should not appear at the top or bottom of
 * three distinct pages.
 */
/**
 * What makes two edge lines "the same" furniture.
 *
 * A running footer usually carries the page number — "30  Report Volume I
 * August 2003" — so comparing the literal text finds every one of them
 * unique and strips none. Blanking the digits is what lets the repetition
 * show: furniture that carries a page number is still furniture.
 */
function furnitureKey(text) {
    return normaliseWhitespace(text).replace(/\d+/g, "#");
}
/**
 * The printed page number a composite footer carries.
 *
 * "30  Report Volume I  August 2003" holds two numbers, and the year is not
 * the page. The sequential index is the tie-breaker: a printed page number
 * tracks it closely, a year does not.
 */
function numberIn(text, near) {
    const numbers = (normaliseWhitespace(text).match(/\b\d{1,4}\b/g) ?? [])
        .map((n) => Number.parseInt(n, 10))
        .filter((n) => !Number.isNaN(n));
    if (!numbers.length)
        return null;
    let best = numbers[0];
    for (const value of numbers) {
        if (Math.abs(value - near) < Math.abs(best - near))
            best = value;
    }
    // A number nowhere near the page's own position is not its page number.
    return Math.abs(best - near) <= 50 ? best : null;
}
export function stripRepeatedPageFurniture(pages) {
    const counts = new Map();
    const edgeIndices = pages.map((page) => pageEdgeIndices(page.body));
    for (const [pageIndex, page] of pages.entries()) {
        const seen = new Set();
        for (const lineIndex of edgeIndices[pageIndex]) {
            const key = furnitureKey(page.body[lineIndex]);
            if (key)
                seen.add(key);
        }
        for (const key of seen)
            counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const isFurniture = (line) => {
        const key = furnitureKey(line);
        return Boolean(key) && (counts.get(key) ?? 0) >= MIN_REPEATED_FURNITURE;
    };
    return pages.map((page, pageIndex) => {
        // A page whose number sits inside its running footer has none of its own.
        // Recovering it here is what keeps the page anchors — the citation unit
        // readers actually use — for a document laid out that way.
        let printed = page.printed;
        if (printed === null) {
            for (const lineIndex of edgeIndices[pageIndex]) {
                const line = page.body[lineIndex];
                if (!isFurniture(line))
                    continue;
                const value = numberIn(line, page.index);
                if (value !== null) {
                    printed = value;
                    break;
                }
            }
        }
        return {
            ...page,
            printed,
            body: page.body.filter((line, lineIndex) => {
                if (!edgeIndices[pageIndex].has(lineIndex))
                    return true;
                return !normaliseWhitespace(line) || !isFurniture(line);
            }),
        };
    });
}
function pageEdgeIndices(lines) {
    const indices = new Set();
    let found = 0;
    for (let i = 0; i < lines.length && found < PAGE_EDGE_DEPTH; i++) {
        if (!lines[i].trim())
            continue;
        indices.add(i);
        found += 1;
    }
    found = 0;
    for (let i = lines.length - 1; i >= 0 && found < PAGE_EDGE_DEPTH; i--) {
        if (!lines[i].trim())
            continue;
        indices.add(i);
        found += 1;
    }
    return indices;
}
/**
 * Picks where the footnote block starts.
 *
 * The running note number is the strongest signal available: notes are
 * sequential across the whole document, so the block almost always opens on the
 * number we are expecting. Anchoring on that survives the stray candidates that
 * litter these pages — a citation wrapping onto a line that begins "20 U.S.C.",
 * an exhibit number, a figure. Searching backwards from the last candidate
 * instead, as this used to, let a single stray at the foot of the page reject
 * the entire block: one page offered notes 140-147 and was thrown out because a
 * spurious "20" followed them.
 */
function chooseBlockStart(candidates, expectedNote, lineCount) {
    /** Corroboration: the next note follows it, or it sits low on the page. */
    const plausible = (candidate) => candidates.some((other) => other.note === candidate.note + 1) ||
        candidate.line > lineCount * 0.55;
    const exact = candidates.find((candidate) => candidate.note === expectedNote);
    if (exact && plausible(exact))
        return exact;
    // Notes we failed to collect leave the counter behind; accept a small jump.
    const ahead = candidates
        .filter((c) => c.note > expectedNote && c.note <= expectedNote + 6)
        .sort((a, b) => a.note - b.note)[0];
    if (ahead && plausible(ahead))
        return ahead;
    // Appendices restart their numbering. Fall back to the longest consecutive
    // run, but only a substantial one sitting at the foot of the page.
    const best = longestRun(candidates);
    if (best.length >= 3 && best[0].line > lineCount * 0.4)
        return best[0];
    return null;
}
function longestRun(candidates) {
    let best = [];
    let current = [];
    for (const candidate of candidates) {
        const previous = current[current.length - 1];
        if (previous && candidate.note === previous.note + 1)
            current.push(candidate);
        else
            current = [candidate];
        if (current.length > best.length)
            best = [...current];
    }
    return best;
}
/**
 * pdftotext preserves the original double-spacing on many pages, which would
 * otherwise read as a paragraph break on every single line.
 */
export function collapseDoubleSpacing(lines) {
    const nonEmpty = lines.filter((l) => l.trim()).length;
    if (nonEmpty < 4)
        return lines;
    let alternating = 0;
    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim() && !lines[i + 1].trim())
            alternating += 1;
    }
    // Double-spaced if most content lines are followed by a blank.
    if (alternating / nonEmpty < 0.6)
        return lines;
    // On a double-spaced page a single blank line is just the line spacing, but a
    // wider gap is a real break — a paragraph, or a heading standing on its own.
    // Dropping every blank loses that structure entirely.
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim()) {
            out.push(lines[i]);
            continue;
        }
        let gap = 0;
        while (i + gap < lines.length && !lines[i + gap].trim())
            gap += 1;
        if (gap > 1)
            out.push("");
        i += gap - 1;
    }
    return out;
}
