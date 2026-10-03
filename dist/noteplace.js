import { mergeFootnotes } from "./footnotes.js";
import { resolveNoteReferences } from "./markdown.js";
/** The notes sit at the foot of the page that cites them (not endnotes, not an edition's own notes). */
export function hasPageNotes(passes) {
    return !(passes ?? []).some((pass) => pass.name === "endnotes" || pass.name === "layoutEndnotes" || pass.name === "edition");
}
function texts(b) {
    if (b.kind === "paragraph" || b.kind === "quote" || b.kind === "heading" || b.kind === "contents")
        return [b.text];
    if (b.kind === "list")
        return b.items;
    return [];
}
export function noteOffPage(
/** The final blocks (`finalBlocks`): markers linked as `[^N]`. */
blocks, footnotes, 
/** How far apart, in pages, a reference and its note may be. */
tolerance = 1) {
    const notes = mergeFootnotes(footnotes.map((n) => ({ ...n })));
    const order = notes.map((n) => String(n.label ?? n.number));
    // `collectNotes`: a definition with no text is not a definition, but it still takes a place in the order
    const defined = new Map();
    notes.forEach((n, i) => {
        if (!n.text.trim())
            return;
        const list = defined.get(order[i]) ?? [];
        list.push(n.pdfIndex === undefined ? null : { volume: n.volume ?? 1, page: n.pdfIndex });
        defined.set(order[i], list);
    });
    const refs = [];
    for (const b of blocks) {
        for (const t of texts(b)) {
            for (const m of t.matchAll(/\[\^(\d+(?:-\d+)?)\]/g)) {
                refs.push(b.at ? { label: m[1], volume: b.at.volume, page: b.at.pdfIndex } : { label: m[1] });
            }
        }
    }
    const aligned = resolveNoteReferences(refs.map((r) => r.label), order);
    const used = new Map();
    const off = [];
    refs.forEach((ref, at) => {
        const list = defined.get(ref.label);
        if (!list?.length)
            return;
        const seen = used.get(ref.label) ?? 0;
        const target = list[Math.min(aligned[at] ?? seen, list.length - 1)];
        used.set(ref.label, seen + 1);
        if (!target || ref.volume === undefined)
            return;
        if (target.volume !== ref.volume || Math.abs(target.page - ref.page) > tolerance) {
            off.push({ volume: ref.volume, page: ref.page, label: ref.label, definedVolume: target.volume, definedPage: target.page });
        }
    });
    return off;
}
