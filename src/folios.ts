/**
 * `foliosInStep` (reportsthatmatter-uw50): which printed-number reads are stray.
 *
 * `reads` are the pages of one volume that read a printed number, in PDF order. In a report whose
 * pages are numbered continuously the offset (printed minus PDF page) is constant over long runs
 * and changes only where the numbering restarts. A read whose offset differs from the pages round
 * it is a digit of figure garble taken for a folio. Consecutive reads at one offset form a run; a
 * run of fewer than `minRun` reads next to a run of `minRun` or more is stray, and is dropped.
 * A run of up to `maxBracketed` reads whose neighbouring runs both sit at the same other offset is
 * stray too: Challenger's test-method pages print their own "2" to "7" folios, a consecutive run, in a
 * stretch the report numbers 370 to 375 (a run in step with itself and with nothing round it).
 * Dropping is repeated until nothing changes, so two or three strays in a row go too.
 */
export type FolioRead = { pdfIndex: number; printed: number };

export function strayFolios(reads: FolioRead[], minRun = 3, maxBracketed = 8): Set<number> {
  const offsetOf = (run: FolioRead[]) => run[0].printed - run[0].pdfIndex;
  const dropped = new Set<number>();
  for (;;) {
    const live = reads.filter((r) => !dropped.has(r.pdfIndex));
    const runs: FolioRead[][] = [];
    for (const read of live) {
      const last = runs[runs.length - 1];
      if (last && last[0].printed - last[0].pdfIndex === read.printed - read.pdfIndex) last.push(read);
      else runs.push([read]);
    }
    let changed = false;
    runs.forEach((run, i) => {
      const before = runs[i - 1];
      const after = runs[i + 1];
      const bracketed = before && after && run.length <= maxBracketed && offsetOf(before) === offsetOf(after) && offsetOf(before) !== offsetOf(run);
      const beside = run.length < minRun && [before, after].some((other) => other && other.length >= minRun);
      if (!bracketed && !beside) return;
      for (const read of run) dropped.add(read.pdfIndex);
      changed = true;
    });
    if (!changed) return dropped;
  }
}

/** One page's printed-number read, as the pipeline made it, before `foliosInStep` dropped any. */
export type FolioRow = { volume: number; pdfIndex: number; printed: number | null; dropped: boolean };

export type FolioSource = "pipeline" | "vision" | "html";

export type FolioPage = {
  volume: number;
  pdfIndex: number;
  /** The printed number read off the page (null: none read, or a stray read dropped). */
  printed: number | null;
  /** A stray read `foliosInStep` dropped, or one the rule would drop if the report declared it. */
  stray?: { printed: number; dropped: boolean };
  /** The number the page's marker carries when none was read (a page numbered from its neighbours). */
  inferred?: number;
  source: FolioSource;
  /** Printed minus PDF page index, within the volume; null when no number was read. */
  offset: number | null;
};

export type FolioRun = { volume: number; fromPdf: number; toPdf: number; reads: number; offset: number; firstPrinted: number; lastPrinted: number };

export type FolioReport = { pages: FolioPage[]; runs: FolioRun[]; unread: number; inferred: number; strays: number };

/**
 * What `pnpm ingest folios` prints: per PDF page the printed number read, its source (the vision reading, the
 * pipeline's, or an HTML edition with the PDF as shadow), the offset, and the runs of one offset the reads fall
 * into. The run and stray rule is `strayFolios`, the one `foliosInStep` applies: a report that does not declare
 * the pass still has its would-be strays listed (`stray.dropped` false).
 */
export function folioReport(result: {
  folios?: FolioRow[];
  vision?: { pages: Array<{ volume: number; pdfIndex: number; source: "vision" | "pipeline" }> };
  edition?: unknown;
  blocks?: Array<{ kind: string; number?: unknown; at?: { volume: number; pdfIndex: number } }>;
}): FolioReport {
  const rows = result.folios ?? [];
  const visionAt = new Map((result.vision?.pages ?? []).map((p) => [`${p.volume}:${p.pdfIndex}`, p.source]));
  const marker = new Map<string, number>();
  for (const b of result.blocks ?? []) if (b.kind === "page" && b.at && typeof b.number === "number") marker.set(`${b.at.volume}:${b.at.pdfIndex}`, b.number);
  const strays = new Set<string>();
  for (const volume of new Set(rows.map((r) => r.volume))) {
    const reads = rows.filter((r) => r.volume === volume && r.printed !== null).map((r) => ({ pdfIndex: r.pdfIndex, printed: r.printed! }));
    for (const pdfIndex of strayFolios(reads)) strays.add(`${volume}:${pdfIndex}`);
  }
  const pages: FolioPage[] = rows.map((r) => {
    const key = `${r.volume}:${r.pdfIndex}`;
    const stray = r.printed !== null && (r.dropped || strays.has(key));
    const kept = r.printed !== null && !stray ? r.printed : null;
    const inferred = kept === null ? marker.get(key) : undefined;
    return {
      volume: r.volume,
      pdfIndex: r.pdfIndex,
      printed: kept,
      ...(stray ? { stray: { printed: r.printed!, dropped: r.dropped } } : {}),
      ...(inferred !== undefined ? { inferred } : {}),
      source: result.edition ? "html" : visionAt.get(key) ?? "pipeline",
      offset: r.printed === null ? null : r.printed - r.pdfIndex,
    };
  });
  const runs: FolioRun[] = [];
  for (const p of pages) {
    if (p.printed === null) continue;
    const last = runs[runs.length - 1];
    if (last && last.volume === p.volume && last.offset === p.offset) {
      last.toPdf = p.pdfIndex;
      last.reads++;
      last.lastPrinted = p.printed;
    } else runs.push({ volume: p.volume, fromPdf: p.pdfIndex, toPdf: p.pdfIndex, reads: 1, offset: p.offset!, firstPrinted: p.printed, lastPrinted: p.printed });
  }
  return { pages, runs, unread: pages.filter((p) => p.printed === null && !p.stray).length, inferred: pages.filter((p) => p.inferred !== undefined).length, strays: pages.filter((p) => p.stray).length };
}
