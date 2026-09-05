/**
 * Markdown → the artifact set a report publishes.
 *
 * This is the stage that used to live in the site repo, which meant paragraph
 * ids — the product, and the thing a citation resolves through — were
 * generated one stage *downstream* of anything a report had a pin on. An edit
 * there could repoint every citation in the archive, and no report's
 * `baseline.json` covered it. Here, an id-affecting change is a versioned
 * release each report adopts deliberately, exactly as a pipeline change is.
 *
 * What comes out is content and only content: no layout, no site chrome. The
 * app owns the page, the report owns the text
 * (docs/plans/2026-09-04-content-publishing.md §2 in the site repo).
 */
import { renderMarkdown } from "./markdown.js";
import { splitSections, paragraphIndex } from "./sections.js";
function wordCount(html) {
    return html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
}
export function renderArtifacts(markdown) {
    const html = renderMarkdown(markdown);
    const sections = splitSections(html);
    const fragments = {};
    for (const section of sections)
        fragments[section.slug] = section.html;
    return {
        meta: {
            words: wordCount(html),
            sections: sections.map(({ html: _html, ...rest }) => rest),
            paragraphToSection: paragraphIndex(sections),
        },
        fullBody: html,
        fragments,
    };
}
