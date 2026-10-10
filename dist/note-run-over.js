const key = (text) => text.replace(/\s+/g, "").slice(0, 24);
/**
 * `noteFaceRunOver` (reportsthatmatter-07k, mv0j): the body lines at the foot of a page that are set in the
 * face of the page's own notes. A note that runs over the page break opens the page's footnote area
 * before the page's first note, but the text reading starts the block at the first numbered note, so the
 * run-over (an email exchange, a quotation, paragraphs of its own) stays in the body: PSI's note 1770,
 * three indented paragraphs printed above notes 1771-1775 (PDF p.439), read as a quotation.
 *
 * The layout knows better: those lines are in the notes' size and family, the body's lines are not.
 * Walks up from the end of the body while each non-blank line is set in the first note's face (found in
 * the layout by its text, as `inNoteFace` does) and returns how many body lines that is. A line the
 * layout cannot place, or in any other face (a chart's axis labels, a table), ends the walk.
 */
export function noteFaceRunOverCount(layout, volume, pdfIndex, body, footnotes) {
    const page = layout.page(volume, pdfIndex);
    const first = footnotes.find((l) => l.trim());
    if (!page || !first)
        return 0;
    const find = (line) => {
        const want = key(line);
        if (!want)
            return undefined;
        // (exactly, or by a long prefix that only one line of the page has: a short one matches "Timberwolf securities…" in a note)
        const exact = page.lines.filter((l) => key(l.text) === want);
        if (exact.length)
            return exact[0];
        const prefix = want.length >= 16 ? page.lines.filter((l) => key(l.text).startsWith(want.slice(0, 16))) : [];
        return prefix.length === 1 ? prefix[0] : undefined;
    };
    // The notes' face: the first note's line, or the line after it where the number is a line of its own.
    const noteLines = footnotes.filter((l) => l.trim()).slice(0, 3).map(find).filter((l) => Boolean(l));
    const sized = noteLines.filter((l) => l.size > 0 && !/^\s*\d{1,4}\s*$/.test(l.text)).sort((a, b) => b.size - a.size);
    const face = sized[0];
    const bodySize = Math.max(Number(page.bodyFont.split("|")[1]) || 0, layout.bodyFont.size);
    if (!face || bodySize <= 0 || face.size >= bodySize - 1)
        return 0;
    let n = 0;
    for (let i = body.length - 1; i >= 0; i--) {
        if (!body[i].trim()) {
            n++;
            continue;
        }
        const hit = find(body[i]);
        if (!hit || hit.family !== face.family || Math.abs(hit.size - face.size) > 0.5)
            break;
        n++;
    }
    // (blank lines taken with the run, never alone)
    while (n > 0 && !body[body.length - n].trim())
        n--;
    return n;
}
