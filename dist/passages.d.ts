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
export type Passage = {
    paragraphId: string;
    text: string;
    /** The printed page, from the paragraph's `data-page` attribute (src/lib/markdown.ts). */
    page: string | null;
};
export declare function extractPassages(html: string): Passage[];
