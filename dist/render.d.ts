import { type Section } from "./sections";
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
export declare function renderArtifacts(markdown: string): RenderedArtifacts;
