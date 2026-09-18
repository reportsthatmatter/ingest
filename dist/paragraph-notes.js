import { normaliseWhitespace } from "./extract.js";
/**
 * Notes set beneath the paragraph they belong to, numbered afresh for each
 * paragraph (Saville, reportsthatmatter-0rx).
 *
 *   9.165   When shown this document, David still did not recall having gone
 *           to Londonderry.1 His recollection was that he invariably reported…
 *           1   Day 330/70                                   2   Day 330/7
 *
 * The page-foot reading every other report gets is wrong three ways here: the
 * block is not at the foot, it is set in two columns read down each one, and
 * "1" names a different note under every paragraph. Read as a page-foot block
 * it swallowed body paragraphs into notes and pointed 392 references at one
 * definition.
 *
 * So a block is only taken when it proves itself — its numbers, read down the
 * left column then the right, run 1, 2, 3… with no gap — and each note gets a
 * label no other note shares (`3-117`: printed number, then which block), so
 * a marker that cannot be found leaves one note unplaced instead of shifting
 * every note after it onto the wrong paragraph.
 */
/** A note opening: its number, then a small gap, then its text. */
const NOTE_START = /^(\s*)(\d{1,2})( {2,4})(\S.*)$/;
/** A second-column note opening further along the same line. */
const RIGHT_START = /(\S)(\s{3,})(\d{1,2})( {2,4})\S/g;
/** A numbered paragraph's opening line: "9.165   When shown…". */
const PARAGRAPH_OPENER = /^\s*\d{1,2}\.\d{1,3}\b/;
/** How far back a marker is looked for, when no paragraph opener bounds it. */
const MAX_WINDOW = 200;
/** Where the right-hand column begins, if the block has one. */
function rightColumn(lines, numberColumn) {
    const starts = [];
    for (const line of lines) {
        for (const match of line.matchAll(RIGHT_START)) {
            const at = match.index + match[1].length + match[2].length;
            if (at > numberColumn + 20)
                starts.push(at);
        }
    }
    return starts.length ? Math.min(...starts) : null;
}
/**
 * Cuts a line where the right column starts. Words in a column are single-
 * spaced, so the first wider gap reaching the column is the gutter — whether
 * the right-hand text is a note opening at the column or a continuation
 * indented past it.
 */
function splitAt(line, column) {
    const gap = /\s{2,}/g;
    for (let match = gap.exec(line); match; match = gap.exec(line)) {
        const end = match.index + match[0].length;
        if (end >= column - 3 && end < line.length) {
            return [line.slice(0, match.index), line.slice(end)];
        }
    }
    return [line, ""];
}
/**
 * Reads one column's lines into notes, in order. Null if a line cannot
 * belong. `carry` is the note the previous column ended on: a long note runs
 * out of the left column and on at the top of the right one.
 */
function readColumn(lines, carry) {
    const notes = carry ? [carry] : [];
    for (const line of lines) {
        if (!line.trim())
            continue;
        const start = line.match(NOTE_START);
        const expected = (notes[notes.length - 1]?.number ?? 0) + 1;
        if (start && Number(start[2]) === expected) {
            notes.push({ number: expected, text: start[4] });
        }
        else if (start) {
            // A note opening out of sequence: the numbering is not what this
            // reading assumes, so none of the block can be trusted to it.
            return null;
        }
        else if (notes.length) {
            notes[notes.length - 1].text += ` ${line.trim()}`;
        }
        else {
            return null;
        }
    }
    return carry ? notes.slice(1) : notes;
}
/**
 * The note block that opens at `start`, if the lines there are one.
 *
 * Only a block whose numbers run 1…n, read down the left column and then the
 * right, is taken: the left column must open at 1 and the right must pick up
 * exactly where the left stopped. Anything else — a numbered list in a quoted
 * document, a table — is left in the body untouched.
 */
function readBlock(lines, start) {
    const first = lines[start].match(NOTE_START);
    if (!first || first[2] !== "1")
        return null;
    const numberColumn = first[1].length;
    const textColumn = numberColumn + first[2].length + first[3].length;
    let end = start + 1;
    while (end < lines.length && lines[end].trim()) {
        const indent = lines[end].length - lines[end].trimStart().length;
        if (indent < numberColumn)
            break;
        end++;
    }
    const rows = lines.slice(start, end);
    const right = rightColumn(rows, numberColumn);
    const left = [];
    const rightLines = [];
    for (const row of rows) {
        if (right === null) {
            left.push(row);
            continue;
        }
        const [l, r] = splitAt(row, right);
        left.push(l);
        rightLines.push(r ? `${" ".repeat(numberColumn)}${r.trim()}` : "");
    }
    // Continuation lines sit at the text column; anything left of it that is
    // not a note opening is not part of this block.
    for (const row of left) {
        if (!row.trim())
            continue;
        const indent = row.length - row.trimStart().length;
        if (indent < textColumn && !NOTE_START.test(row))
            return null;
    }
    const leftNotes = readColumn(left);
    if (!leftNotes?.length)
        return null;
    let notes = leftNotes;
    if (rightLines.some((line) => line.trim())) {
        const last = leftNotes[leftNotes.length - 1];
        const rightNotes = readColumn(rightLines, last);
        if (!rightNotes)
            return null;
        notes = [...leftNotes, ...rightNotes];
    }
    return {
        start,
        end,
        notes: notes.map((note) => ({ ...note, text: normaliseWhitespace(note.text) })),
    };
}
/**
 * The marker for note `n` somewhere in `text` before `before`, as the last
 * such position: a number set against a word or closing punctuation
 * ("Londonderry.1", "evidence3", "practice.” 7"), never part of a longer
 * number, a decimal or a paragraph reference. A year takes one too — "on 1st
 * January 19723" is 1972 and note 3 — which is only safe because the search
 * is for one known number, in one paragraph, before the next note's marker.
 */
