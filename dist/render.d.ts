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
import { type IdUnit } from "./markdown.js";
import { type Section } from "./sections.js";
/** A section as the contents page needs it — everything but the html. */
export type SectionSummary = Omit<Section, "html">;
export type ReportMeta = {
    words: number;
    pages?: number;
    sections: SectionSummary[];
    /** Which section holds each citable paragraph, so a `?p=` link can be routed. */
    paragraphToSection: Record<string, string>;
};
/** Everything a report publishes, and nothing else. */
export type RenderedArtifacts = {
    meta: ReportMeta;
    /** The whole report's body. Stored so `/full` is one read, not one per section. */
    fullBody: string;
    /** One section's body, keyed by slug. */
    fragments: Record<string, string>;
};
/**
 * A paragraph id already published, and where: the section it was served in and its text's
 * `paragraphFingerprint`. See `renderArtifacts`' `reserved` option.
 */
export type ReservedId = {
    id: string;
    section: string;
    fingerprint?: string;
};
export type RenderOptions = {
    /**
     * Published ids, highest priority first (oldest first: the meaning a link was made with). Each
     * keeps the paragraph it named when that paragraph is still in the same section, so a new
     * paragraph whose text asks for the same id (a repeated "Key Messages", a second reference to
     * the same author and year) is suffixed instead of taking it (reportsthatmatter-efso, site
     * decision 0012). A reservation whose paragraph cannot be found constrains nothing.
     */
    reserved?: readonly ReservedId[];
};
/** A short, stable hash of a passage's text (as `extractPassages` gives it), words only, case-folded. */
export declare function paragraphFingerprint(text: string): string;
/**
 * Which reading-order units must carry which reserved id. Empty when the plain pass already gives
 * every matched reservation its own paragraph, so a report whose ids never moved renders exactly
 * as without reservations.
 *
 * Each reservation is matched, in priority order, to a unit in the same section whose text asks
 * for that id's family (`base`, `base-N`): first one with the same text fingerprint, then (a
 * paragraph corrected since) the first left in that section.
 */
export declare function reservedAssignments(units: readonly IdUnit[], sections: readonly Section[], reserved: readonly ReservedId[]): Map<number, string>;
export declare function renderArtifacts(markdown: string, options?: RenderOptions): RenderedArtifacts;
