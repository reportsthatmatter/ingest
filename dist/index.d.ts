/**
 * The library's public surface.
 *
 * Two audiences. A **report** imports `pipeline` and the passes to declare how
 * it is built, and `renderArtifacts` to turn the markdown that produces into
 * the content it publishes. A **host** — the site repo's CLI — imports the
 * runner and the checks, to execute that declaration over a corpus.
 *
 * Everything not exported here is internal and free to change. See README.md
 * for what a pass is and when one gets promoted into the library.
 */
export { pipeline, resolvePasses } from "./define.js";
export type { PipelineDef, Volume, ResolvedPasses } from "./define.js";
export { printedPageNumber, footnoteBlock, flushFootnoteMarkers, runningFurniture, geometry, columns, quoteInset, } from "./passes.js";
export type { Pass, PagePass, BodyPass, VolumePass, GeometryPass, QuoteInsetPass, } from "./passes.js";
export { detectGutter, splitColumns } from "./columns.js";
export type { Gutter } from "./columns.js";
export { extractPages, normaliseWhitespace } from "./extract.js";
export type { Page } from "./extract.js";
export { ingest, ingestPages, ingestPageGroups } from "./pipeline.js";
export type { IngestResult, Metadata } from "./pipeline.js";
export { resolveVolume, checkVolume, fileChecksum } from "./volumes.js";
export { runChecks, structuralChecks, losslessCheck, retentionCheck, severedSentenceCheck, } from "./fidelity.js";
export type { Check } from "./fidelity.js";
export { computeBaseline, diffBaselines } from "./baseline.js";
export type { Baseline } from "./baseline.js";
export { EXPECTED_POPPLER, popplerVersion, popplerWarning } from "./poppler.js";
export { parseCorrections, parseDismissals, applyCorrections, correctionVocabulary, } from "./corrections.js";
export { rejoinHyphenated, vocabulary } from "./hyphens.js";
export type { Correction, Dismissal } from "./corrections.js";
export { takePrintedNumber, splitFootnoteBlock, bodyIndent } from "./passes.js";
export type { SplitPage } from "./clean.js";
export type { Block, Provenance } from "./paragraphs.js";
export { linkFlushMarkers, linkInlineMarkers } from "./footnotes.js";
export type { Footnote } from "./footnotes.js";
export type { Suspect } from "./ocr.js";
export { renderArtifacts } from "./render.js";
export type { RenderedArtifacts, ReportMeta, SectionSummary } from "./render.js";
export { renderMarkdown, paragraphId, slugify } from "./markdown.js";
export { splitSections, sectionFor, paragraphIndex } from "./sections.js";
export type { Section } from "./sections.js";
export { extractPassages } from "./passages.js";
export type { Passage } from "./passages.js";
