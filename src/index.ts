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
export { pipeline, resolvePasses } from "./define";
export type { PipelineDef, Volume, ResolvedPasses } from "./define";
export {
  printedPageNumber,
  footnoteBlock,
  flushFootnoteMarkers,
  numberedParagraphs,
  escapeNumberedParagraphs,
  escapeLeadingHash,
  paragraphNotes,
  chapterContents,
  listedHeadings,
  unlistedHeadingsMinor,
  hangingIndents,
  letteredItems,
  unmarkedHeadings,
  recoverListedHeadings,
  endnotes,
  numberedSections,
  contentsEntries,
  shortSubheads,
  shiftedPages,
  quoteRunOn,
  quoteListRunOns,
  layoutPageJoins,
  layoutMarkers,
  numberedFindings,
  doubleSpaced,
  contentsOutline,
  listedDivisions,
  wrappedHeadings,
  pageBreakContinuations,
  citationRunOver,
  romanFolios,
  numberedOutsideTables,
  photoCredits,
  footnoteGap,
  runningFurniture,
  geometry,
  columns,
  quoteInset,
  allCapsHeadings,
  numberedHeadings,
} from "./passes";
export type {
  Pass,
  PagePass,
  LayoutPageJoinsPass,
  LayoutMarkersPass,
  PageBreakContinuationsPass,
  BodyPass,
  VolumePass,
  GeometryPass,
  QuoteInsetPass,
  AllCapsHeadingsPass,
  NumberedHeadingsPass,
} from "./passes";
export { detectGutter, splitColumns } from "./columns";

// — A clean edition as the source (the hybrid mode, edition.ts) —
export { cleanEdition, inlineMarkdown, inlineText, escapeInline, assembleEdition } from "./edition";
export type { Edition, EditionBlock, EditionNote, EditionPass, EditionSource, EditionReport, InlinePiece, PrintedPage } from "./edition";
export { htmlEvents, decodeEntities } from "./html";
export type { HtmlEvent } from "./html";
// Monotone word alignment (promoted from the site's scorer, src/lib/score)
export { align } from "./align";
export type { Alignment, AlignOptions } from "./align";
export { tokens, words, fold, tokensBefore, hasLetter } from "./tokens";
export type { Token } from "./tokens";
export { linkLayoutMarkers, foldForMatch } from "./markers";
export type { LayoutMarkerStats, LayoutMarkersOptions, MarkerNotes } from "./markers";
export { pageDefinesNotes } from "./markers";
export type { Gutter } from "./columns";

// — Running a build —
export { extractPages, normaliseWhitespace } from "./extract";
export type { Page } from "./extract";
export { ingest, ingestPages, ingestPageGroups } from "./pipeline";
export type { IngestResult, Metadata } from "./pipeline";
export { resolveVolume, checkVolume, fileChecksum } from "./volumes";

// — Checking a build —
export {
  runChecks,
  structuralChecks,
  losslessCheck,
  retentionCheck,
  severedSentenceCheck,
  pageBreakSplits,
  digitDensityCheck,
} from "./fidelity";
export type { Check, PageBreakSplit } from "./fidelity";
export { computeBaseline, diffBaselines } from "./baseline";
export type { Baseline } from "./baseline";
export { openLayout, buildLayout, parseLayoutXml, layoutXml, indentVersus } from "./layout";
export type { Layout, LayoutLine, PageLayout, BodyFont, RaisedRun } from "./layout";
export { decidePageBreak, findPageBreakLines, layoutJoins, pageBreakKey, isJustified, sameFace, letters } from "./pagebreaks";
export type { PageBreakLines, PageBreakDecision, PageBreakCase, PageBreakReferee, PageBreakOptions, PageBreakConfidence } from "./pagebreaks";
export {
  pageBreakCache,
  readPageBreakCache,
  writePageBreakCache,
  isCachedReferee,
  refereeEntry,
  describeCase,
  refereeRequests,
  parseRefereeAnswers,
  refereePageBreaks,
  refereeCost,
  REFEREE_SYSTEM,
  REFEREE_PROMPT_ID,
  REFEREE_PRICES,
  requestHash,
  replayTransport,
  recordingTransport,
} from "./referee";
export type {
  CachedReferee,
  RefereeEntry,
  PageBreakCacheFile,
  RefereeRequest,
  RefereeContent,
  RefereeUsage,
  RefereeTransport,
  RefereeOptions,
  RefereeRun,
  RefereeRecording,
} from "./referee";
export { REFEREE_EXAMPLES } from "./referee-examples";
export type { PipelineContext } from "./context";
export { measureLayout, ORACLE_SIGNALS, ORACLE } from "./oracle";
export type { OracleReport, OracleSignal, OracleFinding, PageCounts } from "./oracle";
export { noteOffPage, hasPageNotes } from "./noteplace";
export type { NoteOffPage } from "./noteplace";
export { parseGolden, checkGoldenPage, scoreOracle, finalBlocks } from "./golden";
export { ASSERTION_KINDS } from "./golden";
export type { Golden, GoldenPage, GoldenBlock, GoldenResult, SignalScore, AssertionKind } from "./golden";
export { renderPage, draftGolden, pageFixture, pageBlocks, pageFootnotes } from "./pageview";
export { EXPECTED_POPPLER, popplerVersion, popplerWarning } from "./poppler";

// — Human corrections —
export {
  parseCorrections,
  parseDismissals,
  applyCorrections,
  correctionVocabulary,
} from "./corrections";
export { rejoinHyphenated, vocabulary } from "./hyphens";
export type { Correction, Dismissal } from "./corrections";

// — Building a bespoke pass —
export { takePrintedNumber, splitFootnoteBlock, bodyIndent } from "./passes";
export type { SplitPage } from "./clean";
export type { Block, Provenance } from "./paragraphs";
export { linkFlushMarkers, linkInlineMarkers } from "./footnotes";
export type { Footnote } from "./footnotes";
export type { Suspect } from "./ocr";

// — Rendering: markdown → the content a report publishes —
export { renderArtifacts } from "./render";
export type { RenderedArtifacts, ReportMeta, SectionSummary } from "./render";
export { renderMarkdown, paragraphId, slugify, PARAGRAPH_ID_CHARS, resolveNoteReferences, collectNoteOrder } from "./markdown";
export { splitSections, sectionFor, paragraphIndex } from "./sections";
export type { Section } from "./sections";
export { extractPassages } from "./passages";
export type { Passage } from "./passages";

// — Publishing rendered content to reportsthatmatter (see src/publish.ts) —
export {
  contentHash,
  manifestFor,
  fileHash,
  tokenFor,
  authorises,
  manifestProblems,
  isPublishablePath,
  isReportId,
} from "./publish";
export type { PublishFile, Manifest } from "./publish";
export { markPrintedNumbers } from "./printed-numbers";
