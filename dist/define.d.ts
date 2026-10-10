import type { Pass, VolumePass, BodyPass, FootnoteReset } from "./passes.js";
import type { PageHeadFolio } from "./clean.js";
import type { PageBreakOptions } from "./pagebreaks.js";
import type { EditionPass } from "./edition.js";
import type { VisionStructurePass } from "./vision/hybrid.js";
import type { TypographicHeadingsOptions } from "./typographic-headings.js";
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
        scope: "page" | "document" | "chapter";
        textFallback: boolean;
    };
    /** `layoutEndnotes`: notes sections read off the layout, labelled by chapter. */
    layoutEndnotes?: boolean;
    /** `typographicHeadings`: on, with its options. */
    typographicHeadings?: TypographicHeadingsOptions;
    unlistedHeadingsMinor?: boolean;
    hangingIndents?: boolean;
    letteredItems?: boolean;
    numberedOpenings?: boolean;
    numberedFindings?: boolean;
    doubleSpaced?: boolean;
    contentsOutline?: boolean;
    /** `contentsOutline({ scanned: true })`: a heading the OCR misspelt is matched to its entry by a few letters' difference. */
    contentsOutlineScanned?: boolean;
    /** `contentsOutline({ centredMinor: true })`: a centred heading the outline does not number is a level-4 subhead. */
    contentsOutlineCentredMinor?: boolean;
    listedDivisions?: boolean;
    wrappedHeadings?: boolean;
    pageBreakContinuations?: boolean;
    /** `pageBreakContinuations({ quoteTails: true })`. */
    pageBreakQuoteTails?: boolean;
    citationRunOver?: boolean;
    /** `noteFaceRunOver`: a run-over set in the notes' face is read off the layout. */
    noteFaceRunOver?: boolean;
    /** `holdNoteSequence`: a page whose notes all fall below the expected number leaves it where it was. */
    holdNoteSequence?: boolean;
    /** `footnoteResets`: the pages where the note numbering starts over, and at which number. */
    footnoteResets?: FootnoteReset[];
    romanFolios?: boolean;
    parenFolios?: boolean;
    /** `pageHeadFolios`: on, with the line that goes with the "Page N" head. */
    pageHeadFolios?: PageHeadFolio;
    foliosInStep?: boolean;
    numberedOutsideTables?: boolean;
    photoCredits?: boolean;
    footnoteGap?: boolean;
    /** `sequencedNoteOpenings`: a note line opening on the next note's number starts it, whatever follows. */
    sequencedNoteOpenings?: boolean;
    /** `footnoteRestarts`: a page-foot numbering that starts over at 1 is read without corroboration. */
    footnoteRestarts?: boolean;
    /** `footnoteNumbers`: how page-foot notes are numbered. */
    footnoteNumbers?: "bare" | "period" | "tabbed";
    /** `pdfPageNumbers`: each page is numbered by its place in its PDF. */
    pdfPageNumbers?: boolean;
    /** `layoutRunOvers`: a note's run-over at the end of a page's body, read by its smaller face. */
    layoutRunOvers?: boolean;
    /** `asteriskBreaks`: a line of asterisks is a block of its own. */
    asteriskBreaks?: boolean;
    /** `foiaRedactions`: a FOIA release's box labels marked as redactions, its margin labels taken out. */
    foiaRedactions?: boolean;
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
 * The names of the `stage: "page"` passes this library reads. A page pass does nothing by being in the list: it
 * is a flag `resolvePasses` looks up by name, so a name nobody looks up is a pass that silently never runs
 * (reportsthatmatter-5xln: a report declared `typographicHeadings` under a library that predated it, and its
 * output came out byte-identical). `tests/resolve-passes.test.ts` builds every exported page pass and checks it
 * is named here, so a new pass cannot be added without being added to this list.
 * It also names the page passes of ingest#62 (parenFolios, pageHeadFolios, foliosInStep), #63 (pdfPageNumbers) and
 * #64 (footnoteRestarts, sequencedNoteOpenings), opened alongside this one: without them a report declaring one would
 * throw once all are merged (review v0.23.0).
 */
export declare const KNOWN_PAGE_PASSES: ReadonlySet<string>;
/**
 * Reads a definition's passes into the shape the executor wants.
 *
 * A report that declares nothing gets the single-volume defaults, which is
 * what every report but Leveson had before passes existed.
 */
export declare function resolvePasses(def: PipelineDef): ResolvedPasses;
