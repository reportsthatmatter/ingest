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
export { pipeline, resolvePasses } from "./define";
export type { PipelineDef, Volume, ResolvedPasses } from "./define";
export { printedPageNumber, footnoteBlock, flushFootnoteMarkers, runningFurniture, geometry, columns, quoteInset, } from "./passes";
export type { Pass, PagePass, BodyPass, VolumePass, GeometryPass, QuoteInsetPass, } from "./passes";
export { detectGutter, splitColumns } from "./columns";
export type { Gutter } from "./columns";
export { extractPages, normaliseWhitespace } from "./extract";
export type { Page } from "./extract";
export { ingest, ingestPages, ingestPageGroups } from "./pipeline";
export type { IngestResult, Metadata } from "./pipeline";
export { resolveVolume, checkVolume, fileChecksum } from "./volumes";
export { runChecks, structuralChecks, losslessCheck, retentionCheck, severedSentenceCheck, } from "./fidelity";
export type { Check } from "./fidelity";
export { computeBaseline, diffBaselines } from "./baseline";
export type { Baseline } from "./baseline";
export { EXPECTED_POPPLER, popplerVersion, popplerWarning } from "./poppler";
export { parseCorrections, parseDismissals, applyCorrections, correctionVocabulary, } from "./corrections";
export { rejoinHyphenated, vocabulary } from "./hyphens";
export type { Correction, Dismissal } from "./corrections";
export { takePrintedNumber, splitFootnoteBlock, bodyIndent } from "./passes";
export type { SplitPage } from "./clean";
export type { Block, Provenance } from "./paragraphs";
export { linkFlushMarkers, linkInlineMarkers } from "./footnotes";
export type { Footnote } from "./footnotes";
export type { Suspect } from "./ocr";
export { renderArtifacts } from "./render";
export type { RenderedArtifacts, ReportMeta, SectionSummary } from "./render";
export { renderMarkdown, paragraphId, slugify } from "./markdown";
export { splitSections, sectionFor, paragraphIndex } from "./sections";
export type { Section } from "./sections";
export { extractPassages } from "./passages";
export type { Passage } from "./passages";
