import { extractPages, type Page } from "./extract";
import { splitPage, collapseDoubleSpacing } from "./clean";
import type { ResolvedPasses } from "./define";
import { applyCorrections, type Correction } from "./corrections";
import { rejoinHyphenated, vocabulary } from "./hyphens";
import {
  toBlocks,
  blocksToMarkdown,
  isContentsPage,
  parseContentsPage,
  mergeAcrossPages,
  bodyIndent,
  type Block,
} from "./paragraphs";
import {
  parseFootnotes,
  linkInlineMarkers,
  linkFlushMarkers,
  renderEndnotes,
  type Footnote,
} from "./footnotes";
import { autoFix, findSuspects, rankSuspects, type Suspect } from "./ocr";

export type IngestResult = {
  markdown: string;
  corrections: number;
  sourceText: string;
  footnotes: Footnote[];
  suspects: Suspect[];
  autoFixes: number;
  pages: number;
};

export type Metadata = {
  title: string;
  authors?: string;
  published_at?: string;
  source_url?: string;
};

/**
 * PDF → Markdown, deterministically. The same input always produces the same
 * output, so fixes belong in this pipeline rather than in hand-edits of the
 * result — that way every correction compounds across future reports.
 */
export function ingest(pdfPath: string, meta: Metadata): IngestResult {
  return ingestPageGroups([extractPages(pdfPath)], meta);
}

export function ingestPages(pages: Page[], meta: Metadata): IngestResult {
  return ingestPageGroups([pages], meta);
}

/**
 * Ingests one continuous report from one or more PDFs. Multi-volume reports
 * keep a margin per source volume: each PDF's page furniture and typesetting
 * may differ, so one global margin is not meaningful across all of them.
 */
