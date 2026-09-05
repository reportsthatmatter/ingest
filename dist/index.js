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
// — What a report declares —
export { pipeline, resolvePasses } from "./define.js";
export { printedPageNumber, footnoteBlock, flushFootnoteMarkers, runningFurniture, geometry, columns, quoteInset, } from "./passes.js";
export { detectGutter, splitColumns } from "./columns.js";
// — Running a build —
export { extractPages, normaliseWhitespace } from "./extract.js";
export { ingest, ingestPages, ingestPageGroups } from "./pipeline.js";
export { resolveVolume, checkVolume, fileChecksum } from "./volumes.js";
// — Checking a build —
export { runChecks, structuralChecks, losslessCheck, retentionCheck, severedSentenceCheck, } from "./fidelity.js";
export { computeBaseline, diffBaselines } from "./baseline.js";
export { EXPECTED_POPPLER, popplerVersion, popplerWarning } from "./poppler.js";
// — Human corrections —
export { parseCorrections, parseDismissals, applyCorrections, correctionVocabulary, } from "./corrections.js";
export { rejoinHyphenated, vocabulary } from "./hyphens.js";
// — Building a bespoke pass —
export { takePrintedNumber, splitFootnoteBlock, bodyIndent } from "./passes.js";
export { linkFlushMarkers, linkInlineMarkers } from "./footnotes.js";
// — Rendering: markdown → the content a report publishes —
export { renderArtifacts } from "./render.js";
export { renderMarkdown, paragraphId, slugify } from "./markdown.js";
export { splitSections, sectionFor, paragraphIndex } from "./sections.js";
export { extractPassages } from "./passages.js";
