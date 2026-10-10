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
export { printedPageNumber, footnoteBlock, flushFootnoteMarkers, numberedParagraphs, escapeNumberedParagraphs, escapeLeadingHash, paragraphNotes, chapterContents, listedHeadings, unlistedHeadingsMinor, hangingIndents, letteredItems, numberedOpenings, unmarkedHeadings, recoverListedHeadings, endnotes, layoutEndnotes, numberedSections, contentsEntries, shortSubheads, shiftedPages, quoteRunOn, quoteListRunOns, layoutPageJoins, layoutMarkers, typographicHeadings, numberedFindings, doubleSpaced, contentsOutline, listedDivisions, wrappedHeadings, pageBreakContinuations, citationRunOver, noteFaceRunOver, holdNoteSequence, footnoteResets, romanFolios, parenFolios, pageHeadFolios, foliosInStep, numberedOutsideTables, photoCredits, hyphenFragments, divisionLabels, speakerTurns, footnoteGap, footnoteRestarts, thumbIndexNotes, strandedMarkers, sequencedNoteOpenings, footnoteNumbers, pdfPageNumbers, runningFurniture, furnitureFaces, figureFaces, geometry, columns, quoteInset, allCapsHeadings, numberedHeadings, } from "./passes.js";
export type { Pass, PagePass, LayoutPageJoinsPass, LayoutMarkersPass, TypographicHeadingsPass, PageHeadFoliosPass, PageBreakContinuationsPass, BodyPass, VolumePass, GeometryPass, QuoteInsetPass, AllCapsHeadingsPass, NumberedHeadingsPass, } from "./passes.js";
export { detectGutter, splitColumns } from "./columns.js";
export { cleanEdition, inlineMarkdown, inlineText, escapeInline, assembleEdition, fillGaps } from "./edition.js";
export type { Edition, EditionBlock, EditionNote, EditionPass, EditionSource, EditionReport, InlinePiece, PrintedPage, BlockSource, FilledGap, ShadowText } from "./edition.js";
export { htmlEvents, decodeEntities } from "./html.js";
export type { HtmlEvent } from "./html.js";
export { visionStructure, visionPage, readPack, renderVisionReport } from "./vision/hybrid.js";
export type { VisionStructurePass, VisionReport, VisionPageRecord, VisionOptions, VisionSource } from "./vision/hybrid.js";
export { parseDoctags } from "./vision/doctags.js";
export type { VisionBlock } from "./vision/doctags.js";
export { verifyPage, verifyWithLayout, rejoinLineHyphens } from "./vision/verify.js";
export type { VerifiedBlock, VerifiedPage, VerifyOptions } from "./vision/verify.js";
export { align } from "./align.js";
export type { Alignment, AlignOptions } from "./align.js";
export { tokens, words, fold, tokensBefore, hasLetter } from "./tokens.js";
export type { Token } from "./tokens.js";
export { linkLayoutMarkers, foldForMatch } from "./markers.js";
export type { LayoutMarkerStats, LayoutMarkersOptions, MarkerNotes } from "./markers.js";
export { pageDefinesNotes } from "./markers.js";
export { applyTypographicHeadings, layoutHeadings } from "./typographic-headings.js";
export type { FurnitureFacesOptions } from "./furniture-faces.js";
export type { TypographicHeadingsOptions, TypographicHeadingStats } from "./typographic-headings.js";
export type { Gutter } from "./columns.js";
export { extractPages, normaliseWhitespace } from "./extract.js";
export type { Page } from "./extract.js";
export { ingest, ingestPages, ingestPageGroups } from "./pipeline.js";
export type { IngestResult, Metadata } from "./pipeline.js";
export { resolveVolume, checkVolume, fileChecksum } from "./volumes.js";
export { runChecks, structuralChecks, losslessCheck, retentionCheck, severedSentenceCheck, pageBreakSplits, digitDensityCheck, } from "./fidelity.js";
export type { Check, PageBreakSplit } from "./fidelity.js";
export { computeBaseline, diffBaselines } from "./baseline.js";
export type { Baseline } from "./baseline.js";
export { openLayout, buildLayout, parseLayoutXml, layoutXml, indentVersus } from "./layout.js";
export type { Layout, LayoutLine, PageLayout, BodyFont, RaisedRun } from "./layout.js";
export { decidePageBreak, findPageBreakLines, layoutJoins, pageBreakKey, isJustified, sameFace, letters } from "./pagebreaks.js";
export type { PageBreakLines, PageBreakDecision, PageBreakCase, PageBreakReferee, PageBreakOptions, PageBreakConfidence } from "./pagebreaks.js";
export { pageBreakCache, readPageBreakCache, writePageBreakCache, isCachedReferee, refereeEntry, describeCase, refereeRequests, parseRefereeAnswers, refereePageBreaks, refereeCost, REFEREE_SYSTEM, REFEREE_PROMPT_ID, REFEREE_PRICES, requestHash, replayTransport, recordingTransport, } from "./referee.js";
export type { CachedReferee, RefereeEntry, PageBreakCacheFile, RefereeRequest, RefereeContent, RefereeUsage, RefereeTransport, RefereeOptions, RefereeRun, RefereeRecording, } from "./referee.js";
export { REFEREE_EXAMPLES } from "./referee-examples.js";
export type { PipelineContext } from "./context.js";
export { measureLayout, ORACLE_SIGNALS, ORACLE } from "./oracle.js";
export type { OracleReport, OracleSignal, OracleFinding, PageCounts } from "./oracle.js";
export { noteOffPage, hasPageNotes } from "./noteplace.js";
export type { NoteOffPage } from "./noteplace.js";
export { parseGolden, checkGoldenPage, scoreOracle, finalBlocks } from "./golden.js";
export { ASSERTION_KINDS } from "./golden.js";
export type { Golden, GoldenPage, GoldenBlock, GoldenResult, SignalScore, AssertionKind } from "./golden.js";
export { renderPage, draftGolden, pageFixture, pageBlocks, pageFootnotes } from "./pageview.js";
export { EXPECTED_POPPLER, popplerVersion, popplerWarning } from "./poppler.js";
export { parseCorrections, parseDismissals, applyCorrections, correctionVocabulary, } from "./corrections.js";
export { rejoinHyphenated, vocabulary, wholeWords } from "./hyphens.js";
export type { Correction, Dismissal } from "./corrections.js";
export { takePrintedNumber, splitFootnoteBlock, bodyIndent } from "./passes.js";
export type { SplitPage } from "./clean.js";
export type { Block, Provenance } from "./paragraphs.js";
export { linkFlushMarkers, linkInlineMarkers } from "./footnotes.js";
export type { Footnote } from "./footnotes.js";
export type { Suspect } from "./ocr.js";
export { renderArtifacts } from "./render.js";
export type { RenderedArtifacts, ReportMeta, SectionSummary } from "./render.js";
export { renderMarkdown, paragraphId, slugify, PARAGRAPH_ID_CHARS, resolveNoteReferences, collectNoteOrder } from "./markdown.js";
export { splitSections, sectionFor, paragraphIndex } from "./sections.js";
export type { Section } from "./sections.js";
export { extractPassages } from "./passages.js";
export type { Passage } from "./passages.js";
export { contentHash, manifestFor, fileHash, tokenFor, authorises, manifestProblems, isPublishablePath, isReportId, } from "./publish.js";
export type { PublishFile, Manifest } from "./publish.js";
export { markPrintedNumbers } from "./printed-numbers.js";
export { strayFolios, folioReport } from "./folios.js";
export type { FolioRead, FolioRow, FolioPage, FolioRun, FolioReport, FolioSource } from "./folios.js";
