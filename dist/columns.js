/**
 * Two-column page handling.
 *
 * `pdftotext -layout` preserves horizontal position, which means a two-column
 * page arrives with both columns on the same physical line, separated by a
 * band of whitespace:
 *
 *     of particular concern to the investigation. Specifically, re-    thin slice of Earth's horizon is visible
 *
 * Read line by line, that welds an unrelated sentence into the middle of
 * every paragraph — unreadable, and invisible to the fidelity checks, which
 * count words rather than order them.
 *
 * The gutter is found from the text itself: a band of columns that is blank
 * on nearly every content line, with substantial text on both sides of it.
 */
/**
 * Emitted between the two columns so the block parser can tell them apart.
 *
 * Splitting the page is not enough on its own: the foot of the left column
 * and the head of the right end up adjacent in the block stream, and the
 * continuation rule then joins them into one sentence — "In the process,
 * Columbia's control over specifications and requirements, and waivers
 * tragedy was compounded". A blank line does not stop that, because a blank
 * line is exactly what separates two paragraphs of the same column.
 */
export const COLUMN_BREAK = "\u0000column-break\u0000";
const MIN_CONTENT_LINES = 8;
/**
 * A gutter can be narrow. Columbia's executive summary sets its two columns
 * three characters apart, and requiring four missed a third of the report —
 * 86 pages that shipped with their columns still welded together.
 */
const MIN_GUTTER_WIDTH = 3;
/** A gutter sits near the middle. Anything else is a margin or a table rule. */
const MIN_POSITION = 0.3;
const MAX_POSITION = 0.7;
/**
 * How blank a band must be across content lines to count as a gutter.
 *
 * Not 1.0, and not near it: a full-width caption or footer crosses the gutter
 * on a few lines of an otherwise two-column page, and at 0.95 those lines
 * narrow the detected band below the minimum width and the page is missed.
 */
const BLANK_THRESHOLD = 0.9;
/**
 * How many lines must actually straddle it, or this is one ragged column.
 *
 * Both a fraction and a floor: a page is routinely half single-column,
 * because a figure occupies one side of it, and requiring a majority misses
 * those. The absolute floor is what stops a couple of coincidental lines on a
 * genuinely single-column page from looking like a second column.
 */
const MIN_STRADDLING = 0.22;
const MIN_STRADDLING_LINES = 6;
/**
 * How far a line's own gap may drift from its neighbours' and still count as
 * the same gutter.
 *
 * A justified or right-ranged column does not put its last character at the
 * same absolute position on every line — a two-digit line number, or one more
 * syllable in the last word, shifts the gap by a character. `splitAt` already
 * searches ±6 characters around the page's nominal gutter for exactly this
 * reason. Detection needs the same tolerance one level up: scanning strictly
 * per absolute column, a gap at column 38 on ten lines and column 39 on two
 * others is *two* candidate columns short of the 90% majority each, not one
 * column comfortably over it — so a page whose gutter drifts by even a single
 * character was never detected at all.
 */
const POSITION_JITTER = 1;
/**
 * Whether this line has a genuine gap — a real run of blank columns, the same
 * `{2,}` definition `splitAt` uses below, not a single inter-word space —
 * overlapping `[x - POSITION_JITTER, x + POSITION_JITTER]`.
 *
 * A single space is not a gap: two ordinary short words a space apart (an "of"
 * or a page number) sit at the same column on every line of a templated or
 * tabular page, and widening a *single* blank character by a character each
 * side is enough to swallow a short word whole and read it as gutter. A gap
 * has to already be a gap — width 2 or more — before its position is allowed
 * to drift.
 */
function hasGapNear(line, x) {
    if (x >= line.length)
        return true;
    for (const match of line.matchAll(/ {2,}/g)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (start - POSITION_JITTER <= x && x < end + POSITION_JITTER)
            return true;
    }
    return false;
}
/**
 * Finds the column gutter on one page, or null if the page is single-column.
 *
 * Deliberately conservative: a page it is unsure about is left alone, because
 * splitting a single-column page shreds it, while failing to split a
 * two-column one leaves it no worse than it is today.
 */
