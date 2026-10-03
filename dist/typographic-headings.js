import { foldForMatch } from "./markers.js";
const SENTENCE_END = /[.,;:]$|[.,;:][”’'")\]]$/;
/** A bare number or paragraph label ("2.4.20", "(b)"): never a heading. */
const LABEL_ONLY = /^\s*(?:\(?\d{1,4}(?:\.\d{1,4})*[.)]?|\(?[a-z][.)]|[ivxlc]{1,5}[.)]|[•·▪–-])\s*$/i;
/** A heading line's candidacy, before the face's recurrence is known. */
function candidate(line, bodySize, o) {
    const text = line.text.trim();
    if (!text || text.length > o.maxChars)
        return false;
    if (line.body || line.italic)
        return false;
    if (bodySize <= 0 || line.size < o.minRatio * bodySize)
        return false;
    if (LABEL_ONLY.test(text) || !/\p{L}/u.test(text))
        return false;
    if (SENTENCE_END.test(text))
        return false;
    return true;
}
/** The face key without a bold marker's suffix order mattering: `family|size|color[|b]`. */
const faceSize = (face) => Number(face.split("|")[1]) || 0;
/**
 * The heading lines of the layout, wrapped lines joined, each with its level.
 * Exported for the tests.
 */
export function layoutHeadings(layout, options = {}) {
    const o = {
        firstLevel: options.firstLevel ?? 2,
        minRatio: options.minRatio ?? 1.15,
        maxChars: options.maxChars ?? 160,
        minPages: options.minPages ?? 3,
        minLines: options.minLines ?? 5,
    };
    // candidates by face, with the pages each face is set on
    const byFace = new Map();
    const perPage = [];
    for (let volume = 1; volume <= layout.volumes; volume++) {
        for (const page of layout.pages(volume)) {
            const lines = layout.lines(volume, page);
            const pageBody = Number(layout.page(volume, page)?.bodyFont.split("|")[1]) || 0;
            const bodySize = Math.max(pageBody, layout.bodyFont.size);
            const cands = lines.filter((l) => candidate(l, bodySize, o));
            perPage.push({ volume, page, lines, cands });
            for (const l of cands) {
                const entry = byFace.get(l.font) ?? { lines: 0, pages: new Set() };
                entry.lines++;
                entry.pages.add(`${volume}:${page}`);
                byFace.set(l.font, entry);
            }
        }
    }
    const ranked = [...byFace]
        .filter(([, e]) => e.lines >= o.minLines && e.pages.size >= o.minPages)
        .sort((a, b) => faceSize(b[0]) - faceSize(a[0]) || Number(b[0].endsWith("|b")) - Number(a[0].endsWith("|b")) || b[1].lines - a[1].lines);
    const levels = new Map(ranked.map(([face], i) => [face, Math.min(6, o.firstLevel + i)]));
    const faces = ranked.map(([face, e]) => ({ face, level: levels.get(face), lines: e.lines, pages: e.pages.size }));
    const headings = [];
    for (const { volume, page, lines, cands } of perPage) {
        const heading = cands.filter((l) => levels.has(l.font));
        // consecutive lines of one face, one line-height apart, are one wrapped heading
        for (let i = 0; i < heading.length; i++) {
            const first = heading[i];
            let text = first.text.trim();
            let last = first;
            while (i + 1 < heading.length) {
                const next = heading[i + 1];
                const adjacent = lines.indexOf(next) === lines.indexOf(last) + 1;
                if (next.font !== first.font || !adjacent || next.top - last.top > 1.8 * last.height)
                    break;
                text += ` ${next.text.trim()}`;
                last = next;
                i++;
            }
            headings.push({ volume, pdfIndex: page, text, level: levels.get(first.font) });
        }
    }
    return { headings, faces };
}
/** The text without spaces and with the spelling variants folded, and each character's index in the original. */
function squash(s) {
    const folded = foldForMatch(s);
    let text = "";
    const from = [];
    for (let i = 0; i < folded.text.length; i++) {
        if (/\s/.test(folded.text[i]))
            continue;
        text += folded.text[i].toLowerCase();
        from.push(folded.from[i]);
    }
    return { text, from };
}
const SPLITTABLE = (b) => b.kind === "paragraph" || b.kind === "quote";
/**
 * Cuts each heading the layout shows out of the blocks of its page, in place. A block that opens on
 * the heading's words, or holds them after the end of a sentence, becomes (the text before it), the
 * heading, and (the text after it). A block that is already that heading stays as it is.
 */
