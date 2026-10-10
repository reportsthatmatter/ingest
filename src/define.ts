import type {
  Pass,
  GeometryPass,
  VolumePass,
  BodyPass,
  QuoteInsetPass,
  AllCapsHeadingsPass,
  NumberedHeadingsPass,
  LayoutPageJoinsPass,
  LayoutMarkersPass,
  TypographicHeadingsPass,
  FootnoteResetsPass,
  FootnoteReset,
  PageHeadFoliosPass,
} from "./passes";
import type { PageHeadFolio } from "./clean";
import type { PageBreakOptions } from "./pagebreaks";
import type { EditionPass } from "./edition";
import type { VisionStructurePass } from "./vision/hybrid";
import type { TypographicHeadingsOptions } from "./typographic-headings";

export type Volume = { path: string; sha256?: string };

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
  layoutMarkers?: { scope: "page" | "document" | "chapter"; textFallback: boolean };
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
  hyphenFragments?: boolean;
  divisionLabels?: boolean;
  speakerTurns?: boolean;
  footnoteGap?: boolean;
  /** `sequencedNoteOpenings`: a note line opening on the next note's number starts it, whatever follows. */
  sequencedNoteOpenings?: boolean;
  /** `footnoteRestarts`: a page-foot numbering that starts over at 1 is read without corroboration. */
  footnoteRestarts?: boolean;
  /** `footnoteNumbers`: how page-foot notes are numbered. */
  footnoteNumbers?: "bare" | "period" | "tabbed";
  /** `pdfPageNumbers`: each page is numbered by its place in its PDF. */
  pdfPageNumbers?: boolean;
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
export function pipeline(def: PipelineDef): PipelineDef {
  if (!def.id) throw new Error("pipeline has no id");
  if (!def.title) throw new Error(`${def.id}: pipeline has no title`);
  if (!def.repo) throw new Error(`${def.id}: pipeline has no repo`);
  if (!def.volumes?.length) throw new Error(`${def.id}: pipeline lists no volumes`);

  for (const volume of def.volumes) {
    if (!volume?.path) throw new Error(`${def.id}: a volume has no path`);
    if (volume.path.startsWith("/") || volume.path.split("/").includes("..")) {
      throw new Error(
        `${def.id}: volume path "${volume.path}" escapes the report repo`
      );
    }
  }

  const geometries = (def.passes ?? []).filter(
    (pass): pass is GeometryPass => pass.stage === "geometry"
  );
  if (geometries.length > 1) {
    throw new Error(`${def.id}: more than one geometry pass declared`);
  }
  if ((def.passes ?? []).filter((pass) => pass.stage === "edition").length > 1) {
    throw new Error(`${def.id}: more than one cleanEdition declared`);
  }
  const visions = (def.passes ?? []).filter((pass) => pass.stage === "vision").length;
  if (visions > 1) throw new Error(`${def.id}: more than one visionStructure declared`);
  if (visions && (def.passes ?? []).some((pass) => pass.stage === "edition")) {
    throw new Error(`${def.id}: visionStructure and cleanEdition do not combine — one takes structure from the PDF's pages, the other text and structure from an edition`);
  }
  if (visions && (def.passes ?? []).some((pass) => pass.name === "paragraphNotes" || pass.name === "endnotes")) {
    throw new Error(`${def.id}: visionStructure reads page-foot notes; it does not combine with paragraphNotes or endnotes`);
  }
  if ((def.passes ?? []).filter((pass) => pass.stage === "allCapsHeadings").length > 1) {
    throw new Error(`${def.id}: more than one allCapsHeadings pass declared`);
  }

  const passNames = new Set((def.passes ?? []).map((pass) => pass.name));
  if (passNames.has("escapeNumberedParagraphs") && !passNames.has("numberedParagraphs")) {
    throw new Error(
      `${def.id}: escapeNumberedParagraphs declared without numberedParagraphs — it only escapes the number numberedParagraphs already split on`
    );
  }

  if (passNames.has("contentsEntries") && !passNames.has("numberedSections")) {
    throw new Error(
      `${def.id}: contentsEntries declared without numberedSections — it lays out the contents pages numberedSections reads`
    );
  }

  return def;
}

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
export const KNOWN_PAGE_PASSES: ReadonlySet<string> = new Set([
  "chapterContents", "citationRunOver", "contentsEntries", "contentsOutline", "doubleSpaced",
  "endnotes", "escapeLeadingHash", "escapeNumberedParagraphs", "flushFootnoteMarkers",
  "foliosInStep", "footnoteBlock", "footnoteGap", "footnoteNumbers", "footnoteResets", "footnoteRestarts", "divisionLabels", "hangingIndents", "holdNoteSequence", "hyphenFragments",
  "layoutEndnotes", "layoutMarkers", "layoutPageJoins", "letteredItems", "listedDivisions", "listedHeadings",
  "noteFaceRunOver", "numberedFindings", "numberedOpenings", "numberedOutsideTables", "numberedParagraphs", "numberedSections",
  "pageBreakContinuations", "pageHeadFolios", "paragraphNotes", "parenFolios", "pdfPageNumbers", "photoCredits",
  "printedPageNumber", "quoteListRunOns", "quoteRunOn", "recoverListedHeadings", "romanFolios",
  "sequencedNoteOpenings", "shiftedPages", "shortSubheads", "typographicHeadings", "unlistedHeadingsMinor",
  "speakerTurns", "unmarkedHeadings", "wrappedHeadings",
]);

