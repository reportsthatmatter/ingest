import { createHash } from "node:crypto";
/**
 * Page-break joins decided from the PDF's layout (reportsthatmatter-38s.10,
 * from the 38s.8 aligned-pair study, rules R1 and R2).
 *
 * Each page is parsed on its own, so a paragraph running over the foot of a
 * page arrives as two. `mergeAcrossPages` rejoins them on text alone: a
 * lower-case opening, or a page foot ending on an abbreviation. Text alone
 * cannot see the commonest run-ons, which open on a capital ("…now Senior
 * Vice President for" / "Marketing at Philip Morris…"), a digit or a bracket
 * (a citation string), or follow a full stop (a paragraph running on past a
 * sentence that happens to end the page). The layout can:
 *
 * - **R1**: the old page's last line does not end a sentence, and the new
 *   page's first line is *flush* with the line under it on the same page (no
 *   first-line indent: |indent| < 0.6 em) or opens in lower case; it does not
 *   open on a label ("57.", "(b)", "9.88", "•"); and the font does not change
 *   across the break.
 * - **R2**: the old page's last line ends a sentence, but the page is set
 *   justified, that line runs to the right margin (within 0.5 em), and the
 *   new page's first line is flush, unlabelled, in the same font and longer
 *   than four words.
 *
 * A first line compared with the line under it on its own page, not with the
 * old page: verso and recto text blocks can sit at different lefts (Saville).
 *
 * Deterministic: the same layout and text give the same decision. Each
 * decision carries a `confidence`: `low` (near a threshold: `ambiguous`),
 * `medium` (a call the layout makes but the words could overturn: a flush
 * first line after a finished sentence, a layout-only label after an
 * unfinished one) or `high`. An optional referee (38s.11) is consulted on the
 * `low` calls, or on `low` and `medium` with `refer: "medium"`; without one
 * the rules stand.
 */
/** |first-line indent| below this, in ems, is flush. */
export const FLUSH_EM = 0.6;
/** Right gap below this, in ems, runs to the margin. */
export const FULL_LINE_EM = 0.5;
/** A page whose lines' median right gap is below this, in ems, is justified. */
export const JUSTIFIED_EM = 0.5;
/** R2's next line must be longer than this, in words. */
export const R2_MIN_WORDS = 4;
/**
 * R1 does not join after a line that stops this many ems short of the right
 * margin: a ragged-right page's prose stays within it (Saville's, PSI's
 * widest gaps are under 5), a list, index or timeline entry does not.
 */
