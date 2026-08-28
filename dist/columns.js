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
const MIN_GUTTER_WIDTH = 4;
/** A gutter sits near the middle. Anything else is a margin or a table rule. */
const MIN_POSITION = 0.3;
const MAX_POSITION = 0.7;
/** How blank a band must be across content lines to count as a gutter. */
const BLANK_THRESHOLD = 0.95;
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
    const straddles = (line) => line.slice(0, gutter.start).trim().length > 0 &&
        line.slice(gutter.end).trim().length > 0;
    // Where the two columns actually run. A full-width line outside that span
    // is page furniture, and it has to stay at the page edge: the running
    // header and footer are recognised by their position, and burying them
    // mid-page hides them from the furniture pass.
    const first = lines.findIndex(straddles);
    let last = lines.length - 1;
    while (last > first && !straddles(lines[last]))
        last--;
    const head = [];
    const tail = [];
    const inSpan = lines.map((line, i) => {
        if (i < first && fullWidth(line)) {
            head.push(line);
            return false;
        }
        if (i > last && fullWidth(line)) {
            tail.push(line);
            return false;
        }
        return true;
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
