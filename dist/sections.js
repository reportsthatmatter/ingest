import { PARAGRAPH_ID_CHARS, slugify } from "./markdown.js";
/**
 * Splits a rendered report into its own top-level sections.
 *
 * The split happens on the *rendered* HTML rather than the markdown so that
 * paragraph ids are identical to the ones on `/full`. Ids are de-duplicated
 * across the whole document, so rendering sections independently would give
 * some of them different addresses depending on which page they were served
 * from — and an address that depends on the route is not an address.
 */
/**
 * Below this much text a "section" is a title-page fragment, not a section.
 * The PSI report's cover names each staff member on its own line, and every
 * one of them parses as a heading.
 */
const MIN_SECTION_CHARS = 2500;
export function splitSections(html, minChars = MIN_SECTION_CHARS) {
    // Split on subsections as well as sections. In a 645-page report a single
    // top-level section can run to a megabyte — larger than the whole document we
    // were trying to break up — and its own subsections are the natural seam.
    const parts = mergeSlivers(html.split(/(?=<h[23]\b)/), minChars);
    const sections = [];
    const taken = new Set();
    for (const part of parts) {
        const heading = part.match(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/);
        // Anything before the first heading is front matter for the report.
        const title = heading ? stripTags(heading[2]) : "Front matter";
        if (!part.trim())
            continue;
        const base = slugify(title) || "section";
        let slug = base;
        for (let n = 2; taken.has(slug); n++)
            slug = `${base}-${n}`;
        taken.add(slug);
        sections.push({
            slug,
            title,
            html: part,
            page: part.match(/id="page-(\d+)(?:-\d+)?"/)?.[1],
            level: heading ? Number(heading[1]) : 2,
        });
    }
    return sections;
}
/** Which section holds a given paragraph, so a shared link can be routed. */
export function sectionFor(sections, paragraphId) {
    const needle = `id="${paragraphId}"`;
    return sections.find((section) => section.html.includes(needle)) ?? null;
}
/**
 * Every paragraph id in the document, mapped to the slug of its section.
 *
 * `sectionFor` needs each section's full `html` to answer the same question,
 * which is fine when a request already has it loaded — and too much to fetch
 * just to route a `?p=` link when the pre-rendered path (#115) keeps html out
 * of the small per-report metadata. This is the version of the lookup that
 * only needs ids, computed once at build time from the same sections.
 */
export function paragraphIndex(sections) {
    const index = {};
    const idPattern = new RegExp(`\\bid="(${PARAGRAPH_ID_CHARS})"`, "gu");
    for (const section of sections) {
        for (const match of section.html.matchAll(idPattern)) {
            if (!(match[1] in index))
                index[match[1]] = section.slug;
        }
    }
    return index;
}
/**
 * Folds a too-short part into the one before it, so the contents lists sections
 * a reader would recognise as sections. The heading survives in the body, so
 * nothing is hidden — it just stops being a page of its own.
 *
 * Three exceptions, each a heading with no body of its own that must not fold
 * *backwards* into the part before it, or the contents page loses it
 * entirely and lists what follows with nothing above it. Both fold forwards
 * instead, onto what comes after, and head that section:
 *
 * - A numbered-division heading — an inquiry's "Part 4:" divider, followed
 *   straight away by its first chapter.
 * - A chapter heading with opening paragraphs before its first ### (n9em),
 *   which would otherwise file the chapter's opening under the previous one.
 * - A chapter banner in a report whose sections are numbered
 *   (`numberedSections()`, reportsthatmatter-u88): the banner carries no text
 *   of its own before its first numbered section ("8" then "8.1 The Summer of
 *   Threat"), and folding it backwards put it at the *foot* of the previous
 *   chapter's last section instead. Detected structurally — an h2 with
 *   nothing before the next heading, immediately followed by an h3 numbered
 *   "N.N " — so this only ever fires on a document shaped that way, not on
 *   report identity.
 */
const DIVISION_HEADING = /^<h2\b[^>]*>(?:<[^>]+>)*\s*(?:Part|Appendix|Annex|Volume)\s+(?:\d|[IVXLC])/i;
const NUMBERED_SECTION_HEADING = /^<h3\b[^>]*>(?:<[^>]+>)*\s*\d{1,2}\.\d{1,2}\s/;
function isBodylessH2(part) {
    const match = part.match(/^<h2\b[^>]*>[\s\S]*?<\/h2>([\s\S]*)$/);
    return match !== null && textLength(match[1]) === 0;
}
/**
 * An h2 followed by some text, then (in the next part) an h3: a chapter's
 * opening paragraphs before its first subsection. reportsthatmatter-n9em: the
 * 9/11 Commission's chapter 1 opens "WE HAVE SOME PLANES" with two paragraphs
 * before "1.1", and as a sliver they folded backwards onto the preface, so the
 * chapter's opening, and its heading, were filed under the previous section.
 * Like a banner, the chapter heading and its intro fold forward onto its first
 * subsection and head that section.
 */
function isH2WithIntro(part) {
    const match = part.match(/^<h2\b[^>]*>[\s\S]*?<\/h2>([\s\S]*)$/);
    return match !== null && textLength(match[1]) > 0;
}
function mergeSlivers(parts, minChars) {
    const merged = [];
    // A pending top-level divider, accumulating its chapters until it is a
    // section a reader would recognise as one.
    let divider = "";
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part.trim())
            continue;
        if (divider) {
            divider += part;
            if (textLength(divider) >= minChars) {
                merged.push(divider);
                divider = "";
            }
            continue;
        }
        const chapterBanner = isBodylessH2(part) && NUMBERED_SECTION_HEADING.test(parts[i + 1] ?? "");
        const chapterIntro = isH2WithIntro(part) && /^<h3\b/.test(parts[i + 1] ?? "");
        if ((chapterBanner || chapterIntro || DIVISION_HEADING.test(part)) && textLength(part) < minChars) {
            divider = part;
            continue;
        }
        if (merged.length && textLength(part) < minChars) {
            merged[merged.length - 1] += part;
            continue;
        }
        merged.push(part);
    }
    if (divider) {
        if (merged.length)
            merged[merged.length - 1] += divider;
        else
            merged.push(divider);
    }
    // A leading sliver has nothing before it to fold into; fold it forward.
    while (merged.length > 1 && textLength(merged[0]) < minChars) {
        merged[1] = merged[0] + merged[1];
        merged.shift();
    }
    return merged;
}
function textLength(html) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}
function stripTags(value) {
    // Decode as well as strip: the title is re-escaped when it is written back
    // out, and without decoding first an ampersand becomes &amp;amp;.
    return value
        .replace(/<[^>]+>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}
