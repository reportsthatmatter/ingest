export type FrontMatter = Record<string, unknown>;
/**
 * Splits leading YAML front matter off a markdown document.
 * Ingested reports carry their metadata this way, and it must never reach the
 * renderer — otherwise it prints as the opening paragraph of the report.
 */
export declare function splitFrontMatter(source: string): {
    data: FrontMatter;
    content: string;
};
/**
 * A durable id for a paragraph, derived from its own opening words.
 *
 * Positional ids (`p-1`, `p-2`, …) look stable and are not: re-ingesting a
 * report to fix one OCR error renumbers everything after it, so every link
 * ever shared keeps resolving but now points at different text. Deriving the id
 * from the text means a paragraph keeps its address as long as its words do,
 * and a link that *does* break is visibly wrong rather than quietly wrong.
 *
 * It also reads better in a URL, which matters when the URL is the product:
 * `#rioters-at-the-capitol-had-been` over `#p-318`.
 */
export declare function paragraphId(text: string, taken: Set<string>): string;
/**
 * Renders report markdown to HTML.
 *
 * Top-level paragraphs get a text-derived id and a permalink anchor. Page
 * markers left by the ingestion pipeline become anchors of their own, so a
 * passage can also be cited the way these documents are normally cited — by the
 * printed page it appears on.
 */
export declare function renderMarkdown(markdown: string): string;
/** The collected `## Notes` block, which sidenotes replace in the body. */
export declare function stripNotesSection(markdown: string): string;
/**
 * `[^12]: text` definitions, keyed by number, in document order.
 *
 * More than one per number is the case this exists to handle: a report whose
 * footnote numbering restarts (Leveson: per chapter) writes several
 * genuinely different notes under the same label (`footnotes.ts`'s
 * `renderEndnotes`). `withSidenotes` resolves each `[^N]` reference against
 * these positionally — the first `[^20]` in the body to this number's first
 * definition, the second to its second, and so on — rather than a single
 * shared lookup that let one chapter's reference resolve to another's text.
 */
export declare function collectNotes(markdown: string): Map<string, string[]>;
/**
 * Turns footnote references into sidenotes.
 *
 * A footnote you have to travel to is a footnote you don't read. These reports
 * are mostly citation, and the citation is the evidence — so the note belongs
 * beside the sentence it supports, not 70 KB away at the end of the document.
 *
 * The markup degrades honestly: the reference is still a link to the collected
 * note, so it works without CSS, without JavaScript, and on a narrow screen
 * where there is no margin to put a sidenote in.
 */
export declare function withSidenotes(html: string, notes: Map<string, string[]>): {
    html: string;
    used: Map<string, number>;
};
/** Headings get slug ids so a section can be linked as well as a paragraph. */
export declare function slugify(text: string): string;