export function detectGutter(lines) {
    const content = lines.filter((line) => line.trim().length > 0);
    if (content.length < MIN_CONTENT_LINES)
        return null;
    const width = Math.max(...content.map((line) => line.length));
    if (width < 40)
        return null;
    const lo = Math.floor(width * MIN_POSITION);
    const hi = Math.ceil(width * MAX_POSITION);
    let best = null;
    let run = -1;
    for (let x = lo; x <= hi + 1; x++) {
        const blank = x <= hi &&
            content.filter((line) => hasGapNear(line, x)).length / content.length >=
                BLANK_THRESHOLD;
        if (blank) {
            if (run === -1)
                run = x;
            continue;
        }
        if (run !== -1) {
            const candidate = { start: run, end: x };
            if (candidate.end - candidate.start >= MIN_GUTTER_WIDTH &&
                (!best || candidate.end - candidate.start > best.end - best.start)) {
                best = candidate;
            }
            run = -1;
        }
    }
    if (!best)
        return null;
    // A real second column has text on both sides of the gutter, on a good
    // share of lines. A ragged right margin does not.
    const straddling = content.filter((line) => line.slice(0, best.start).trim().length > 0 &&
        line.slice(best.end).trim().length > 0).length;
    if (straddling < MIN_STRADDLING_LINES)
        return null;
    if (straddling / content.length < MIN_STRADDLING)
        return null;
    return best;
}
/**
 * Reads a page column by column instead of line by line.
 *
 * Each column keeps its own leading whitespace, because indentation is what
 * tells the block parser where a paragraph begins. Pages with no detectable
 * gutter are returned untouched.
 */
export function splitColumns(lines) {
    const gutter = detectGutter(lines);
    if (!gutter)
        return lines;
    /**
     * Where this particular line's columns part.
     *
     * The gutter is a property of the page, but justified text does not respect
     * it exactly: a long word at the end of the left column spills a character
     * or two into the band. Slicing at the page's gutter would cut that word in
     * half, so each line is split at its own run of whitespace nearest the
     * gutter. A line with no such run is genuinely full-width.
     */
    const centre = (gutter.start + gutter.end) / 2;
    const localGap = (line) => {
        const lo = Math.max(0, gutter.start - 6);
        const hi = Math.min(line.length, gutter.end + 6);
        let best = null;
        for (const match of line.matchAll(/ {2,}/g)) {
            const start = match.index ?? 0;
            const end = start + match[0].length;
            if (end < lo || start > hi)
                continue;
            if (best === null || Math.abs(start - centre) < Math.abs(best.start - centre)) {
                best = { start, end };
            }
        }
        return best;
    };
    const splitAt = (line) => localGap(line)?.start ?? null;
    const fullWidth = (line) => line.slice(gutter.start, gutter.end).trim().length > 0 && splitAt(line) === null;
    const width = Math.max(...lines.map((line) => line.length));
    /**
     * Page furniture, kept whole and kept at the edge it was found on.
     *
     * A running header or footer sits within a few lines of the page edge and
     * carries far less text than a line of prose — "30  Report Volume I  August
     * 2003" against a 138-column page. Position alone is not enough, because on
     * a dense page the last line really is column text; length alone is not
     * either, because a paragraph can end on a short line mid-page.
     *
     * This has to stay whole: the footer straddles the gutter, so splitting it
     * would put the page number in one column and the date in the other, and
     * burying it mid-array hides it from the furniture pass that strips it and
     * recovers the printed page number.
     */
    const EDGE_DEPTH = 3;
    const FURNITURE_MAX = 0.5;
    const edges = new Set();
    const nonBlank = lines
        .map((line, i) => (line.trim() ? i : -1))
        .filter((i) => i !== -1);
    for (const i of nonBlank.slice(0, EDGE_DEPTH))
        edges.add(i);
    for (const i of nonBlank.slice(-EDGE_DEPTH))
        edges.add(i);
    const isFurniture = (line, i) => edges.has(i) &&
        (fullWidth(line) || line.trim().replace(/\s+/g, " ").length < width * FURNITURE_MAX);
    const head = [];
    const tail = [];
    const middle = Math.floor(lines.length / 2);
    const inSpan = lines.map((line, i) => {
        if (!line.trim() || !isFurniture(line, i))
            return true;
        (i < middle ? head : tail).push(line);
        return false;
    });
    const column = (from, to) => {
        const sliced = lines.map((line, i) => {
            if (!inSpan[i])
                return "";
            if (fullWidth(line))
                return from === 0 ? line : "";
            // The left column ends where this line's own gap begins.
            if (to !== undefined)
                return line.slice(from, splitAt(line) ?? to);
            // The right column starts at the page's gutter, so its indentation —
            // which is what marks a new paragraph — stays comparable across lines.
            // Never *later* than this line's own gap ends, though: a short line
            // above (a heading, a short-lived left-column entry) can leave this
            // line's real local gap narrower than the page's, and cutting at the
            // page's fixed position then takes the first character or two of the
            // next word with it — "loads" arriving as "oads" is how this was found.
            return line.slice(Math.min(from, localGap(line)?.end ?? from));
        });
        // Trim the blank lines at each end; the ones between paragraphs stay.
        let first = 0;
        let last = sliced.length - 1;
        while (first <= last && !sliced[first].trim())
            first++;
        while (last >= first && !sliced[last].trim())
            last--;
        return sliced.slice(first, last + 1).map((line) => (line.trim() ? line : ""));
    };
    return [
        ...head,
        "",
        ...column(0, gutter.start),
        COLUMN_BREAK,
        ...column(gutter.end),
        "",
        ...tail,
    ];
}