/**
 * Reads a definition's passes into the shape the executor wants.
 *
 * A report that declares nothing gets the single-volume defaults, which is
 * what every report but Leveson had before passes existed.
 */
export function resolvePasses(def: PipelineDef): ResolvedPasses {
  const passes = def.passes ?? [];
  const unknown = passes.filter((pass) => pass.stage === "page" && !KNOWN_PAGE_PASSES.has(pass.name));
  if (unknown.length) {
    throw new Error(
      `${def.id}: pass ${unknown.map((p) => `"${p.name}"`).join(", ")} is not implemented by this @rtm/ingest (${unknown.length > 1 ? "they" : "it"} would silently do nothing); a typo, or a report on a newer library than the one installed (pnpm ingest preflight)`
    );
  }
  const geometry = passes.find(
    (pass): pass is GeometryPass => pass.stage === "geometry"
  );
  return {
    geometry: geometry?.scope ?? "document",
    flushFootnoteMarkers: passes.some((pass) => pass.name === "flushFootnoteMarkers"),
    numberedParagraphs: passes.some((pass) => pass.name === "numberedParagraphs"),
    escapeNumberedParagraphs: passes.some((pass) => pass.name === "escapeNumberedParagraphs"),
    escapeLeadingHash: passes.some((pass) => pass.name === "escapeLeadingHash"),
    paragraphNotes: passes.some((pass) => pass.name === "paragraphNotes"),
    chapterContents: passes.some((pass) => pass.name === "chapterContents"),
    listedHeadings: passes.some((pass) => pass.name === "listedHeadings"),
    unmarkedHeadings: passes.some((pass) => pass.name === "unmarkedHeadings"),
    // Inert without the passes it extends: it widens what a contents-matched
    // heading may be, so with no contents to match there is nothing to widen.
    recoverListedHeadings:
      passes.some((pass) => pass.name === "recoverListedHeadings") &&
      passes.some((pass) => pass.name === "unmarkedHeadings") &&
      passes.some((pass) => pass.name === "listedHeadings"),
    endnotes: passes.some((pass) => pass.name === "endnotes"),
    layoutEndnotes: passes.some((pass) => pass.name === "layoutEndnotes"),
    numberedSections: passes.some((pass) => pass.name === "numberedSections"),
    contentsEntries: passes.some((pass) => pass.name === "contentsEntries"),
    shortSubheads: passes.some((pass) => pass.name === "shortSubheads"),
    shiftedPages: passes.some((pass) => pass.name === "shiftedPages"),
    quoteRunOn: passes.some((pass) => pass.name === "quoteRunOn"),
    quoteListRunOns: passes.some((pass) => pass.name === "quoteListRunOns"),
    layoutPageJoins: layoutPageJoinsOf(passes),
    layoutMarkers: layoutMarkersOf(passes),
    typographicHeadings: passes.find((p): p is TypographicHeadingsPass => p.name === "typographicHeadings")?.options,
    unlistedHeadingsMinor: passes.some((pass) => pass.name === "unlistedHeadingsMinor"),
    hangingIndents: passes.some((pass) => pass.name === "hangingIndents"),
    letteredItems: passes.some((pass) => pass.name === "letteredItems"),
    numberedOpenings:
      passes.some((pass) => pass.name === "numberedOpenings") && passes.some((pass) => pass.name === "numberedParagraphs"),
    numberedFindings: passes.some((pass) => pass.name === "numberedFindings"),
    doubleSpaced: passes.some((pass) => pass.name === "doubleSpaced"),
    contentsOutline: passes.some((pass) => pass.name === "contentsOutline"),
    listedDivisions: passes.some((pass) => pass.name === "listedDivisions"),
    wrappedHeadings: passes.some((pass) => pass.name === "wrappedHeadings"),
    pageBreakContinuations: passes.some((pass) => pass.name === "pageBreakContinuations"),
    pageBreakQuoteTails: passes.some(
      (pass) => pass.name === "pageBreakContinuations" && "quoteTails" in pass && pass.quoteTails === true
    ),
    citationRunOver: passes.some((pass) => pass.name === "citationRunOver"),
    noteFaceRunOver: passes.some((pass) => pass.name === "noteFaceRunOver"),
    holdNoteSequence: passes.some((pass) => pass.name === "holdNoteSequence"),
    footnoteResets: passes.find((pass): pass is FootnoteResetsPass => pass.name === "footnoteResets")?.at,
    romanFolios: passes.some((pass) => pass.name === "romanFolios"),
    parenFolios: passes.some((pass) => pass.name === "parenFolios"),
    pageHeadFolios: passes.find((pass): pass is PageHeadFoliosPass => pass.name === "pageHeadFolios")?.options ?? undefined,
    foliosInStep: passes.some((pass) => pass.name === "foliosInStep"),
    numberedOutsideTables: passes.some((pass) => pass.name === "numberedOutsideTables"),
    photoCredits: passes.some((pass) => pass.name === "photoCredits"),
    hyphenFragments: passes.some((pass) => pass.name === "hyphenFragments"),
    divisionLabels: passes.some((pass) => pass.name === "divisionLabels"),
    speakerTurns: passes.some((pass) => pass.name === "speakerTurns"),
    footnoteGap: passes.some((pass) => pass.name === "footnoteGap"),
    footnoteRestarts: passes.some((pass) => pass.name === "footnoteRestarts"),
    sequencedNoteOpenings: passes.some((pass) => pass.name === "sequencedNoteOpenings"),
    footnoteNumbers: (passes.find((pass) => pass.name === "footnoteNumbers") as { numbers?: "period" | "tabbed" } | undefined)
      ?.numbers,
    pdfPageNumbers: passes.some((pass) => pass.name === "pdfPageNumbers"),
    quoteInset: passes.find(
      (pass): pass is QuoteInsetPass => pass.stage === "quoteInset"
    )?.columns,
    allCapsHeadings:
      passes.find(
        (pass): pass is AllCapsHeadingsPass => pass.stage === "allCapsHeadings"
      )?.enabled ?? true,
    numberedHeadings:
      passes.find(
        (pass): pass is NumberedHeadingsPass => pass.stage === "numberedHeadings"
      )?.enabled ?? true,
    bodyPasses: passes.filter((pass): pass is BodyPass => pass.stage === "body"),
    volumePasses: passes.filter((pass): pass is VolumePass => pass.stage === "volume"),
    edition: passes.find((pass): pass is EditionPass => pass.stage === "edition"),
    vision: passes.find((pass): pass is VisionStructurePass => pass.stage === "vision"),
  };
}

function layoutPageJoinsOf(passes: Pass[]): PageBreakOptions | undefined {
  const pass = passes.find((p): p is LayoutPageJoinsPass => p.name === "layoutPageJoins");
  if (!pass) return undefined;
  return {
    ...(pass.scanned ? { scanned: true } : {}),
    ...(pass.numberedBody ? { numberedBody: true } : {}),
    ...(pass.referee ? { referee: pass.referee } : {}),
    ...(pass.refer ? { refer: pass.refer } : {}),
  };
}

function layoutMarkersOf(passes: Pass[]): { scope: "page" | "document" | "chapter"; textFallback: boolean } | undefined {
  const pass = passes.find((p): p is LayoutMarkersPass => p.name === "layoutMarkers");
  return pass ? { scope: pass.scope ?? "page", textFallback: pass.textFallback === true } : undefined;
}
