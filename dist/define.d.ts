import type { Pass, VolumePass, BodyPass } from "./passes";
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
    geometry: "per-volume" | "document";
    flushFootnoteMarkers: boolean;
    quoteInset?: number;
    bodyPasses: BodyPass[];
    volumePasses: VolumePass[];
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