function findMarker(text, n, before) {
    const pattern = new RegExp(`(?<=[A-Za-z\\u00C0-\\u017F.,;:!?’”"')\\]]|\\b(?:19|20)\\d\\d)( ?)(${n})(?![\\d.]\\d|\\d)(?=[\\s.,;:)\\]’”"]|$)`, "g");
    let found = null;
    for (const match of text.matchAll(pattern)) {
        const index = match.index + match[1].length;
        if (index + match[2].length > before)
            break;
        // A space before the number is only allowed after closing punctuation
        // or a quote: "practice.” 7", never "Day 7" or "para 7".
        if (match[1] && !/[.,;:!?’”"')\]]$/.test(text.slice(0, match.index)))
            continue;
        found = { index, length: match[2].length };
    }
    return found;
}
/**
 * Takes note blocks out of the body and links their markers in the text
 * above them. Works across a volume's pages together, because a paragraph
 * that runs over a page break carries markers on both sides of it.
 */
export function extractParagraphNotes(pages, firstBlock = 1) {
    const notes = [];
    let block = firstBlock;
    // Every body line in reading order, so a paragraph can be followed back
    // over a page break.
    const order = [];
    pages.forEach((page, p) => page.body.forEach((_, l) => order.push({ page: p, line: l })));
    const lines = order.map(({ page, line }) => pages[page].body[line]);
    let windowFloor = 0;
    const remove = new Set();
    for (let i = 0; i < lines.length; i++) {
        if (remove.has(i))
            continue;
        const found = readBlock(lines, i);
        if (!found)
            continue;
        // A block cannot run across a page break: stop it at this page's end.
        const page = order[i].page;
        let end = found.end;
        for (let j = i; j < found.end; j++) {
            if (order[j].page !== page) {
                end = j;
                break;
            }
        }
        const confirmed = end === found.end ? found : readBlock(lines.slice(0, end), i);
        if (!confirmed)
            continue;
        // The paragraph the notes belong to: back to its numbered opener, or to
        // the previous note block, whichever is nearer.
        let floor = Math.max(windowFloor, i - MAX_WINDOW);
        for (let j = i - 1; j >= floor; j--) {
            if (PARAGRAPH_OPENER.test(lines[j])) {
                floor = j;
                break;
            }
        }
        // Link from the last note backwards, each marker before the one after it.
        const labels = confirmed.notes.map((note) => `${note.number}-${block}`);
        const linked = new Map();
        let limitLine = i - 1;
        let limitCol = Number.POSITIVE_INFINITY;
        for (let k = confirmed.notes.length - 1; k >= 0; k--) {
            const n = confirmed.notes[k].number;
            for (let j = limitLine; j >= floor; j--) {
                const text = linked.get(j) ?? lines[j];
                const marker = findMarker(text, n, j === limitLine ? limitCol : text.length);
                if (!marker)
                    continue;
                linked.set(j, text.slice(0, marker.index) + `[^${labels[k]}]` + text.slice(marker.index + marker.length));
                limitLine = j;
                limitCol = marker.index;
                break;
            }
        }
        // Nothing in the text refers to it: a numbered legend under a map
        // ("1   Jackie Duddy") has the shape of a note block, and so does a note
        // whose marker the text layer lost. Either way there is no evidence of
        // where it belongs, so it stays where the page printed it.
        if (!linked.size)
            continue;
        for (const [j, text] of linked)
            lines[j] = text;
        const at = pages[page];
        for (const [k, note] of confirmed.notes.entries()) {
            notes.push({
                number: note.number,
                label: labels[k],
                text: note.text,
                page: at.index,
                volume: at.volume,
                pdfIndex: at.pdfIndex,
                printed: at.printed,
            });
        }
        for (let j = i; j < confirmed.end; j++)
            remove.add(j);
        windowFloor = confirmed.end;
        block += 1;
        i = confirmed.end - 1;
    }
    // Write the linked text back, and drop the note blocks from the body.
    const kept = pages.map(() => []);
    order.forEach(({ page }, j) => {
        if (!remove.has(j))
            kept[page].push(lines[j]);
    });
    pages.forEach((page, p) => (page.body = kept[p]));
    return { notes, nextBlock: block };
}
