/**
 * The ingestion library's public surface.
 *
 * Two audiences. A **report** imports `pipeline` and the passes, to declare
 * how it is built. A **host** — the site repo's CLI — imports the runner and
 * the checks, to execute that declaration over a corpus.
 *
 * Everything not exported here is internal and free to change. See README.md
 * for what a pass is and when one gets promoted into the library.
 */

// — What a report declares —
export { pipeline, resolvePasses } from "./define";
export type { PipelineDef, Volume, ResolvedPasses } from "./define";
export { printedPageNumber, footnoteBlock, runningFurniture, geometry } from "./passes";
export type { Pass, PagePass, VolumePass, GeometryPass } from "./passes";

// — Running a build —
export { extractPages, normaliseWhitespace } from "./extract";
export type { Page } from "./extract";
export { ingest, ingestPages, ingestPageGroups } from "./pipeline";
export type { IngestResult, Metadata } from "./pipeline";
export { resolveVolume, checkVolume, fileChecksum } from "./volumes";

// — Checking a build —
export { runChecks, structuralChecks, losslessCheck, retentionCheck } from "./fidelity";
export type { Check } from "./fidelity";
export { computeBaseline, diffBaselines } from "./baseline";
export type { Baseline } from "./baseline";
export { EXPECTED_POPPLER, popplerVersion, popplerWarning } from "./poppler";

// — Human corrections —
export { parseCorrections, applyCorrections, correctionVocabulary } from "./corrections";
export type { Correction } from "./corrections";

// — Building a bespoke pass —
export { takePrintedNumber, splitFootnoteBlock, bodyIndent } from "./passes";
export type { SplitPage } from "./clean";
export type { Block, Provenance } from "./paragraphs";
export type { Footnote } from "./footnotes";
export type { Suspect } from "./ocr";
