/**
 * Every citable unit in a report's rendered HTML — a paragraph or a
 * top-level list (#12 gave lists their own ids too) — as plain text, for
 * full-text search (#100).
 *
 * The cleanup mirrors `extractParagraph` in src/templates/report.ts: strip
 * the sidenote apparatus and the permalink glyph, decode entities, collapse
 * whitespace. Kept separate rather than shared, because that function looks
 * up one known id at a time (paragraphs only) and this walks a whole section
 * once to find every id — a different enough job to duplicate the handful of
 * cleanup steps rather than force one shape onto both.
 */
import { PARAGRAPH_ID_CHARS } from "./markdown.js";
const CLEANUP_STEPS = [
    [/<span class="sidenote">[\s\S]*?<\/span>/g, ""],
    [/<label class="sidenote-toggle"[\s\S]*?<\/label>/g, ""],
    [/<[^>]+>/g, ""],
    [/&amp;/g, "&"],
    [/&lt;/g, "<"],
    [/&gt;/g, ">"],
    [/&quot;/g, '"'],
    [/&#39;/g, "'"],
    [/¶/g, ""],
    [/\s+/g, " "],
];
function cleanPassageText(innerHtml) {
    let text = innerHtml;
    for (const [pattern, replacement] of CLEANUP_STEPS)
        text = text.replace(pattern, replacement);
    return text.trim();
}
const CITABLE_UNIT = new RegExp(`<(p|ul) id="(${PARAGRAPH_ID_CHARS})"([^>]*)>([\\s\\S]*?)<\\/\\1>`, "gu");
export function extractPassages(html) {
    const passages = [];
    for (const match of html.matchAll(CITABLE_UNIT)) {
        const [, , paragraphId, attrs, inner] = match;
        const text = cleanPassageText(inner);
        if (!text)
            continue;
        const page = attrs.match(/data-page="([^"]+)"/)?.[1] ?? null;
        passages.push({ paragraphId, text, page });
    }
    return passages;
}