export const SHORT_LINE_EM = 5;
/** An indent within this of `FLUSH_EM`, in ems, is a low-margin call. */
const MARGIN_EM = 0.25;
const SENTENCE_END = /[.?!:;]["'”’)\]]*$/;
const ABBREVIATION = /\b(mr|mrs|ms|dr|prof|sen|rep|gov|st|nos?|vs?|inc|co|corp|ltd|jr|sr|u\.s|e\.g|i\.e|cf|ch|art|sec|fig|para|pp?|ecf|tr)\.$/i;
const INITIAL = /\b[A-Z]\.$/;
/**
 * Same test as `endsSentence` in paragraphs.ts, kept here so this module
 * stands alone, except that a footnote marker after the stop does not hide
 * it: "…contact the flight.46" ends a sentence (the pipeline links markers
 * later, so here they are still bare digits).
 */
function endsSentence(text) {
    const t = text.trim().replace(/([.?!:;]["'\u201d\u2019)\]]*)\s?(?:\d{1,4}|\[\^[\w-]{1,12}\])$/, "$1");
    if (!SENTENCE_END.test(t))
        return false;
    return !(ABBREVIATION.test(t) || INITIAL.test(t));
}
/**
 * "57." "(b)" "9.88" "7.44" "•" "b." "iv." "A." at the head of a block of
 * text. A bare number ("1972 and to mount…") is not a label: it is the
 * commonest digit continuation.
 */
const TEXT_LABEL = /^(?:\d{1,4}(?:\.\d{1,4})+[.)]?\s|\d{1,4}[.)]\s|\(?(?:[a-z]|[ivxlc]{1,5})[.)]\s|\([a-z0-9]{1,4}\)\s|[A-Z]\.\s|[•·▪●○◦■□➢►–-]\s?)/;
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
/** A number and a space, no stop or bracket: the layout reads it as a label, the text does not. */
const BARE_NUMBER = /^\d{1,4}\s/;
/**
 * The same face either side of the break: family, colour, weight and slant,
 * and size. On a scan (`scanned`) the size may differ by a point: an OCR text
 * layer sizes each line from its own glyphs, 16 and 17 on one page. On a
 * born-digital page it may not: 9/11 sets its map captions one point under
 * the body.
 */
export function sameFace(a, b, scanned = false) {
    return (a.family === b.family &&
        a.color === b.color &&
        a.bold === b.bold &&
        a.italic === b.italic &&
        Math.abs(a.size - b.size) <= (scanned ? SCAN_SIZE_TOLERANCE : SIZE_TOLERANCE));
}
/** Born-digital: the same size (a caption one point under the body is another face). */
const SIZE_TOLERANCE = 0.25;
/** A scan's OCR layer: within a point. */
const SCAN_SIZE_TOLERANCE = 1;
/** Lower case (or `,` `;`): text alone already says it continues. */
const LOWER = /^[a-z,;]/;
/** Whether a page is set justified: the median right gap of its body lines of some length. */
export function isJustified(page) {
    const gaps = page.lines
        .filter((l) => l.body && l.text.trim().length >= 30)
        .map((l) => Math.abs(l.rightGapEm))
        .sort((a, b) => a - b);
    if (gaps.length < 5)
        return false;
    return gaps[Math.floor(gaps.length / 2)] < JUSTIFIED_EM;
}
/**
 * The rules, on the lines either side of one page break. Pure: the test seam.
 * `prevText` and `nextText` are the blocks' text as the pipeline read them
 * (the sentence-end and label tests read those, not the layout's text).
 */
export function decidePageBreak(lines, prevText, nextText, options = {}) {
    const { prev, next, under } = lines;
    const decided = (d, confidence) => ({
        ...d,
        ambiguous: confidence === "low",
        confidence,
    });
    const finished = endsSentence(prevText);
    if (TEXT_LABEL.test(nextText.trim()))
        return decided({ join: false, rule: "split", reason: "next opens on a label" }, "high");
    // The layout's own label test also takes a bare number and a space. That is not a label to the text
    // (TEXT_LABEL: "1972 and to mount…"), and after an unfinished sentence it is the sentence running on
    // ("…what had occurred in the past" / "24 hours”,2 and…", Saville p.302, reportsthatmatter-hfrd): the
    // rules below decide it, as for any other first line, and the call is never more than medium.
    const bareNumber = next.label && BARE_NUMBER.test(next.text.trim()) && !finished;
    if (next.label && !bareNumber)
        return decided({ join: false, rule: "split", reason: "next opens on a label (layout)" }, finished ? "high" : "medium");
    if (bareNumber) {
        const d = decidePageBreak({ ...lines, next: { ...next, label: false } }, prevText, nextText, options);
        return d.confidence === "high" ? { ...d, reason: `${d.reason} (a bare number)`, confidence: "medium" } : { ...d, reason: `${d.reason} (a bare number)` };
    }
    if (!sameFace(prev, next, options.scanned))
        return decided({ join: false, rule: "split", reason: "font changes across the break" }, "high");
    const indentEm = under && next.size > 0 ? Math.round(((next.left - under.left) / next.size) * 100) / 100 : undefined;
    const flush = indentEm !== undefined && Math.abs(indentEm) < FLUSH_EM;
    const near = indentEm !== undefined && Math.abs(Math.abs(indentEm) - FLUSH_EM) < MARGIN_EM;
    const shaky = near || !lines.underContinues;
    if (!finished) {
        // A line that stops well short of the margin without ending a sentence is
        // a list's or an index's entry, a date line or a map label, not prose run
        // over the page: "June 25, 2001–September 4, 2001" / "Thomas Pickering".
        if (flush && Math.abs(prev.rightGapEm) >= SHORT_LINE_EM) {
            return decided({ join: false, rule: "split", reason: "unfinished, but a short last line", indentEm }, "low");
        }
        if (flush)
            return decided({ join: true, rule: "R1", reason: "unfinished, next line flush", indentEm }, shaky ? "low" : "high");
        if (LOWER.test(nextText.trim()))
            return decided({ join: true, rule: "R1", reason: "unfinished, next opens lower case", indentEm }, "high");
        return decided({
            join: false,
            rule: "split",
            reason: indentEm === undefined ? "unfinished, no line under next" : "unfinished, next line indented",
            indentEm,
        }, indentEm === undefined || near ? "low" : "high");
    }
    const justified = isJustified(lines.prevPage);
    const full = Math.abs(prev.rightGapEm) < FULL_LINE_EM;
    if (justified && full && flush && words(next.text) > R2_MIN_WORDS) {
        return decided({ join: true, rule: "R2", reason: "finished, but a full justified line and a flush next line", indentEm }, "low");
    }
    // A finished sentence and a flush first line in the same face: a new paragraph in a document that sets
    // them flush, or the paragraph running on (Saville p.162, p.487; Chilcot p.112). Only the words can say.
    return decided({ join: false, rule: "split", reason: flush ? "finished, next line flush" : "finished", indentEm }, flush ? "medium" : "high");
}
/**
 * Letters only, lower case, ligatures and diacritics folded: the two texts
 * compare equal. Digits are left out because a footnote marker is a digit run
 * whose place differs between the two readings ("Hazmi.11").
 */
export function letters(s) {
    return s
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
}
/** A line's text, compared against a block's, has to be at least this long to count as found. */
const MIN_MATCH = 6;
/**
 * A block's text may carry a few letters its printed line does not: a raised
 * ordinal suffix the layout sets as a line of its own ("(7th Cir. 1996)",
 * Philip Morris p.1581). A line is found when its letters run at the head (or
 * tail) of the block's with at most this many of the block's skipped.
 */
const SKIP_LETTERS = 4;
/** `text` opens with `line`, skipping up to `SKIP_LETTERS` of `text`'s letters; `anywhere`: within its first few letters. */
function startsLoosely(text, line, anywhere = false) {
    for (let start = 0; start <= (anywhere ? SKIP_LETTERS : 0); start++) {
        let i = start;
        let skipped = start;
        let j = 0;
        while (j < line.length && i < text.length && skipped <= SKIP_LETTERS) {
            if (text[i] === line[j]) {
                i++;
                j++;
            }
            else if (j < MIN_MATCH) {
                // The line's first letters must meet the text's own: skipping there
                // would find a line ending a few letters early (Philip Morris p.1545,
                // "…Racketeering Act" for a paragraph ending "Act Nos. 36, 37…").
                break;
            }
            else {
                i++;
                skipped++;
            }
        }
        if (j === line.length && skipped <= SKIP_LETTERS)
            return true;
        if (j < MIN_MATCH && !anywhere)
            return false;
    }
    return false;
}
/** `text` ends with `line`, skipping up to `SKIP_LETTERS` of `text`'s letters. */
function endsLoosely(text, line) {
    const rev = (x) => [...x].reverse().join("");
    return startsLoosely(rev(text), rev(line));
}
/**
 * Finds the layout lines either side of a page break: the paragraph's last
 * line on the old page (searched on the pages before the new one, latest
 * first) and the block's first line on the new page, by their text. Returns
 * undefined when either cannot be found, which leaves the pair to the text
 * rules.
 */
export function findPageBreakLines(layout, prevText, nextText, at) {
    const volume = at.volume ?? 1;
    const head = letters(nextText.slice(0, 600));
    const tail = letters(prevText.slice(-600));
    if (head.length < MIN_MATCH || tail.length < MIN_MATCH)
        return undefined;
    const nextLines = layout.lines(volume, at.pdfIndex);
    let nextIdx = -1;
    for (let i = 0; i < nextLines.length; i++) {
        const n = letters(nextLines[i].text);
        if (n.length >= MIN_MATCH ? head.startsWith(n) : n.length > 0 && head === n) {
            nextIdx = i;
            break;
        }
    }
    // A line whose letters differ from the block's further along: a raised "th" the
    // layout sets on a line of its own ("(7th Cir. 1996)", Philip Morris p.1581).
    // Its opening letters still find it.
    if (nextIdx === -1) {
        for (let i = 0; i < nextLines.length; i++) {
            const n = letters(nextLines[i].text);
            if (n.length >= MIN_MATCH && startsLoosely(head, n)) {
                nextIdx = i;
                break;
            }
        }
    }
    if (nextIdx === -1)
        return undefined;
    const next = nextLines[nextIdx];
    // The line under it: below, overlapping it across the page, within two and a half lines
    // (a pitch and a half on a double-spaced page).
    const pitch = layout.page(volume, at.pdfIndex)?.pitch ?? 0;
    const reach = Math.max(2.5 * Math.max(next.height, 1), 1.5 * pitch);
    let under;
    for (let i = nextIdx + 1; i < nextLines.length; i++) {
        const l = nextLines[i];
        if (l.top <= next.top)
            continue;
        if (l.top - next.top > reach)
            continue;
        if (l.left > next.right || l.right < next.left)
            continue;
        under = l;
        break;
    }
    const rest = head.slice(letters(next.text).length);
    const underLetters = under === undefined ? "" : letters(under.text);
    const underContinues = underLetters.length > 0 &&
        (rest.startsWith(underLetters) || (underLetters.length >= MIN_MATCH && startsLoosely(rest, underLetters, true)));
    // The old page: the nearest earlier page that carries the paragraph's last line.
    const pages = layout.pages(volume);
    const candidates = [];
    const here = pages.indexOf(at.pdfIndex);
    for (let k = here - 1; k >= 0 && k >= here - 3; k--)
        candidates.push([volume, pages[k]]);
    if (here <= 0 && volume > 1) {
        const before = layout.pages(volume - 1);
        if (before.length)
            candidates.push([volume - 1, before[before.length - 1]]);
    }
    for (const [v, p] of candidates) {
        const lines = layout.lines(v, p);
        for (let i = lines.length - 1; i >= 0; i--) {
            const n = letters(lines[i].text);
            if (n.length < MIN_MATCH && n !== tail)
                continue;
            if (!tail.endsWith(n) && !(n.length >= MIN_MATCH && endsLoosely(tail, n)))
                continue;
            const prevPage = layout.page(v, p);
            if (!prevPage)
                return undefined;
            return { prev: lines[i], next, under, underContinues, prevPage };
        }
    }
    return undefined;
}
/** The key a referee's cache is read by: the two lines' text, hashed. */
export function pageBreakKey(prev, next) {
    return createHash("sha256").update(`${prev.trim()}\n${next.trim()}`).digest("hex").slice(0, 16);
}
/**
 * Whether a paragraph left at the foot of one page and a paragraph opening
 * the next are one paragraph, by the layout rules (and the referee, on a
 * low-margin call, when one is supplied). False when the lines cannot be
 * found in the layout.
 */
export function layoutJoins(layout, prevText, nextText, at, options = {}) {
    const lines = findPageBreakLines(layout, prevText, nextText, at);
    if (!lines)
        return false;
    const decision = decidePageBreak(lines, prevText, nextText, options);
    const refer = decision.confidence === "low" || (decision.confidence === "medium" && options.refer === "medium");
    if (options.referee && refer) {
        const answer = options.referee({
            key: pageBreakKey(lines.prev.text, lines.next.text),
            prevText,
            nextText,
            lines,
            decision,
        });
        if (answer !== undefined)
            return answer;
    }
    return decision.join;
}
const CAPTION = /^(?:figure|fig\.|table|chart|map|photo|source|image|exhibit|box|graph|diagram)\b/i;
/** "FIGURE 2.4: Wells Drilled…", "Source: Commission staff…": a figure's or table's caption or source line. */
export function isCaption(text) {
    return CAPTION.test(text.trim());
}
/**
 * Whether a block left on a page is not set in the body face: the run-over of
 * a footnote that began on the page before (no number of its own), which the
 * page's parse read as a paragraph of the body (Lehman PDF p.59,
 * reportsthatmatter-j6qm). Found by the block's text against the page's
 * lines; false when the lines cannot be found.
 */
export function isOffFaceBlock(layout, text, at) {
    // A figure's or table's caption is off the body face too, and what follows it
    // on the next page may be chart debris, not the paragraph's rest (Columbia).
    if (CAPTION.test(text.trim()))
        return false;
    const head = letters(text.slice(0, 200));
    if (head.length < MIN_MATCH)
        return false;
    for (const line of layout.lines(at.volume ?? 1, at.pdfIndex)) {
        const n = letters(line.text);
        if (n.length >= MIN_MATCH && head.startsWith(n))
            return !line.body;
    }
    return false;
}
