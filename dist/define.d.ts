import type { Pass, VolumePass, BodyPass } from "./passes.js";
import type { PageBreakOptions } from "./pagebreaks.js";
import type { EditionPass } from "./edition.js";
import type { VisionStructurePass } from "./vision/hybrid.js";
export type Volume = {
    path: string;
    sha256?: string;
};
/**
 * One report's build, as a program rather than as data the pipeline
 * interprets.
 *
 * The report owns this file: it names every decision that shaped its text,
 * in one place, and an agent working on that report can read it without
 * understanding any other report's constraints. What it composes is library
 * code, so a fix to a shared pass still reaches every report that calls it.
 */
export type PipelineDef = {
    id: string;
    title: string;
    authors?: string;
    published_at?: string;
    source_url?: string;
    /** Where the source lives, relative to the site repo root. */
    repo: string;
    /**
     * Ordered, and the order is semantic: footnote numbering and page indices
     * run continuously across volumes, so reordering changes the output.
     */
    volumes: Volume[];
    /** How to read each page, and each volume. */
    passes?: Pass[];
};
export type ResolvedPasses = {
    geometry: "per-volume" | "per-page" | "document";
    flushFootnoteMarkers: boolean;
    numberedParagraphs: boolean;
    escapeNumberedParagraphs?: boolean;
    escapeLeadingHash?: boolean;
    paragraphNotes?: boolean;
    chapterContents?: boolean;
    listedHeadings?: boolean;
    unmarkedHeadings?: boolean;
    recoverListedHeadings?: boolean;
    endnotes?: boolean;
    numberedSections?: boolean;
    contentsEntries?: boolean;
    shortSubheads?: boolean;
    shiftedPages?: boolean;
    quoteRunOn?: boolean;
    quoteListRunOns?: boolean;
    /** `layoutPageJoins`: on, with its options. */
    layoutPageJoins?: PageBreakOptions;
    /** `layoutMarkers`: on, with where its notes are. */
    layoutMarkers?: {
        scope: "page" | "document";
        textFallback: boolean;
    };
    unlistedHeadingsMinor?: boolean;
    hangingIndents?: boolean;
    letteredItems?: boolean;
    numberedFindings?: boolean;
    doubleSpaced?: boolean;
    contentsOutline?: boolean;
    listedDivisions?: boolean;
    wrappedHeadings?: boolean;
    pageBreakContinuations?: boolean;
    /** `pageBreakContinuations({ quoteTails: true })`. */
    pageBreakQuoteTails?: boolean;
    citationRunOver?: boolean;
    romanFolios?: boolean;
    numberedOutsideTables?: boolean;
    photoCredits?: boolean;
    footnoteGap?: boolean;
    quoteInset?: number;
    allCapsHeadings: boolean;
    numberedHeadings?: boolean;
    bodyPasses: BodyPass[];
    volumePasses: VolumePass[];
    /**
     * `cleanEdition`: the report's text and structure come from a clean edition;
     * the PDF passes still run, as the shadow ingest that supplies printed pages.
     */
    edition?: EditionPass;
    /**
     * `visionStructure`: block structure from a vision model's verified reading
     * of the page images, on the pages that pass its gate (vision/hybrid.ts).
     */
    vision?: VisionStructurePass;
};
/** Validates a report's definition. Throws rather than ingesting nonsense. */
export declare function pipeline(def: PipelineDef): PipelineDef;
/**
 * Reads a definition's passes into the shape the executor wants.
 *
 * A report that declares nothing gets the single-volume defaults, which is
 * what every report but Leveson had before passes existed.
 */
export declare function resolvePasses(def: PipelineDef): ResolvedPasses;