export function ingestPageGroups(
  pageGroups: Page[][],
  meta: Metadata,
  resolved: ResolvedPasses = {
    geometry: "document",
    flushFootnoteMarkers: false,
    bodyPasses: [],
    volumePasses: [],
  },
  corrections: Correction[] = []
): IngestResult {
  // Volume is assigned here because this is the only place that knows the
  // order the volumes were given in — and that order is semantic: footnote
  // numbering and page indices run continuously across them.
  const pages = pageGroups.flatMap((group, groupIndex) =>
    group.map((page) => ({ ...page, volume: groupIndex + 1 }))
  ).map((page, i) => ({ ...page, index: i + 1 }));
  const sourceText = pages.map((page) => page.lines.join("\n")).join("\n");

  const footnotes: Footnote[] = [];
  const bodyChunks: Block[] = [];
  let expectedNote = 1;

  let pageOffset = 0;
  const splitGroups = pageGroups.map((group) =>
    group.map(() => {
      const split = splitPage(pages[pageOffset++], expectedNote);

      if (split.footnotes.length) {
        const parsed = parseFootnotes(split.footnotes, split.index).map((note) => ({
          ...note,
          volume: split.volume,
          pdfIndex: split.pdfIndex,
        }));
        footnotes.push(...parsed);
        if (parsed.length) expectedNote = Math.max(...parsed.map((n) => n.number)) + 1;
      }
      // Body passes rewrite the page's own lines once its furniture is off:
      // reading two columns in order, for instance.
      split.body = resolved.bodyPasses.reduce(
        (lines, pass) => pass.run(lines),
        split.body
      );
      return split;
    })
  );

  // Which passes run is a declared property of the document, not something
  // inferred from how many arguments were typed on the command line.
  const cleanedGroups = splitGroups.map((group) =>
    resolved.volumePasses.reduce((pages, pass) => pass.run(pages), group)
  );
  // Measured on the page *body*, never on the raw lines.
  //
  // A footnote block sits at the left edge, and so does page furniture, so
  // measuring the raw lines put Litvinenko's margin at 0 when its body text
  // is at 6. Anything indented five past the margin reads as a quotation —
  // and these reports set numbered paragraphs with a hanging indent, the
  // number at the edge and the text inset — so 865 of its 1,089 paragraphs
  // were cut in half, the first line left as prose and the rest quoted.
  const margins =
    resolved.geometry === "per-volume"
      ? cleanedGroups.map((group) => bodyIndent(group.flatMap((page) => page.body)))
      : [bodyIndent(cleanedGroups.flat().flatMap((page) => page.body))];

  for (const [groupIndex, group] of cleanedGroups.entries()) {
    for (const split of group) {
      const pageLines = collapseDoubleSpacing(split.body);
      const at = { volume: split.volume, pdfIndex: split.pdfIndex, printed: split.printed };
      const blocks = (
        isContentsPage(pageLines)
          ? parseContentsPage(pageLines)
          : toBlocks(pageLines, margins[resolved.geometry === "per-volume" ? groupIndex : 0])
      ).map((block) => ({ ...block, at }));

      // Record where each printed page begins. These documents are cited by page
      // ("Report at 62"), so the printed number is the citation unit readers
      // already use — and it can be checked against the original PDF.
      if (split.printed !== null && blocks.length) {
        bodyChunks.push({ kind: "page", number: split.printed, at });
      }
      bodyChunks.push(...blocks);
    }
  }

  // A printed number that appears more than once in a report needs telling
  // apart, or every occurrence renders the same anchor and a citation to the
  // second silently lands on the first.
  const seenPage = new Map<number, number>();
  for (const block of bodyChunks) {
    if (block.kind !== "page") continue;
    const count = (seenPage.get(block.number) ?? 0) + 1;
    seenPage.set(block.number, count);
    if (count > 1) block.occurrence = count;
  }

  // Footnote markers that OCR fused to the preceding word. Scoped to the
  // notes collected near each block's own page: these documents number notes
  // sequentially, so page locality is what turns an ambiguous typographic
  // guess into a lookup that can be trusted to auto-apply.
  const notesByPage = new Map<string, Set<number>>();
  // Keyed by volume as well as page: a per-volume page index alone collapses
  // volume 1 page 50 into volume 4 page 50, widening the window fourfold.
  const pageKey = (volume: number | undefined, page: number) => `${volume ?? 1}:${page}`;
  for (const note of footnotes) {
    const key = pageKey(note.volume, note.pdfIndex ?? note.page);
    if (!notesByPage.has(key)) notesByPage.set(key, new Set());
    notesByPage.get(key)!.add(note.number);
  }
  const notesNear = (at: Block["at"]): Set<number> => {
    const page = at?.pdfIndex;
    if (page === undefined) return new Set();
    const near = new Set<number>();
    // A note whose text runs over is parsed on the following page, so look
    // one page either side of the marker.
    for (const offset of [-1, 0, 1]) {
      for (const n of notesByPage.get(pageKey(at?.volume, page + offset)) ?? []) near.add(n);
    }
    return near;
  };
  for (const block of resolved.flushFootnoteMarkers ? bodyChunks : []) {
    const plausible = notesNear(block.at);
    if (!plausible.size) continue;
    if (block.kind === "list") {
      block.items = block.items.map((item) => linkFlushMarkers(item, plausible));
    } else if (block.kind !== "page") {
      block.text = linkFlushMarkers(block.text, plausible);
    }
  }

  // Corrections are the last word on the text: applied after the structure is
  // settled, before it is serialised, so re-running reproduces the same output.
  const corrected = applyCorrections(
    mergeAcrossPages(bodyChunks),
    corrections,
    meta.title
  );
  let body = blocksToMarkdown(corrected.blocks);

  // Rejoin words the typesetter broke at a line end, decided from the
  // document's own vocabulary. Before autoFix, so a repaired word is judged
  // whole rather than as two fragments.
  body = rejoinHyphenated(body, vocabulary(sourceText));

  const fixed = autoFix(body);
  body = fixed.text;

  const known = new Set(footnotes.map((note) => note.number));
  body = linkInlineMarkers(body, known);

  const suspects = rankSuspects(
    pages.flatMap((page) =>
      findSuspects(page.lines.join(" "), page.index).map((suspect) => ({
        ...suspect,
        volume: page.volume,
        pdfIndex: page.pdfIndex,
      }))
    )
  );

  // Footnote and citation text is where the scan degrades worst, so the same
  // certain-substitution pass matters more here than it does in the body.
  let noteFixes = 0;
  for (const note of footnotes) {
    const result = autoFix(note.text);
    note.text = result.text;
    noteFixes += result.applied;
  }

  const endnotes = renderEndnotes(footnotes);
  const markdown = [
    frontMatter({
      ...meta,
      pages: pages.length,
      footnotes: footnotes.length,
      // Omitted at zero so a report with no corrections is unchanged, and
      // visible the moment there is a human judgement on the record.
      ...(corrected.applied ? { corrections: corrected.applied } : {}),
    }),
    body,
    endnotes ? `## Notes\n\n${endnotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd()
    .concat("\n");

  return {
    markdown,
    sourceText,
    footnotes,
    suspects,
    autoFixes: fixed.applied + noteFixes,
    corrections: corrected.applied,
    pages: pages.length,
  };
}

function frontMatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) =>
      typeof value === "number" ? `${key}: ${value}` : `${key}: ${JSON.stringify(String(value))}`
    );
  return `---\n${lines.join("\n")}\n---`;
}
