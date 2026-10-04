import { PARAGRAPH_ID_CHARS, slugify } from "./markdown";

export type Section = {
  slug: string;
  title: string;
  html: string;
  /** First printed page the section covers, for the contents listing. */
  page?: string;
  /**
   * The heading level the section split on — 2 for a top-level part, 3 for a
   * subsection. Front matter (no heading) counts as top-level. The contents
   * listing uses this to show which sections nest under which, rather than a
   * flat list a reader has to reverse-engineer from title-casing.
   */
  level: 2 | 3;
};

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

export function splitSections(html: string, minChars = MIN_SECTION_CHARS): Section[] {
  // Split on subsections as well as sections. In a 645-page report a single
  // top-level section can run to a megabyte — larger than the whole document we
  // were trying to break up — and its own subsections are the natural seam.
  const parts = mergeSlivers(html.split(/(?=<h[23]\b)/), minChars);
  const sections: Section[] = [];
  const taken = new Set<string>();

  for (const part of parts) {
    const heading = part.match(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/);

    // Anything before the first heading is front matter for the report.
    const title = heading ? stripTags(withoutSidenotes(heading[2])) : "Front matter";
    if (!part.trim()) continue;

    const base = slugify(title) || "section";
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);

    sections.push({
      slug,
      title,
      html: part,
      page: part.match(/id="page-(\d+)(?:-\d+)?"/)?.[1],
      level: heading ? (Number(heading[1]) as 2 | 3) : 2,
    });
  }

  return sections;
}

/** Which section holds a given paragraph, so a shared link can be routed. */
export function sectionFor(sections: Section[], paragraphId: string): Section | null {
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
export function paragraphIndex(sections: Section[]): Record<string, string> {
  const index: Record<string, string> = {};
  const idPattern = new RegExp(`\\bid="(${PARAGRAPH_ID_CHARS})"`, "gu");

  for (const section of sections) {
    for (const match of section.html.matchAll(idPattern)) {
      if (!(match[1] in index)) index[match[1]] = section.slug;
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
const DIVISION_HEADING =
  /^<h2\b[^>]*>(?:<[^>]+>)*\s*(?:Part|Appendix|Annex|Volume)\s+(?:\d|[IVXLC])/i;
const NUMBERED_SECTION_HEADING = /^<h3\b[^>]*>(?:<[^>]+>)*\s*\d{1,2}\.\d{1,2}\s/;

function isBodylessH2(part: string): boolean {
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
function isH2WithIntro(part: string): boolean {
  const match = part.match(/^<h2\b[^>]*>[\s\S]*?<\/h2>([\s\S]*)$/);
  return match !== null && textLength(match[1]) > 0;
}

function mergeSlivers(parts: string[], minChars: number): string[] {
  const merged: string[] = [];
  // A pending top-level divider, accumulating its chapters until it is a
  // section a reader would recognise as one.
  let divider = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.trim()) continue;

    if (divider) {
      // A divider heads what follows it up to the next top-level heading, never across it: the Speaker's
      // short foreword ("Foreword: Speaker of the House", then its title as an h3) had swallowed the
      // Chairman's whole foreword after it, which then had no section of its own (us-jan6-committee).
      if (/^<h2\b/.test(part)) {
        merged.push(divider);
        divider = "";
        i--;
        continue;
      }
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
    if (merged.length) merged[merged.length - 1] += divider;
    else merged.push(divider);
  }

  // A leading sliver has nothing before it to fold into; fold it forward.
  while (merged.length > 1 && textLength(merged[0]) < minChars) {
    merged[1] = merged[0] + merged[1];
    merged.shift();
  }

  return merged;
}

function textLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

/**
 * A heading that carries a footnote marker renders its note beside it
 * (`withSidenotes`); the title is the heading's words, not the note's. Without
 * this a linked marker on a heading ("…Cigarette[^19]") put the whole note, and its
 * page furniture, into the section's title in the contents and the page head
 * (Philip Morris, reportsthatmatter-y0w9).
 */
function withoutSidenotes(html: string): string {
  return html
    .replace(/<label class="sidenote-toggle"[\s\S]*?<\/label>/g, "")
    .replace(/<input class="sidenote-checkbox"[^>]*>/g, "")
    .replace(/<span class="sidenote[^"]*">[\s\S]*?<\/span>/g, "");
}

function stripTags(value: string): string {
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
