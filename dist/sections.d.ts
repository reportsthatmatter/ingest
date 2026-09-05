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
export declare function splitSections(html: string, minChars?: number): Section[];
/** Which section holds a given paragraph, so a shared link can be routed. */
export declare function sectionFor(sections: Section[], paragraphId: string): Section | null;
/**
 * Every paragraph id in the document, mapped to the slug of its section.
 *
 * `sectionFor` needs each section's full `html` to answer the same question,
 * which is fine when a request already has it loaded — and too much to fetch
 * just to route a `?p=` link when the pre-rendered path (#115) keeps html out
 * of the small per-report metadata. This is the version of the lookup that
 * only needs ids, computed once at build time from the same sections.
 */
export declare function paragraphIndex(sections: Section[]): Record<string, string>;
