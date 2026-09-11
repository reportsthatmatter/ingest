import { parse } from "yaml";
/** Parses, and says which report's file is at fault rather than throwing a stack. */
function load(yamlText, reportId) {
    try {
        return parse(yamlText);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
        throw new Error(`${reportId}: corrections.yaml is not valid YAML — ${detail}`);
    }
}
export function parseCorrections(yamlText, reportId) {
    const raw = load(yamlText, reportId);
    const corrections = raw?.corrections ?? [];
    const seen = new Set();
    for (const correction of corrections) {
        if (!correction?.id) {
            throw new Error(`${reportId}: a correction has no id — errors have to name one`);
        }
        if (seen.has(correction.id)) {
            throw new Error(`${reportId}: duplicate correction id ${correction.id}`);
        }
        seen.add(correction.id);
        if (typeof correction.find !== "string" || !correction.find) {
            throw new Error(`${reportId}: correction ${correction.id} has no find`);
        }
        if (typeof correction.replace !== "string") {
            throw new Error(`${reportId}: correction ${correction.id} has no replace`);
        }
    }
    return corrections;
}
function inScopeAt(at, where) {
    if (!where)
        return true;
    if (where.volume !== undefined && at.volume !== where.volume)
        return false;
    if (where.printed !== undefined && at.printed !== where.printed)
        return false;
    return true;
}
function inScope(block, where) {
    return inScopeAt({ volume: block.at?.volume, printed: block.at?.printed }, where);
}
/** Every string a block carries that a correction could address. */
function texts(block) {
    if (block.kind === "list")
        return block.items;
    if (block.kind === "page")
        return [];
    return [block.text];
}
function countMatches(text, find) {
    let count = 0;
    let index = text.indexOf(find);
    while (index !== -1) {
        count += 1;
        index = text.indexOf(find, index + find.length);
    }
    return count;
}
/**
 * Applies corrections to the parsed blocks, and to footnote-definition text.
 *
 * **Every correction must match exactly once** — across the body and the
 * footnotes together, since a report's `find` is not told in advance which
 * side its text sits on. Zero matches or more than one fails the build,
 * naming the id. A stale correction is a loud error and never a silent skip
 * — that is what keeps the output reproducible while the parser underneath
 * it changes, and what stops a correction from quietly rotting into a lie
 * about what was reviewed.
 *
 * Footnotes are optional and default to none, so every existing call that
 * only has blocks to correct is unaffected.
 */
export function applyCorrections(blocks, corrections, reportId, footnotes = []) {
    if (!corrections.length)
        return { blocks, footnotes, applied: 0 };
    const out = blocks.map((block) => ({ ...block }));
    const outNotes = footnotes.map((note) => ({ ...note }));
    for (const correction of corrections) {
        let matches = 0;
        for (const block of out) {
            if (!inScope(block, correction.where))
                continue;
            for (const text of texts(block))
                matches += countMatches(text, correction.find);
        }
        for (const note of outNotes) {
            if (!inScopeAt({ volume: note.volume, printed: note.printed }, correction.where))
                continue;
            matches += countMatches(note.text, correction.find);
        }
        if (matches !== 1) {
            const scope = correction.where
                ? ` in ${JSON.stringify(correction.where)}`
                : " in the whole document";
            throw new Error(`${reportId}: correction ${correction.id} matched ${matches} times${scope}, ` +
                "expected exactly 1.\n" +
                `  find: ${JSON.stringify(correction.find)}\n` +
                (matches === 0
                    ? "  The text has changed, or the correction was never right. Re-check it " +
                        "against the scan rather than deleting it blind."
                    : "  Narrow it with `where: { volume, printed }`, or make `find` longer."));
        }
        for (const block of out) {
            if (!inScope(block, correction.where))
                continue;
            if (block.kind === "list") {
                block.items = block.items.map((item) => item.replace(correction.find, correction.replace));
            }
            else if (block.kind !== "page") {
                block.text = block.text.replace(correction.find, correction.replace);
            }
        }
        for (const note of outNotes) {
            if (!inScopeAt({ volume: note.volume, printed: note.printed }, correction.where))
                continue;
            note.text = note.text.replace(correction.find, correction.replace);
        }
    }
    return { blocks: out, footnotes: outNotes, applied: corrections.length };
}
/** Words a correction introduces, so the lossless check does not call them invented. */
export function correctionVocabulary(corrections) {
    return corrections.flatMap((correction) => correction.replace.split(/\s+/));
}
/**
 * The suspects a reviewer has judged correct, so the queue stops listing them.
 *
 * Deliberately keyed on the suspect text rather than a position: the queue is
 * regenerated from scratch on every ingest, and a line number would go stale
 * the moment anything above it moved.
 */
export function parseDismissals(yamlText, reportId) {
    const raw = load(yamlText, reportId);
    const dismissed = raw?.dismissed ?? [];
    for (const entry of dismissed) {
        if (!entry?.match) {
            throw new Error(`${reportId}: a dismissed entry has no match`);
        }
    }
    return dismissed;
}
