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
function isBlankAt(line, x) {
    return x >= line.length || line[x] === " " || line[x] === "\t";
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
            content.filter((line) => isBlankAt(line, x)).length / content.length >=
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
    // A line with text inside the band is full-width — a running header or
    // footer, a caption spanning both columns. Slicing it would cut a word in
    // half, so it stays whole.
    const fullWidth = (line) => line.slice(gutter.start, gutter.end).trim().length > 0;
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
            return to === undefined ? line.slice(from) : line.slice(from, to);
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
    return [...head, "", ...column(0, gutter.start), "", ...column(gutter.end), "", ...tail];
}
