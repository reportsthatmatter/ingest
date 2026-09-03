/**
 * Fidelity checks for an ingested report.
 *
 * Layers 1-3 are gates: structural invariants, lossless content, and word-count
 * deltas. They answer "did the pipeline silently destroy something?", which is
 * decidable. They deliberately do not try to answer "is this faithful to the
 * source?", which is not.
 */
import { autoFix } from "./ocr";
const STOP_CHARS = /[^a-z0-9]/g;
/** Front matter is metadata we added, not content extracted from the source. */
function stripFrontMatter(markdown) {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}
/**
 * Both sides of a comparison must be normalised identically. Footnote markers
 * exist as `[^11]` in the output and as a bare `11` in the source, and leaving
 * either in place makes ordinary words ("prospects.[^11]") look invented.
 */
function comparable(text) {
    return text.replace(/\[\^\d+\]:?/g, " ");
}
function words(text) {
    return comparable(text)
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(STOP_CHARS, ""))
        .filter(Boolean);
}
export function structuralChecks(markdown) {
    const checks = [];
    const lines = stripFrontMatter(markdown).split("\n");
    const pageNumberLines = lines.filter((line) => /^\s*\d{1,4}\s*$/.test(line));
    checks.push({
        name: "no bare page-number lines",
        ok: pageNumberLines.length === 0,
        detail: pageNumberLines.length ? `${pageNumberLines.length} left` : "none",
    });
    checks.push({
        name: "no form feeds",
        ok: !markdown.includes("\f"),
        detail: markdown.includes("\f") ? "form feed present" : "none",
    });
    const orphaned = markdown.match(/\[\^(\d+)\]/g) ?? [];
    const defined = new Set((markdown.match(/^\[\^(\d+)\]:/gm) ?? []).map((d) => d.replace(/[^\d]/g, "")));
    const missing = orphaned
        .map((ref) => ref.replace(/[^\d]/g, ""))
        .filter((n) => !defined.has(n));
    checks.push({
        name: "every footnote reference has a note",
        ok: missing.length === 0,
        detail: missing.length ? `${missing.length} orphaned (e.g. ${missing[0]})` : "all resolved",
    });
    const headings = lines.filter((line) => /^#{1,6}\s/.test(line));
    checks.push({
        name: "document has headings",
        ok: headings.length > 0,
        detail: `${headings.length} headings`,
    });
    checks.push({
        name: "no runs of blank lines",
        ok: !/\n{4,}/.test(markdown),
        detail: /\n{4,}/.test(markdown) ? "found 3+ consecutive blanks" : "clean",
    });
    return checks;
}
/**
 * Layer 2: every word of the output must exist in the source. Catches the
 * failure mode that matters most — silently inventing or mangling text — while
 * tolerating the reordering that lifting footnotes necessarily causes.
 */
export function losslessCheck(sourceText, markdown, extraVocabulary = []) {
    // Compare against the source with the same certain-substitution pass applied,
    // so a legitimate OCR repair does not read as invented text — while anything
    // the pipeline actually made up still does.
    // Text a correction deliberately introduced is not in the scan, and is not
    // invented either — it is a human judgement on the record.
    const source = new Set([
        ...words(sourceText),
        ...words(autoFix(sourceText).text),
        ...words(extraVocabulary.join(" ")),
    ]);
    // A footnote marker fused to its word reaches the source as one token
    // ("kidnapping112"), and lifting the marker out leaves a word the source
    // appears never to contain. Splitting the trailing digits off is what makes
    // that legitimate — and only that: anything the pipeline actually invented
    // still has nothing to match.
    for (const word of [...source]) {
        const stem = word.replace(/\d+$/, "");
        if (stem && stem !== word)
            source.add(stem);
    }
    const output = words(stripFrontMatter(markdown));
    const foreign = output.filter((word) => !source.has(word));
    const ratio = output.length ? foreign.length / output.length : 1;
    return {
        name: "output words all appear in the source",
        ok: ratio < 0.001,
        detail: foreign.length === 0
            ? `${output.length} words, all accounted for`
            : `${foreign.length}/${output.length} not in source (e.g. ${foreign.slice(0, 5).join(", ")})`,
    };
}
/** Layer 3: the output must not have lost a meaningful share of the source. */
export function retentionCheck(sourceText, markdown) {
    const sourceWords = words(sourceText).length;
    const outputWords = words(stripFrontMatter(markdown)).length;
    const retained = sourceWords ? outputWords / sourceWords : 0;
    return {
        name: "content retained from source",
        ok: retained > 0.9 && retained < 1.05,
        detail: `${(retained * 100).toFixed(1)}% (${outputWords}/${sourceWords} words)`,
    };
}
/**
 * Layers 1-3 together.
 *
 * `sourceText` must be the text extracted from the source PDF. Passing the
 * markdown itself makes layers 2 and 3 tautologies that report 100% for any
 * input — which is exactly what `ingest verify` silently did for every report
 * until #118, because no report had a `source.pdf` to compare against.
 */
/**
 * Layer 4: are sentences intact?
 *
 * Layers 2 and 3 count words. They cannot see a paragraph severed in the
 * middle and its tail relabelled as a quotation — the words are all still
 * there, in the same document, in the wrong order and the wrong voice. That
 * is how 865 of Litvinenko's 1,089 paragraphs shipped cut in half
 * (uk-litvinenko-inquiry#1), passing every gate.
 *
 * The signature is precise: a paragraph that stops without terminal
 * punctuation, immediately followed by a block quote that opens on a
 * lower-case word — the rest of the same sentence, wearing quotation marks it
 * never had. A genuine quotation is introduced ("as follows:") or opens with
 * a quotation mark, so neither is counted.
 *
 * Measured over the corpus: the broken report scored 0.47, and every report
 * as published scores between 0.0004 and 0.07.
 */
const SEVERED_LIMIT = 0.2;
export function severedSentenceCheck(markdown) {
    const blocks = stripFrontMatter(markdown)
        .split("\n\n")
        .map((block) => block.trim())
        .filter(Boolean);
    const isProse = (block) => !/^(#|>|-|%%|\[\^)/.test(block);
    let severed = 0;
    let paragraphs = 0;
    for (const [i, block] of blocks.entries()) {
        if (!isProse(block))
            continue;
        paragraphs += 1;
        const next = blocks[i + 1];
        if (!next?.startsWith("> "))
            continue;
        if (/[.?!:;]["\u201d]?$/.test(block))
            continue; // the sentence ended
        if (/^> ["\u201c]/.test(next))
            continue; // a quotation opening properly
        if (/^> [a-z\u00e0-\u00ff]/.test(next))
            severed += 1;
    }
    const rate = paragraphs ? severed / paragraphs : 0;
    return {
        name: "sentences are not severed into quotations",
        ok: rate < SEVERED_LIMIT,
        detail: severed
            ? `${severed}/${paragraphs} paragraphs run straight into a quote (${(rate * 100).toFixed(1)}%)`
            : "none",
    };
}
export function runChecks(sourceText, markdown, extraVocabulary = []) {
    if (sourceText === markdown) {
        throw new Error("runChecks was asked to check a document against itself: with the " +
            "markdown as its own source, layers 2 and 3 are tautologies that " +
            "report 100% for any input. Pass the text extracted from the source " +
            "PDF, or call structuralChecks() and say that is all you are checking.");
    }
    return [
        ...structuralChecks(markdown),
        losslessCheck(sourceText, markdown, extraVocabulary),
        retentionCheck(sourceText, markdown),
        severedSentenceCheck(markdown),
    ];
}
