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
