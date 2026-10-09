import { normaliseWhitespace } from "./extract.js";
const PAGE_EDGE_DEPTH = 3;
const MIN_REPEATED_FURNITURE = 3;
const PAGE_NUMBER = /^\s*(\d{1,4}|[ivxlcdm]{1,8})\s*$/i;
/** A folio set in parentheses, "(3)" (`parenFolios`). */
const PAREN_NUMBER = /^\s*\(\s*(\d{1,4})\s*\)\s*$/;
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
/**
 * `footnoteNumbers("period")`: a page-foot note numbered "104. Letter from…"
 * (Hillsborough), the number followed by a full stop, flush at the page's
 * edge. Its own style, never tried on a report that has not declared it: a
 * numbered list has the same shape, and only its inset tells it apart
 * (Hillsborough's summary findings, "    16. This mindset, …", four columns in,
 * were read as notes 16-21 of their page until the number had to be flush).
 */
const FOOTNOTE_INLINE_PERIOD = /^\s{0,1}(\d{1,4})\.\s{1,6}(?=[A-Za-z"“‘'(])/;
/**
 * `footnoteNumbers("tabbed")`: a page-foot note whose number is flush at the page's edge and whose text
 * starts at a tab stop, so `pdftotext -layout` sets one to eight spaces between them ("9     Most of…",
 * "335   Transcript…"), and whose text may open on a bracketed document reference ("[INQ00002032].").
 * The Post Office Horizon IT Inquiry sets its notes this way: the bare style allows three spaces at most
 * and no bracket, so only its three-digit notes that opened on a letter were read.
 */
const FOOTNOTE_INLINE_TABBED = /^\s{0,1}(\d{1,4})\s{1,8}(?=[A-Za-z"“‘'(\[])/;
/** Candidate note openings on a page, in either layout. */
export function noteCandidates(lines, numbers = "bare") {
    const candidates = [];
    for (let i = 0; i < lines.length; i++) {
        const inline = lines[i].match(numbers === "period" ? FOOTNOTE_INLINE_PERIOD : numbers === "tabbed" ? FOOTNOTE_INLINE_TABBED : FOOTNOTE_INLINE);
        if (inline) {
            candidates.push({ line: i, note: Number.parseInt(inline[1], 10) });
            continue;
        }
        if (numbers === "period")
            continue;
        const stacked = lines[i].match(FOOTNOTE_STACKED);
        if (!stacked)
            continue;
        // A lone number is only a note opening if prose follows it. Note text
        // frequently opens with a date or a docket number ("4/2010 Evaluation of
        // …"), so require words rather than a leading letter — or a witness's
        // cipher and a transcript reference, Litvinenko's commonest note ("A1
        // 2/114", "C2 24/14-39"), which has no word in it (reportsthatmatter-n7fb).
        const next = lines.slice(i + 1).find((line) => line.trim());
        if (next && (/[A-Za-z]{2}/.test(next) || /^\s*[A-Z]\d{1,2}\s+\d{1,3}\/\d/.test(next)) && !FOOTNOTE_STACKED.test(next)) {
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
export function takePrintedNumber(input, options = {}) {
    const lines = [...input];
    let printed = null;
    const takeNumber = (index) => {
        const value = Number.parseInt(lines[index].trim().replace(/^\(\s*|\s*\)$/g, ""), 10);
        if (Number.isNaN(value))
            return;
        printed = value;
        lines.splice(index, 1);
    };
    // A thumb-index tab sets a capital letter at the foot of the page edge, on the folio's line or the line below
    // it (Leveson, Part L: "1803" then "L", or "L        1804"); the folio is read past it, and the tab goes
    // with it (reportsthatmatter-d662).
    const withTab = (line) => {
        const m = /^\s*(?:[A-Z]\s{2,}(\d{1,4})|(\d{1,4})\s{2,}[A-Z])\s*$/.exec(line);
        return m ? Number.parseInt(m[1] ?? m[2], 10) : null;
    };
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
        if (!lines[i].trim())
            continue;
        const tabbed = withTab(lines[i]);
        if (tabbed !== null) {
            printed = tabbed;
            lines.splice(i, 1);
        }
        else if (/^\s*[A-Z]\s*$/.test(lines[i])) {
            // a lone tab letter: the folio is the nearest line above it, if that is a number
            let j = i - 1;
            while (j >= 0 && !lines[j].trim())
                j--;
            if (j >= 0 && /^\s*\d{1,4}\s*$/.test(lines[j])) {
                takeNumber(j);
                lines.splice(i - 1, 1);
            }
            else if (PAGE_NUMBER.test(lines[i]))
                takeNumber(i);
        }
        else if (PAGE_NUMBER.test(lines[i]) || (options.paren && PAREN_NUMBER.test(lines[i])))
            takeNumber(i);
        break;
    }
    if (options.head?.foot)
        takeLetterFoot(lines, options.head.foot);
    if (printed === null && options.head)
        printed = takePageHead(lines, options.head);
    if (printed === null) {
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            if (!lines[i].trim())
                continue;
            if (PAGE_NUMBER.test(lines[i]) || (options.paren && PAREN_NUMBER.test(lines[i])))
                takeNumber(i);
            break;
        }
    }
    if (printed === null && options.roman) {
        const roman = takeRomanFolio(lines);
        if (roman)
            return { printed, roman, lines };
    }
    return { printed, lines };
}
const FOOT_RULE = /^\s*[I|\\l]\s*$/;
function takeLetterFoot(lines, foot) {
    const end = lines.length;
    let cut = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].trim() || FOOT_RULE.test(lines[i]))
            continue;
        if (!foot.test(lines[i]))
            break;
        cut = i;
    }
    if (cut < end)
        lines.splice(cut, end - cut);
}
const PAGE_HEAD = /^\s*Page\s+(\d{1,4})\s*$/;
function takePageHead(lines, head) {
    const at = [];
    for (let i = 0; i < lines.length && at.length < 2; i++)
        if (lines[i].trim())
            at.push(i);
    const pageLine = at.find((i, k) => k < 2 && PAGE_HEAD.test(lines[i]));
    if (pageLine === undefined)
        return null;
    const k = at.indexOf(pageLine);
    if (k === 1 && !(head.above && head.above.test(lines[at[0]])))
        return null;
    const value = Number.parseInt(PAGE_HEAD.exec(lines[pageLine])[1], 10);
    lines.splice(pageLine, 1);
    if (k === 1)
        lines.splice(at[0], 1);
    return value;
}
/**
 * A lowercase roman folio alone on a line at the head or foot, possibly set
 * twice or three times on the line ("vii   vii"). Removes it from `lines`.
 */
const ROMAN_FOLIO = /^\s*([ivxlc]{1,6})(?:\s+\1)*\s*$/;
const ROMAN_NUMERAL = /^(?:xl|l)?x{0,3}(?:ix|iv|v?i{0,3})$/;
function takeRomanFolio(lines) {
    const tryAt = (index) => {
        const match = lines[index].match(ROMAN_FOLIO);
        if (!match || !ROMAN_NUMERAL.test(match[1]))
            return undefined;
        lines.splice(index, 1);
        return match[1];
    };
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
        if (!lines[i].trim())
            continue;
        const found = tryAt(i);
        if (found)
            return found;
        break;
    }
    for (let i = 0; i < Math.min(3, lines.length); i++) {
        if (!lines[i].trim())
            continue;
        return tryAt(i);
    }
    return undefined;
}
/**
 * Separates the footnote block at the foot of a page from the running body.
 *
 * The notes sit as a consecutively numbered run. Anchor on that run rather
 * than on the first number seen — wrapped case citations ("575 F.3d 726,
 * 735 …") look identical to a note opening, and only the numbering tells them
 * apart. Walking upward matters because footnote numbers also appear inline.
 */
export function splitFootnoteBlock(lines, expectedNote, options = {}) {
    const candidates = noteCandidates(lines, options.footnoteNumbers);
    if (options.sequencedNoteOpenings) {
        // `sequencedNoteOpenings`: the expected note (and the run after it) opening on a digit, a bracket or a wide gap
        const opening = options.footnoteNumbers === "period" ? /^\s{0,8}(\d{1,4})\.\s+\S/ : /^\s{0,8}(\d{1,4})\s+\S/;
        let want = expectedNote;
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(opening);
            if (!m || Number(m[1]) !== want || candidates.some((c) => c.line === i)) {
                if (candidates.some((c) => c.line === i && c.note === want))
                    want += 1;
                continue;
            }
            candidates.push({ line: i, note: want });
            want += 1;
        }
        candidates.sort((a, b) => a.line - b.line);
    }
    if (!candidates.length)
        return { body: lines, footnotes: [], runOver: [] };
    const start = chooseBlockStart(candidates, expectedNote, lines) ??
        (options.footnoteGap ? gappedNoteStart(lines, candidates, expectedNote) : null) ??
        // a chapter's numbering restarting on a page with only its note 1 (period-numbered notes are flush, so
        // a lone "1. Letter from…" low on the page has no other reading)
        (options.footnoteNumbers === "period"
            ? candidates.find((c) => c.note === 1 && c.line > lines.length * 0.55) ?? null
            : null) ??
        // `footnoteRestarts`: the numbering starting over at 1, low on the page or followed by its 2
        (options.footnoteRestarts && expectedNote > 1
            ? candidates.find((c) => c.note === 1 && (c.line > lines.length * 0.55 || candidates.some((o) => o.note === 2 && o.line > c.line))) ?? null
            : null);
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
    // the page's own notes, for telling the body (which cites them) from a note's run-over
    const pageNotes = new Set(candidates.filter((c) => c.line >= at).map((c) => c.note));
    let from = runOverStart(lines, at, options.citationRunOver ?? false, pageNotes);
    if (options.footnoteGap)
        from = Math.min(from, gappedRunOverStart(lines, at));
    if (options.footnoteNumbers === "period") {
        // The running foot ("62      The Report of the Hillsborough Independent Panel") sits below the notes,
        // set off by blank lines: it goes back to the body's edge, where the furniture passes read the page
        // number off it, rather than ending the last note.
        let last = lines.length - 1;
        while (last > at && !lines[last].trim())
            last--;
        let above = last - 1;
        while (above > at && !lines[above].trim())
            above--;
        if (last > at && last - above > 2 && !noteCandidates([lines[last]], "period").length) {
            return { body: [...lines.slice(0, from), lines[last]], footnotes: lines.slice(at, above + 1), runOver: lines.slice(from, at) };
        }
    }
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
 *
 * `citations`: a report may opt in (`citationRunOver()`) to a second, weaker
 * fallback for a single-spaced page whose run-over is not one unbroken run
 * but several ordinary-looking paragraphs (`citationRunOverStart`). It is not
 * safe as a default — see that function's own comment — so it only runs
 * where the report's own footnotes are dense enough with citations to tell
 * them from body prose that way.
 */
function runOverStart(lines, at, citations, notes = new Set()) {
    let top = at;
    while (top > 0 && lines[top - 1].trim())
        top -= 1;
    if (top === at)
        return citations ? citationRunOverStart(lines, at, notes) : at;
    let gap = 0;
    while (top - gap - 1 >= 0 && !lines[top - gap - 1].trim())
        gap += 1;
    // Nothing above the run at all: the whole page is the block's, and there
    // is no body line to tell the run from.
    if (top - gap === 0)
        return citations ? citationRunOverStart(lines, at, notes) : at;
    // One line under a single blank is spaced exactly like a line of the body
    // above it; a wider gap, or a second line with no blank before it, is not.
    if (gap < RUN_OVER_MIN_GAP && at - top < 2)
        return citations ? citationRunOverStart(lines, at, notes) : at;
    // Only a double-spaced body makes an unbroken run stand out. On a
    // single-spaced page the body's own last paragraph is exactly such a run
    // (Litvinenko sets its paragraphs straight onto their notes), and taking it
    // would move prose, headings and all, into a footnote.
    if (isDoubleSpaced(lines.slice(0, top - gap)))
        return top;
    return citations ? citationRunOverStart(lines, at, notes) : at;
}
const RUN_OVER_MIN_GAP = 2;
/** Blank lines that read as a deliberate gap — a chart's space, a note block's separator — not paragraph spacing. */
const WIDE_GAP = 3;
/** The blank run directly above `line`: how many blank lines, and the index of the text above it (or -1). */
function gapAbove(lines, line) {
    let gap = 0;
    while (line - gap - 1 >= 0 && !lines[line - gap - 1].trim())
        gap += 1;
    return { gap, above: line - gap - 1 };
}
/**
 * `footnoteGap`: the note the page is expecting, set low enough in the
 * text that no later note corroborates it, because an embedded chart's empty
 * space sits above it (PSI PDF p.456: note 1864 follows a chart placeholder,
 * and note 1865 is on the next page, so the ordinary plausibility test
 * refuses it, and the note's text prints in the body).
 *
 * Only the exact expected number, in the stacked layout, directly below a
 * wide gap with text above it.
 */
function gappedNoteStart(lines, candidates, expectedNote) {
    for (const candidate of candidates) {
        if (candidate.note !== expectedNote)
            continue;
        if (!FOOTNOTE_STACKED.test(lines[candidate.line]))
            continue;
        const { gap, above } = gapAbove(lines, candidate.line);
        if (gap >= WIDE_GAP && above >= 0)
            return candidate;
    }
    return null;
}
/**
 * `footnoteGap`: where a note's run-over begins, when the body above ends
 * mid-sentence at a wide gap — the page's own text is plainly unfinished, so
 * whatever sits below the gap down to the first note is the previous note's
 * tail, however many paragraphs, quotations and prose-like lines it has
 * (PSI PDF p.504: two paragraphs and a quotation of note 2095 printed in the
 * body). Only when the paragraph just under the gap itself reads as
 * citations, so a chart's caption or a heading is never taken.
 */
function gappedRunOverStart(lines, at) {
    // The nearest wide gap above the note, with text above it.
    let top = at;
    while (top > 0 && !(lines[top].trim() && gapAbove(lines, top).gap >= WIDE_GAP))
        top -= 1;
    if (top <= 0)
        return at;
    const { above } = gapAbove(lines, top);
    if (above < 0)
        return at;
    if (/[.?!:;"”’)\]]$/.test(lines[above].trim()))
        return at;
    let end = top;
    while (end < at && lines[end].trim())
        end += 1;
    return looksLikeCitation(lines.slice(top, end).join(" ")) ? top : at;
}
/**
 * A note whose run-over is not one unbroken run but several paragraphs —
 * quotations, their source lines, more prose — none of them double-spaced
 * (PSI's "BSAM mark recap" note, reportsthatmatter-626: two whole pages are
 * notes 1770-1775's overflow, a block quotation and all).
 *
 * Gap width cannot tell a paragraph break from the body/footnote boundary on
 * a single-spaced page: both are exactly one blank line. A first attempt at
 * this trusted a *wider* gap instead, and moved a real heading, "D. Ratings
 * Deficiencies" — a section break sits behind a wide gap here too, table and
 * all, with nothing to tell it from a footnote's own separator.
 *
 * What does tell a footnote's overflow from body prose is its content: this
 * report's footnotes are citations, dense with the Bates numbers and hearing
 * exhibits its body prose uses only in passing. Walking upward paragraph by
 * paragraph — a paragraph being a run of lines with no blank line inside it,
 * whatever the gap around it — a paragraph joins the run-over only while it
 * is itself that dense with citations (`looksLikeCitation`); the first
 * paragraph that reads as prose instead — a heading, a table, a quotation
 * with no citation of its own, ordinary narration — stops the walk exactly
 * where it is, and nothing above that point is touched.
 */
function citationRunOverStart(lines, at, notes = new Set()) {
    // A paragraph that cites one of the page's own notes ("a “pig.” 1402 Yet")
    // is the body however many security names it carries ("FHLT 2005-A M9",
    // read as Bates numbers, walked a page and a half of PSI into note 1399:
    // reportsthatmatter-kvxj).
    const citesThisPage = (paragraph) => [...paragraph.matchAll(/[a-z.,;:!?"”’')\]]\s?(\d{1,4})(?=\s|$)/g)].some((m) => notes.has(Number(m[1])));
    let boundary = at;
    while (true) {
        let top = boundary;
        while (top > 0 && lines[top - 1].trim())
            top -= 1;
        if (top === boundary)
            return boundary;
        const paragraph = lines.slice(top, boundary).join(" ");
        if (!looksLikeCitation(paragraph) || citesThisPage(paragraph))
            return boundary;
        let gap = 0;
        while (top - gap - 1 >= 0 && !lines[top - gap - 1].trim())
            gap += 1;
        if (top - gap === 0)
            return top;
        boundary = top - gap;
    }
}
/**
 * Dense with the source identifiers this report's footnotes cite by —
 * Bates-numbered document productions ("GS MBS-E-011184213", "UBS-CT
 * 021485", "OTSWMEF-0000031969", "SCO-00310619"), hearing exhibits,
 * transcript cites, and QFR responses. Ordinary body prose mentions these in
 * passing; a footnote's own text is built almost entirely out of them.
 */
function looksLikeCitation(paragraph) {
    return (
    // A Bates-style document identifier: one or more all-caps (or
    // underscore-joined) segments, however OCR spaced or hyphenated them,
    // ending in a run of digits — "GS MBS-E-011184213", "PSI_QFR_GS0249",
    // "OTSWMEF-0000031969", "UBS-CT 021485".
    /\b[A-Z]{2,}(?:[ _-][A-Z0-9]{1,12}){0,4}[ -]{0,2}\d{4,}\b/.test(paragraph) ||
        /Hearing Exhibit|Int\. Tr\.|HSC Tr\.|Subcommittee QFR/.test(paragraph));
}
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
export function splitPage(page, expectedNote, options = {}) {
    const { printed, roman, lines } = takePrintedNumber(page.lines, { roman: options.romanFolios, paren: options.parenFolios, head: options.pageHeadFolios });
    const { body, footnotes, runOver } = splitFootnoteBlock(lines, expectedNote, options);
    return { ...provenance(page), printed, ...(roman ? { roman } : {}), body, footnotes, ...(runOver.length ? { runOver } : {}) };
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
/**
 * Whether the numbers a digit-bearing edge line carries move with the page.
 *
 * Blanking the digits (`furnitureKey`) is what lets a footer that carries its
 * page number repeat. It also makes every "CHAPTER 1", "CHAPTER 2" … banner
 * one repeated line, and every "ENDNOTES FOR CHAPTER 3" another: Columbia
 * opens each of its eleven chapters on a banner at the head of the page, and
 * all eleven were stripped as furniture — the chapter headings lost, and the
 * chapter number taken for the page's printed number ("page 1" on page 21).
 * A page number advances as the pages do; a chapter number does not. So
 * where a line repeats only once its digits are blanked, it is furniture
 * only if, between most pairs of consecutive pages it appears on, some
 * number on it advances by as many pages as lie between them.
 */
function tracksPages(occurrences) {
    const sorted = [...occurrences].sort((a, b) => a.index - b.index);
    let pairs = 0;
    let tracking = 0;
    for (let k = 1; k < sorted.length; k++) {
        const a = sorted[k - 1];
        const b = sorted[k];
        const step = b.index - a.index;
        pairs += 1;
        if (a.numbers.some((x) => b.numbers.some((y) => Math.abs(y - x - step) <= 1)))
            tracking += 1;
    }
    return pairs > 0 && tracking / pairs >= 0.5;
}
const numbersOn = (text) => (normaliseWhitespace(text).match(/\d+/g) ?? []).map((n) => Number.parseInt(n, 10));
export function stripRepeatedPageFurniture(pages, options = {}) {
    const counts = new Map();
    const literal = new Map();
    const occurrences = new Map();
    const edgeIndices = pages.map((page) => pageEdgeIndices(page.body));
    for (const [pageIndex, page] of pages.entries()) {
        const seen = new Map();
        const seenLiteral = new Set();
        for (const lineIndex of edgeIndices[pageIndex]) {
            const line = page.body[lineIndex];
            const key = furnitureKey(line);
            if (!key)
                continue;
            seen.set(key, [...(seen.get(key) ?? []), ...numbersOn(line)]);
            seenLiteral.add(normaliseWhitespace(line));
        }
        for (const [key, numbers] of seen) {
            counts.set(key, (counts.get(key) ?? 0) + 1);
            if (!occurrences.has(key))
                occurrences.set(key, []);
            occurrences.get(key).push({ index: page.index, numbers });
        }
        for (const text of seenLiteral)
            literal.set(text, (literal.get(text) ?? 0) + 1);
    }
    const tracked = new Map();
    const isFurniture = (line) => {
        const key = furnitureKey(line);
        if (!key)
            return false;
        const count = counts.get(key) ?? 0;
        if (count < MIN_REPEATED_FURNITURE || count < (options.minShare ?? 0) * pages.length) {
            return false;
        }
        if (!options.numbersTrackPages || !/\d/.test(line))
            return true;
        if ((literal.get(normaliseWhitespace(line)) ?? 0) >= MIN_REPEATED_FURNITURE)
            return true;
        if (!tracked.has(key))
            tracked.set(key, tracksPages(occurrences.get(key) ?? []));
        return tracked.get(key);
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
function chooseBlockStart(candidates, expectedNote, lines) {
    const lineCount = lines.length;
    /** Corroboration: the next note follows it, or it sits low on the page. */
    const plausible = (candidate) => candidates.some((other) => other.note === candidate.note + 1) ||
        candidate.line > lineCount * 0.55;
    // Where the expected number opens more than one line (a body line "2006 and
    // 2007 securitization…" above the foot's note 2006, a stray raised "216" over
    // a word), the block opens on a plausible one, the one the most notes follow
    // in step; on a tie, the first set off by a blank line above it (a note block
    // is; a stray inside a paragraph is not), else the first (reportsthatmatter-kvxj).
    const runAfter = (candidate) => {
        let n = 0;
        let line = candidate.line;
        for (;;) {
            const next = candidates.find((c) => c.note === candidate.note + n + 1 && c.line > line);
            if (!next)
                return n;
            n += 1;
            line = next.line;
        }
    };
    const exacts = candidates.filter((candidate) => candidate.note === expectedNote && plausible(candidate));
    const setOff = (c) => (c.line > 0 && !lines[c.line - 1].trim() ? 1 : 0);
    const exact = exacts.reduce((best, c) => {
        if (best === undefined)
            return c;
        const [a, b] = [runAfter(c), runAfter(best)];
        return a > b || (a === b && setOff(c) > setOff(best)) ? c : best;
    }, undefined);
    if (exact)
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
 * otherwise read as a paragraph break on every single line. A `margin` is the
 * `doubleSpaced` pass: the page is double-spaced whatever its proportions,
 * and its body sits at that margin.
 */
export function collapseDoubleSpacing(lines, margin) {
    const always = margin !== undefined;
    const nonEmpty = lines.filter((l) => l.trim()).length;
    if (nonEmpty < 4 && !always)
        return lines;
    let alternating = 0;
    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim() && !lines[i + 1].trim())
            alternating += 1;
    }
    // Double-spaced if most content lines are followed by a blank.
    if (alternating / nonEmpty < 0.6 && !always)
        return lines;
    // On a double-spaced page a single blank line is just the line spacing, but a
    // wider gap is a real break — a paragraph, or a heading standing on its own.
    // Dropping every blank loses that structure entirely.
    //
    // A quotation is single-spaced, so a blank inside one is a break between
    // its paragraphs. Where the page is declared double-spaced (`always`), a
    // blank with neither neighbour at the margin is kept — a double-spaced
    // paragraph's continuation lines sit at the margin, a quotation's do not: without it every paragraph of a quoted document ran into
    // one — the Frank Statement's "We believe the products we make are not
    // injurious to health." lost its own line.
    const quoteLine = (line) => line !== undefined && indentOf(line) > (margin ?? 0);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim()) {
            out.push(lines[i]);
            continue;
        }
        let gap = 0;
        while (i + gap < lines.length && !lines[i + gap].trim())
            gap += 1;
        const between = always && quoteLine(out[out.length - 1]) && quoteLine(lines[i + gap]);
        if (gap > 1 || between)
            out.push("");
        i += gap - 1;
    }
    return out;
}
