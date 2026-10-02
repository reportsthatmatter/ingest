import type {
  Pass,
  GeometryPass,
  VolumePass,
  BodyPass,
  QuoteInsetPass,
  AllCapsHeadingsPass,
  NumberedHeadingsPass,
} from "./passes";

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
  endnotes?: boolean;
  numberedSections?: boolean;
  unlistedHeadingsMinor?: boolean;
  hangingIndents?: boolean;
  numberedFindings?: boolean;
  doubleSpaced?: boolean;
  contentsOutline?: boolean;
  listedDivisions?: boolean;
  wrappedHeadings?: boolean;
  pageBreakContinuations?: boolean;
  citationRunOver?: boolean;
  quoteInset?: number;
  allCapsHeadings: boolean;
  numberedHeadings?: boolean;
  bodyPasses: BodyPass[];
  volumePasses: VolumePass[];
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
  if ((def.passes ?? []).filter((pass) => pass.stage === "allCapsHeadings").length > 1) {
    throw new Error(`${def.id}: more than one allCapsHeadings pass declared`);
  }

  const passNames = new Set((def.passes ?? []).map((pass) => pass.name));
  if (passNames.has("escapeNumberedParagraphs") && !passNames.has("numberedParagraphs")) {
    throw new Error(
      `${def.id}: escapeNumberedParagraphs declared without numberedParagraphs — it only escapes the number numberedParagraphs already split on`
    );
  }

  return def;
}

/**
 * Reads a definition's passes into the shape the executor wants.
 *
 * A report that declares nothing gets the single-volume defaults, which is
 * what every report but Leveson had before passes existed.
 */
export function resolvePasses(def: PipelineDef): ResolvedPasses {
  const passes = def.passes ?? [];
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
    endnotes: passes.some((pass) => pass.name === "endnotes"),
    numberedSections: passes.some((pass) => pass.name === "numberedSections"),
    unlistedHeadingsMinor: passes.some((pass) => pass.name === "unlistedHeadingsMinor"),
    hangingIndents: passes.some((pass) => pass.name === "hangingIndents"),
    numberedFindings: passes.some((pass) => pass.name === "numberedFindings"),
    doubleSpaced: passes.some((pass) => pass.name === "doubleSpaced"),
    contentsOutline: passes.some((pass) => pass.name === "contentsOutline"),
    listedDivisions: passes.some((pass) => pass.name === "listedDivisions"),
    wrappedHeadings: passes.some((pass) => pass.name === "wrappedHeadings"),
    pageBreakContinuations: passes.some((pass) => pass.name === "pageBreakContinuations"),
    citationRunOver: passes.some((pass) => pass.name === "citationRunOver"),
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
  };
}
