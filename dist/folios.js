export function strayFolios(reads, minRun = 3, maxBracketed = 8) {
    const offsetOf = (run) => run[0].printed - run[0].pdfIndex;
    const dropped = new Set();
    for (;;) {
        const live = reads.filter((r) => !dropped.has(r.pdfIndex));
        const runs = [];
        for (const read of live) {
            const last = runs[runs.length - 1];
            if (last && last[0].printed - last[0].pdfIndex === read.printed - read.pdfIndex)
                last.push(read);
            else
                runs.push([read]);
        }
        let changed = false;
        runs.forEach((run, i) => {
            const before = runs[i - 1];
            const after = runs[i + 1];
            const bracketed = before && after && run.length <= maxBracketed && offsetOf(before) === offsetOf(after) && offsetOf(before) !== offsetOf(run);
            const beside = run.length < minRun && [before, after].some((other) => other && other.length >= minRun);
            if (!bracketed && !beside)
                return;
            for (const read of run)
                dropped.add(read.pdfIndex);
            changed = true;
        });
        if (!changed)
            return dropped;
    }
}
/**
 * What `pnpm ingest folios` prints: per PDF page the printed number read, its source (the vision reading, the
 * pipeline's, or an HTML edition with the PDF as shadow), the offset, and the runs of one offset the reads fall
 * into. The run and stray rule is `strayFolios`, the one `foliosInStep` applies: a report that does not declare
 * the pass still has its would-be strays listed (`stray.dropped` false).
 */
export function folioReport(result) {
    const rows = result.folios ?? [];
    const visionAt = new Map((result.vision?.pages ?? []).map((p) => [`${p.volume}:${p.pdfIndex}`, p.source]));
    const marker = new Map();
    for (const b of result.blocks ?? [])
        if (b.kind === "page" && b.at && typeof b.number === "number")
            marker.set(`${b.at.volume}:${b.at.pdfIndex}`, b.number);
    const strays = new Set();
    for (const volume of new Set(rows.map((r) => r.volume))) {
        const reads = rows.filter((r) => r.volume === volume && r.printed !== null).map((r) => ({ pdfIndex: r.pdfIndex, printed: r.printed }));
        for (const pdfIndex of strayFolios(reads))
            strays.add(`${volume}:${pdfIndex}`);
    }
    const pages = rows.map((r) => {
        const key = `${r.volume}:${r.pdfIndex}`;
        const stray = r.printed !== null && (r.dropped || strays.has(key));
        const kept = r.printed !== null && !stray ? r.printed : null;
        const inferred = kept === null ? marker.get(key) : undefined;
        return {
            volume: r.volume,
            pdfIndex: r.pdfIndex,
            printed: kept,
            ...(stray ? { stray: { printed: r.printed, dropped: r.dropped } } : {}),
            ...(inferred !== undefined ? { inferred } : {}),
            source: result.edition ? "html" : visionAt.get(key) ?? "pipeline",
            offset: r.printed === null ? null : r.printed - r.pdfIndex,
        };
    });
    const runs = [];
    for (const p of pages) {
        if (p.printed === null)
            continue;
        const last = runs[runs.length - 1];
        if (last && last.volume === p.volume && last.offset === p.offset) {
            last.toPdf = p.pdfIndex;
            last.reads++;
            last.lastPrinted = p.printed;
        }
        else
            runs.push({ volume: p.volume, fromPdf: p.pdfIndex, toPdf: p.pdfIndex, reads: 1, offset: p.offset, firstPrinted: p.printed, lastPrinted: p.printed });
    }
    return { pages, runs, unread: pages.filter((p) => p.printed === null && !p.stray).length, inferred: pages.filter((p) => p.inferred !== undefined).length, strays: pages.filter((p) => p.stray).length };
}
