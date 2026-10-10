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
export { printedPageNumber, footnoteBlock, flushFootnoteMarkers, numberedParagraphs, escapeNumberedParagraphs, escapeLeadingHash, paragraphNotes, chapterContents, listedHeadings, unlistedHeadingsMinor, hangingIndents, letteredItems, numberedOpenings, unmarkedHeadings, recoverListedHeadings, endnotes, layoutEndnotes, numberedSections, contentsEntries, shortSubheads, shiftedPages, quoteRunOn, quoteListRunOns, layoutPageJoins, layoutMarkers, typographicHeadings, numberedFindings, doubleSpaced, contentsOutline, noteFaceRunOver, listedDivisions, wrappedHeadings, pageBreakContinuations, citationRunOver, holdNoteSequence, footnoteResets, romanFolios, parenFolios, pageHeadFolios, foliosInStep, foiaRedactions, asteriskBreaks, layoutRunOvers, numberedOutsideTables, photoCredits, hyphenFragments, divisionLabels, speakerTurns, footnoteGap, footnoteRestarts, thumbIndexNotes, strandedMarkers, sequencedNoteOpenings, footnoteNumbers, pdfPageNumbers, runningFurniture, furnitureFaces, figureFaces, geometry, columns, quoteInset, allCapsHeadings, numberedHeadings, } from "./passes.js";
export { detectGutter, splitColumns } from "./columns.js";
// — A clean edition as the source (the hybrid mode, edition.ts) —
export { cleanEdition, inlineMarkdown, inlineText, escapeInline, assembleEdition, fillGaps } from "./edition.js";
export { htmlEvents, decodeEntities } from "./html.js";
// — Block structure from a vision model's verified page reading (vision/hybrid.ts) —
export { visionStructure, visionPage, readPack, renderVisionReport } from "./vision/hybrid.js";
export { parseDoctags } from "./vision/doctags.js";
export { verifyPage, verifyWithLayout, rejoinLineHyphens } from "./vision/verify.js";
// Monotone word alignment (promoted from the site's scorer, src/lib/score)
export { align } from "./align.js";
export { tokens, words, fold, tokensBefore, hasLetter } from "./tokens.js";
export { linkLayoutMarkers, foldForMatch } from "./markers.js";
export { pageDefinesNotes } from "./markers.js";
export { applyTypographicHeadings, layoutHeadings } from "./typographic-headings.js";
// — Running a build —
export { extractPages, normaliseWhitespace } from "./extract.js";
export { ingest, ingestPages, ingestPageGroups } from "./pipeline.js";
export { resolveVolume, checkVolume, fileChecksum } from "./volumes.js";
// — Checking a build —
export { runChecks, structuralChecks, losslessCheck, retentionCheck, severedSentenceCheck, pageBreakSplits, digitDensityCheck, } from "./fidelity.js";
export { computeBaseline, diffBaselines } from "./baseline.js";
export { openLayout, buildLayout, parseLayoutXml, layoutXml, indentVersus } from "./layout.js";
export { decidePageBreak, findPageBreakLines, layoutJoins, pageBreakKey, isJustified, sameFace, letters } from "./pagebreaks.js";
export { pageBreakCache, readPageBreakCache, writePageBreakCache, isCachedReferee, refereeEntry, describeCase, refereeRequests, parseRefereeAnswers, refereePageBreaks, refereeCost, REFEREE_SYSTEM, REFEREE_PROMPT_ID, REFEREE_PRICES, requestHash, replayTransport, recordingTransport, } from "./referee.js";
export { REFEREE_EXAMPLES } from "./referee-examples.js";
export { measureLayout, ORACLE_SIGNALS, ORACLE } from "./oracle.js";
export { noteOffPage, hasPageNotes } from "./noteplace.js";
export { parseGolden, checkGoldenPage, scoreOracle, finalBlocks } from "./golden.js";
export { ASSERTION_KINDS } from "./golden.js";
export { renderPage, draftGolden, pageFixture, pageBlocks, pageFootnotes } from "./pageview.js";
export { EXPECTED_POPPLER, popplerVersion, popplerWarning } from "./poppler.js";
// — Human corrections —
export { parseCorrections, parseDismissals, applyCorrections, correctionVocabulary, } from "./corrections.js";
export { rejoinHyphenated, vocabulary, wholeWords } from "./hyphens.js";
// — Building a bespoke pass —
export { takePrintedNumber, splitFootnoteBlock, bodyIndent } from "./passes.js";
export { linkFlushMarkers, linkInlineMarkers } from "./footnotes.js";
// — Rendering: markdown → the content a report publishes —
export { renderArtifacts } from "./render.js";
export { renderMarkdown, paragraphId, slugify, PARAGRAPH_ID_CHARS, resolveNoteReferences, collectNoteOrder } from "./markdown.js";
export { splitSections, sectionFor, paragraphIndex } from "./sections.js";
export { extractPassages } from "./passages.js";
// — Publishing rendered content to reportsthatmatter (see src/publish.ts) —
export { contentHash, manifestFor, fileHash, tokenFor, authorises, manifestProblems, isPublishablePath, isReportId, } from "./publish.js";
export { markPrintedNumbers } from "./printed-numbers.js";
export { strayFolios, folioReport } from "./folios.js";
export { UNCODED_REDACTION, REDACTION_MARKER } from "./redactions.js";
