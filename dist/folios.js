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