export function applyTypographicHeadings(blocks, layout, options = {}) {
    const { headings, faces } = layoutHeadings(layout, options);
    const stats = { faces, headings: headings.length, split: 0, already: 0, unplaced: 0, misses: [], added: [] };
    const pageOf = (b) => (b.at ? `${b.at.volume ?? 1}:${b.at.pdfIndex}` : undefined);
    const byPage = new Map();
    for (const h of headings) {
        const key = `${h.volume}:${h.pdfIndex}`;
        byPage.set(key, [...(byPage.get(key) ?? []), h]);
    }
    const out = [];
    let i = 0;
    while (i < blocks.length) {
        const key = pageOf(blocks[i]);
        if (!key || !byPage.has(key)) {
            out.push(blocks[i++]);
            continue;
        }
        // this page's run of blocks
        let j = i;
        while (j < blocks.length && pageOf(blocks[j]) === key)
            j++;
        const pageBlocks = blocks.slice(i, j);
        const todo = byPage.get(key);
        out.push(...cutPage(pageBlocks, todo, stats));
        i = j;
    }
    blocks.splice(0, blocks.length, ...out);
    return stats;
}
function cutPage(pageBlocks, todo, stats) {
    let units = pageBlocks;
    let from = 0; // blocks before this index are done: headings run in reading order
    for (const h of todo) {
        const want = squash(h.text).text;
        const miss = () => {
            stats.unplaced++;
            stats.misses.push({ volume: h.volume, pdfIndex: h.pdfIndex, text: h.text });
        };
        if (want.length < 3) {
            miss();
            continue;
        }
        let placed = false;
        for (let k = from; k < units.length && !placed; k++) {
            const block = units[k];
            if (block.kind === "heading") {
                if (squash(block.text).text.startsWith(want) || want.startsWith(squash(block.text).text)) {
                    stats.already++;
                    from = k + 1;
                    placed = true;
                }
                continue;
            }
            if (!SPLITTABLE(block))
                continue;
            const hay = squash(block.text);
            // at the start of the block, or after the end of a sentence (or a note marker) inside it
            let at = hay.text.indexOf(want);
            while (at >= 0) {
                const start = hay.from[at];
                const end = hay.from[at + want.length - 1] + 1;
                const before = block.text.slice(0, start).trimEnd();
                const boundary = at === 0 || /[.!?”’'")\]]$/.test(before);
                // the words must end where a word ends
                const wordEnd = end >= block.text.length || /^\s/.test(block.text.slice(end));
                if (boundary && wordEnd) {
                    const after = block.text.slice(end).trimStart();
                    const pieces = [];
                    const { text: _t, ...rest } = block;
                    if (before)
                        pieces.push({ ...block, text: before });
                    pieces.push({ kind: "heading", level: h.level, text: h.text, layoutHeading: true, ...(block.at ? { at: block.at } : {}), ...(block.source ? { source: block.source } : {}) });
                    if (after)
                        pieces.push({ ...rest, kind: block.kind, text: after });
                    units = [...units.slice(0, k), ...pieces, ...units.slice(k + 1)];
                    from = k + pieces.length - (after ? 1 : 0);
                    stats.split++;
                    stats.added.push({ volume: h.volume, pdfIndex: h.pdfIndex, level: h.level, text: h.text, before: before.slice(-40), after: after.slice(0, 40) });
                    placed = true;
                    break;
                }
                at = hay.text.indexOf(want, at + 1);
            }
        }
        if (!placed)
            miss();
    }
    return units;
}
