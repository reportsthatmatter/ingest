/**
 * The vision-structure hybrid (reportsthatmatter-jsqw, after kyj3; design: the
 * site's docs/design/2026-10-03-vision-structure-pass.md §6).
 *
 * A vision model (granite-docling) read every page image of a scanned report
 * once; its output is committed in the report repo (`reference/vision/
 * doctags.jsonl.gz`, with `manifest.json`). This pass reads it back and, page
 * by page:
 *
 * 1. **Verifies** the model's blocks against the pipeline's own text for the
 *    page (the text layer once furniture and the body passes have run): the
 *    model's words are aligned to the layer's and a block is accepted only
 *    where they agree (`verify.ts`). The layout is a second witness for which
 *    lines are notes (the size they are set in).
 * 2. **Gates** the page: the model's structure is used only when at least
 *    `minAccepted` of its blocks are accepted, it does not lose paragraph
 *    starts, notes or section headings against the pipeline's reading of the
 *    same page, and the page is not a contents page. Otherwise the pipeline's
 *    blocks stand.
 * 3. **Rebuilds** a gated page's blocks from the layer: every layer character
 *    lands in exactly one block, so the served words are the layer's, never
 *    the model's (whether to serve the model's words is decision 0011, fc3x).
 *    Accepted blocks take the model's type and its note markers; rejected
 *    stretches claim no structure and run on into the block before them.
 *
 * Each block keeps its source on `Block.source` ("vision"), the page's printed
 * marker is the pipeline's, and joins across a page break (vision to pipeline,
 * pipeline to vision, vision to vision) are the pipeline's own
 * `mergeAcrossPages`, run over the mixed blocks as over any others.
 *
 * Relation to `cleanEdition` (edition.ts): that mode replaces the whole text
 * with an edition's and keeps the PDF only for pages and fidelity; this one
 * keeps the PDF's words everywhere and swaps only the block structure of the
 * pages that pass the gate. They do not combine (`pipeline()` refuses both).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { align } from "../align.js";
import { tokens } from "../tokens.js";
import { headingKey } from "../paragraphs.js";
import { normaliseWhitespace } from "../extract.js";
import { parseDoctags } from "./doctags.js";
import { rejoinLineHyphens, verifyWithLayout } from "./verify.js";
/**
 * Declares that this report takes block structure from a vision model's
 * committed reading of its page images, page by page, behind the gate above.
 *
 * `dir` is the report repo (`import.meta.dirname`); `pack` the gzipped JSON
 * lines `scripts/vision/run.py --manifest` writes (`{page, meta, doctags}` a
 * line), checksummed as a volume is. Each page's DocTags is also checked
 * against the hash its line records. Single volume (`volume`, default 1).
 */
export function visionStructure(options) {
    let cache;
    return {
        name: "visionStructure",
        stage: "vision",
        source: options.pack,
        volume: options.volume ?? 1,
        options: {
            minAccepted: options.minAccepted ?? 0.8,
            strict: options.strict ?? false,
            keepStarts: options.keepStarts ?? false,
            quotesFromPipeline: options.quotesFromPipeline ?? true,
        },
        read() {
            if (cache)
                return cache;
            const buffer = readFileSync(join(options.dir, options.pack.path));
            const sha256 = createHash("sha256").update(buffer).digest("hex");
            if (sha256 !== options.pack.sha256) {
                throw new Error(`visionStructure: checksum mismatch for ${options.pack.path}\n  definition: ${options.pack.sha256}\n  on disk:    ${sha256}`);
            }
            cache = readPack(gunzipSync(buffer).toString("utf8"));
            return cache;
        },
    };
}
/** The pack's lines → DocTags by PDF page, each checked against its recorded hash. */
export function readPack(jsonl) {
    const out = new Map();
    for (const line of jsonl.split("\n")) {
        if (!line.trim())
            continue;
        const row = JSON.parse(line);
        const want = row.meta?.doctags_sha256;
        if (want) {
            const got = createHash("sha256").update(row.doctags, "utf8").digest("hex");
            if (got !== want)
                throw new Error(`visionStructure: page ${row.page}'s DocTags do not match their recorded hash`);
        }
        out.set(row.page, row.doctags);
    }
    return out;
}
const BODY_KINDS = new Set(["paragraph", "quote", "heading", "list"]);
const blockText = (b) => (b.kind === "list" ? b.items.join("\n") : b.kind === "page" ? "" : b.text);
function pipelineStarts(blocks) {
    let n = 0;
    for (const b of blocks) {
        if (b.kind === "list")
            n += b.items.length;
        else if (BODY_KINDS.has(b.kind))
            n++;
    }
    return n;
}
/**
 * What one page becomes. `body` and `footLines` are the pipeline's lines for
 * the page (after furniture and body passes; `footLines` the page-foot notes
 * it split off), `pipeline` its blocks and `pipelineNotes` the notes it read
 * there; `corrections` the text every correction of the report finds; `noteFlags` (optional, from the layout) says which body lines are
 * set in the note size.
 */
export function visionPage(input) {
    const { at, options } = input;
    const record = {
        volume: at.volume,
        pdfIndex: at.pdfIndex,
        printed: at.printed,
        source: "pipeline",
        blocks: 0,
        accepted: 0,
        starts: { vision: 0, pipeline: pipelineStarts(input.pipeline) },
        notes: { vision: 0, pipeline: input.pipelineNotes.length },
        words: 0,
    };
    const keep = (reason) => ({ record: { ...record, reason } });
    if (input.doctags === undefined)
        return keep("no vision output for the page");
    if (input.pipeline.some((b) => b.kind === "contents"))
        return keep("a contents page");
    const lines = rejoinLineHyphens([
        ...input.body.map((text, i) => ({ text, note: input.noteFlags?.[i] ?? false })),
        ...input.footLines.map((text) => ({ text, note: true })),
    ], input.vocab);
    const v = verifyWithLayout(parseDoctags(input.doctags), lines, options.strict ? {} : { minAgreement: 0.75, maxRun: 8 });
    const layerText = v.layerText;
    const lt = tokens(layerText);
    record.words = lt.length;
    const spans = v.blocks.filter((b) => b.span[1] > b.span[0]);
    record.blocks = v.blocks.length;
    record.accepted = v.blocks.filter((b) => b.accepted).length;
    if (!lt.length)
        return keep("no words on the page");
    if (!v.blocks.length || record.accepted / v.blocks.length < options.minAccepted) {
        return keep(`${record.accepted} of ${v.blocks.length} blocks accepted`);
    }
    // where the pipeline's own page-foot notes begin in the layer text (they follow the body lines)
    const footStart = input.footLines.length ? layerText.length - lines.slice(input.body.length).reduce((n, l) => n + l.text.length + 1, 0) : layerText.length;
    const built = rebuild(spans, layerText, lt, pipelineParagraphStarts(input.pipeline, layerText, lt), footStart);
    const bodyOut = built.body;
    record.starts.vision = bodyOut.length;
    record.notes.vision = built.notes.length;
    if (built.words !== lt.length)
        return keep(`word count changed (${lt.length} → ${built.words})`);
    if (options.keepStarts && record.starts.vision < record.starts.pipeline) {
        return keep(`fewer paragraph starts than the pipeline (${record.starts.vision} < ${record.starts.pipeline})`);
    }
    if (record.notes.vision < record.notes.pipeline) {
        return keep(`fewer notes than the pipeline (${record.notes.vision} < ${record.notes.pipeline})`);
    }
    // A section heading the pipeline read here must survive, at its level, or the report's sections move.
    const pipelineHeadings = new Map();
    for (const b of input.pipeline)
        if (b.kind === "heading")
            pipelineHeadings.set(headingKey(b.text), { level: b.level, text: b.text });
    const visionHeadings = new Set(bodyOut.filter((b) => b.kind === "heading").map((b) => headingKey(b.text)));
    for (const [key, { level }] of pipelineHeadings) {
        if (level <= 3 && !visionHeadings.has(key))
            return keep(`the pipeline's section heading "${key.slice(0, 40)}" is not a heading in the vision reading`);
    }
    // A correction is a human judgement about the text as the pipeline reads it: one that finds its text on this
    // page in the pipeline's reading must still find it in the vision reading, or the page keeps the pipeline's.
    if (input.corrections?.length) {
        const pipelineText = [...input.pipeline.map(blockText), ...input.pipelineNotes].join("\n");
        const visionText = [...bodyOut.map((b) => b.text), ...built.notes.map((n) => n.text)].join("\n");
        for (const find of input.corrections) {
            if (pipelineText.includes(find) && !visionText.includes(find))
                return keep(`correction text no longer read here: "${find.slice(0, 40)}"`);
        }
    }
    // quotations: where the pipeline read the same words as one
    const quoteTokens = options.quotesFromPipeline ? pipelineQuoteTokens(input.pipeline, lt) : new Uint8Array(lt.length);
    const source = { at, source: "vision" };
    const blocks = bodyOut.map((b) => {
        if (b.kind === "heading") {
            // a heading the pipeline also read is the pipeline's (its level, and its text, which drops the enumerator
            // the layer garbles: "11. CONCLUSIONS" is "CONCLUSIONS"), so no section or slug moves; a new one is a subhead
            const same = pipelineHeadings.get(headingKey(b.text));
            return { kind: "heading", level: same?.level ?? 4, text: same?.text ?? b.text, ...source };
        }
        let inQuote = 0;
        for (let j = b.lo; j < b.hi; j++)
            inQuote += quoteTokens[j];
        const quote = b.hi > b.lo && inQuote / (b.hi - b.lo) >= 0.8;
        return quote ? { kind: "quote", text: b.text, ...source } : { kind: "paragraph", text: b.text, ...source };
    });
    return { record: { ...record, source: "vision" }, blocks, notes: built.notes };
}
/**
 * The paragraph starts of the pipeline's reading of the page that the vision reading may have run together:
 * the layer token each pipeline block opens on, where that token opens its line, the line is indented past
 * the page's commonest indent (a first-line indent), and the text before it ends a sentence. The pipeline's
 * other starts (a line at the margin after a full stop, a line after no stop at all) are where it over-splits
 * this scan, and are not taken.
 */
function pipelineParagraphStarts(pipeline, layerText, lt) {
    const out = new Set();
    const pw = [];
    const opens = [];
    for (const b of pipeline) {
        const texts = b.kind === "list" ? b.items : b.kind === "page" || b.kind === "contents" ? [] : [b.text];
        for (const text of texts)
            tokens(text).forEach((t, i) => (pw.push(t.word), opens.push(i === 0 && b.kind !== "heading")));
    }
    if (!pw.length)
        return out;
    // each line's start and indent
    const lineStarts = [0];
    for (let c = 0; c < layerText.length; c++)
        if (layerText[c] === "\n")
            lineStarts.push(c + 1);
    const indentOf = (start) => /^[ \t]*/.exec(layerText.slice(start, start + 40))[0].length;
    const counts = new Map();
    for (let i = 0; i < lineStarts.length; i++) {
        const end = i + 1 < lineStarts.length ? lineStarts[i + 1] : layerText.length;
        if (end - lineStarts[i] < 40)
            continue;
        const n = indentOf(lineStarts[i]);
        counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    if (!counts.size)
        return out;
    const modal = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const { map } = align(pw, lt.map((t) => t.word));
    map.forEach((j, i) => {
        if (!opens[i] || j <= 0)
            return;
        let line = 0;
        while (line + 1 < lineStarts.length && lineStarts[line + 1] <= lt[j].start)
            line++;
        if (layerText.slice(lineStarts[line], lt[j].start).trim() !== "")
            return;
        if (indentOf(lineStarts[line]) <= modal)
            return;
        const before = layerText.slice(0, lineStarts[line]).replace(/\s+$/, "");
        if (!/[.?!:]["'\u201d\u2019)\]]*$/.test(before))
            return;
        out.add(j);
    });
    return out;
}
/**
 * The page's layer text partitioned among the verified blocks: every layer
 * token belongs to exactly one block (a token no block's span holds goes with
 * the block before it), and every character with it, from the start of the
 * whitespace-delimited word that holds a block's first token.
 */
function rebuild(spans, layerText, lt, splitAt = new Set(), footStart = layerText.length) {
    const sorted = [...spans].sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1]);
    // each token's owner: an accepted block's span first (the verifier can leave a dropped stretch overlapping the
    // block after it), then the rest
    const owner = new Int32Array(lt.length).fill(-1);
    for (const accepted of [true, false]) {
        sorted.forEach((b, i) => {
            if (b.accepted !== accepted)
                return;
            for (let j = b.span[0]; j < b.span[1]; j++)
                if (owner[j] < 0)
                    owner[j] = i;
        });
    }
    let last = owner.find((o) => o >= 0) ?? 0;
    for (let j = 0; j < lt.length; j++) {
        if (owner[j] < 0)
            owner[j] = last;
        else
            last = owner[j];
    }
    // units: maximal runs of one owner, in token order
    const units = [];
    for (let j = 0; j < lt.length; j++) {
        const o = owner[j];
        const prev = units[units.length - 1];
        const atFoot = lt[j].start >= footStart && (j === 0 || lt[j - 1].start < footStart);
        if (prev && prev.block === sorted[o] && prev.hi === j && !splitAt.has(j) && !atFoot)
            prev.hi = j + 1;
        else
            units.push({ block: sorted[o], lo: j, hi: j + 1 });
    }
    // character boundaries: back from a unit's first token over what opens it (a quotation mark, a bracket), but
    // not over the previous token or the punctuation that closes it: in "listen.71" the stop is the sentence's
    const charStart = (j) => {
        let s = lt[j].start;
        const floor = j > 0 ? lt[j - 1].end : 0;
        while (s > floor && !/[\s.,;:!?)\]}\u201d\u2019]/.test(layerText[s - 1]))
            s--;
        return s;
    };
    const starts = units.map((u, k) => (k === 0 ? 0 : charStart(u.lo)));
    const textOf = (k) => layerText.slice(starts[k], k + 1 < units.length ? starts[k + 1] : layerText.length);
    const body = [];
    const notes = [];
    let words = 0;
    // A note the model reads as starting above the pipeline's page-foot block ("listen.71" taken into note 75,
    // whose label the layer garbled) starts at the foot: the words above it are the body's.
    const inFoot = (u) => lt[u.lo].start >= footStart;
    const spansFoot = new Set(units.filter((u) => inFoot(u) && u.block.type === "footnote").map((u) => u.block));
    const aboveFoot = units.map((u) => spansFoot.has(u.block) && !inFoot(u));
    const firstOf = units.map((u, k) => !aboveFoot[k] && units.findIndex((x, i) => x.block === u.block && !aboveFoot[i]) === k);
    // A note is a block the model tags as one and the verifier accepts, opening with a label; what follows it
    // that the model also tags as note text (a second block of the same note, a rejected stretch set in the note
    // size) runs on into it. Note-class words before the page's first note are body text, as the layer has them.
    // (the lines the pipeline itself split off as page-foot notes are note text whatever the model calls them: the
    // model reads a note the layer lacks, "87 Ibid.", as a paragraph, and the layer's stray "I ." would end the body)
    const isNoteUnit = units.map((u, k) => !aboveFoot[k] && (inFoot(u) || (u.block.accepted ? u.block.type === "footnote" : u.block.noteShare !== undefined ? u.block.noteShare >= 0.5 : u.block.type === "footnote")));
    const inNote = units.map(() => false);
    units.forEach((u, k) => {
        if (!isNoteUnit[k])
            return;
        const b = u.block;
        const raw = textOf(k);
        const opened = b.accepted && b.label && firstOf[k] ? noteOpening(raw, b.label) : undefined;
        if (opened) {
            notes.push({ label: opened.label, number: Number.parseInt(opened.label, 10), text: collapse(opened.text) });
            inNote[k] = true;
        }
        else if (notes.length) {
            notes[notes.length - 1].text = collapse(`${notes[notes.length - 1].text} ${raw}`);
            inNote[k] = true;
        }
    });
    const labelsKept = new Set(notes.map((n) => n.label));
    units.forEach((u, k) => {
        const b = u.block;
        words += u.hi - u.lo;
        if (inNote[k])
            return;
        const raw = textOf(k);
        const text = collapse(withMarkers(raw, starts[k], b, u, lt, layerText, labelsKept));
        if (!text)
            return;
        const prevBody = body[body.length - 1];
        if (isNoteUnit[k]) {
            // note text with no labelled note to join (before the page's first note): a paragraph of its own, as the
            // pipeline leaves it, so it does not sit inside a sentence that runs on over the page break
            if (prevBody?.note) {
                prevBody.text = collapse(`${prevBody.text} ${text}`);
                prevBody.hi = u.hi;
            }
            else
                body.push({ kind: "paragraph", text, lo: u.lo, hi: u.hi, note: true });
            return;
        }
        // a block of no letters (a stray number, a table cell) claims no structure of its own. A paragraph start the
        // pipeline read at an indented line after a full stop is one, inside a model paragraph (the model runs two
        // paragraphs together and the words cannot show it) or at a block the verifier rejected (its words disagree,
        // its start is still two witnesses' reading)
        const own = b.accepted && firstOf[k];
        const claims = (own || splitAt.has(u.lo)) && /\p{L}/u.test(text);
        if (claims) {
            body.push({ kind: own && b.type === "heading" && headingLike(text) ? "heading" : "paragraph", text, lo: u.lo, hi: u.hi });
        }
        else if (prevBody && prevBody.kind === "paragraph" && !prevBody.note) {
            // no structure is claimed: the words run on into the paragraph before
            prevBody.text = collapse(`${prevBody.text} ${text}`);
            prevBody.hi = u.hi;
        }
        else {
            body.push({ kind: "paragraph", text, lo: u.lo, hi: u.hi });
        }
    });
    return { body, notes, words };
}
/** As the pipeline sets a block's text (`normaliseWhitespace`): one space, straight quotes, no U+FFFD. */
const collapse = (s) => normaliseWhitespace(s.replace(/\s+/g, " "));
/**
 * Whether a block the model tagged as a heading reads as one: it has a letter, and it does not end as a
 * sentence or a lead-in does ("Mr. Mulloy testified:", "And,", "(See appendix V-H.)"). The model tags such
 * short lines as headings; they are the paragraph's own text.
 */
export function headingLike(text) {
    const t = text.replace(/\[\^[^\]]*\]/g, "").trim();
    if (!/\p{L}/u.test(t))
        return false;
    return !/[:;,]$/.test(t) && !/[.!?]["'”’)]*$/.test(t);
}
/**
 * A note's label and text. The label is the model's: it reads note numbers off the page image far better
 * than this scan's text layer does ("0 bid." for 10 Ibid., "45 bid." for 43), and a label is structure, not
 * prose. The layer's text loses its opening digits only where they are that label, spaced or not ("4 1
 * Ibid." for 41); otherwise it stands whole ("g Ibid." for 9): a misread label is the layer's word, and
 * only a human can say it is not one.
 */
export function noteOpening(raw, modelLabel) {
    if (!/^\d{1,4}$/.test(modelLabel))
        return undefined;
    const spaced = /^\s*(\d(?: ?\d){0,3})(?!\d)/.exec(raw);
    if (spaced && spaced[1].replace(/ /g, "") === modelLabel)
        return { label: modelLabel, text: raw.slice(spaced[0].length) };
    return { label: modelLabel, text: raw };
}
/**
 * A body block's text with its note markers set as `[^label]`, for labels whose notes the page keeps.
 *
 * The model says where a marker is; the layer's characters must also look like one, because setting a
 * marker removes them: the label's own digits (or, where the verifier found the layer misread them, a
 * token no longer than the label, glued to what precedes it: "criteria.6g"), closed up to the word or
 * punctuation before them, or set off after punctuation ("landing. 23"), and not running into a word.
 * "13 of the 23 missions" is never a marker, whatever the model says. A marker the layer does not show
 * is left out, as a bare number is left by the pipeline's own linkers.
 */
function withMarkers(raw, start, b, u, lt, layerText, kept) {
    const marks = b.accepted ? b.markers.filter((m) => kept.has(m.label) && m.token >= u.lo && m.token < u.hi) : [];
    if (!marks.length)
        return raw;
    let out = "";
    let pos = start;
    const byTok = new Map();
    for (const m of marks)
        byTok.set(m.token, [...(byTok.get(m.token) ?? []), m]);
    for (const [j, list] of [...byTok].sort((a, b) => a[0] - b[0])) {
        const t = lt[j];
        const before = t.start > 0 ? layerText[t.start - 1] : "";
        const after = layerText[t.end] ?? "";
        // closed up to a lower-case word or to closing punctuation: "landing.23", "problem,8", "untested88"; not to a
        // hyphen, slash, digit or capital, where the digits are a name's ("STS-3", "SRM-15", "51-L")
        const glued = /[a-z.,;:!?"'\u201d\u2019)\]]/.test(before);
        const afterPunct = /[.,;:!?"'\u201d\u2019)\]]\s+$/.test(layerText.slice(Math.max(0, t.start - 4), t.start));
        const clean = !/[\p{L}\p{N}]/u.test(after);
        const ok = list.filter((m) => m.label === t.word
            ? (glued || afterPunct) && clean
            : Boolean(m.garbled) && glued && clean && t.end - t.start <= m.label.length && !/^[a-z]{2,}$/.test(t.word));
        if (!ok.length)
            continue;
        out += layerText.slice(pos, t.start).replace(/\s+$/, "") + ok.map((m) => `[^${m.label}]`).join("");
        pos = t.end;
    }
    return out + layerText.slice(pos, start + raw.length);
}
/** Which layer tokens the pipeline set inside a quotation, found by aligning its blocks' words to the layer's. */
function pipelineQuoteTokens(pipeline, lt) {
    const flags = new Uint8Array(lt.length);
    const words = [];
    const quoted = [];
    for (const b of pipeline) {
        const texts = b.kind === "list" ? b.items : b.kind === "page" ? [] : [b.text];
        const q = b.kind === "quote" || (b.kind === "list" && b.quoted);
        for (const text of texts) {
            for (const t of tokens(text)) {
                words.push(t.word);
                quoted.push(q);
            }
        }
    }
    if (!quoted.some(Boolean))
        return flags;
    const { map } = align(words, lt.map((t) => t.word));
    map.forEach((j, i) => {
        if (j >= 0 && quoted[i])
            flags[j] = 1;
    });
    return flags;
}
// — The layout as the note witness —
/**
 * Which of a page's pipeline lines are set in the note size, by the layout:
 * the trailing run of lines (a short page number aside) at 0.88 of the body
 * size or less, as the site's verifier reads them; a pipeline line is a note
 * line when most of its words are among theirs.
 */
export function noteFlagsFromLayout(lines, layoutLines, bodySize) {
    const tail = [...layoutLines].sort((a, b) => b.top - a.top || b.left - a.left);
    const bag = new Map();
    let n = 0;
    for (const l of tail) {
        if (l.size <= 0.88 * bodySize) {
            for (const t of tokens(l.text))
                bag.set(t.word, (bag.get(t.word) ?? 0) + 1);
            n++;
        }
        else if (l.text.trim().length < 6)
            continue;
        else
            break;
    }
    if (!n)
        return lines.map(() => false);
    // from the foot up, as the run was read
    const flags = lines.map(() => false);
    for (let i = lines.length - 1; i >= 0; i--) {
        const ws = tokens(lines[i]).map((t) => t.word);
        if (!ws.length)
            continue;
        let hit = 0;
        for (const w of ws) {
            const c = bag.get(w) ?? 0;
            if (c > 0) {
                hit++;
                bag.set(w, c - 1);
            }
        }
        if (hit / ws.length >= 0.5)
            flags[i] = true;
        else
            break;
    }
    return flags;
}
/** The body size the note test measures against: the largest size carrying 15% or more of the document's characters. */
export function layoutBodySize(layout, volume) {
    const chars = new Map();
    for (const page of layout.pages(volume)) {
        for (const l of layout.lines(volume, page))
            chars.set(l.size, (chars.get(l.size) ?? 0) + l.text.length);
    }
    const total = [...chars.values()].reduce((a, b) => a + b, 0);
    const big = [...chars.entries()].filter(([, c]) => c >= 0.15 * total).map(([s]) => s);
    return big.length ? Math.max(...big) : layout.bodyFont.size;
}
/**
 * The pass's state across one ingest: the pipeline calls `page` once per page
 * with its own reading, `footnotes` once the pages are read, `joins` after the
 * page-break joins, and `report` at the end.
 */
export class VisionHybrid {
    pass;
    vocabulary;
    layout;
    corrections;
    pages;
    records = [];
    notesByPage = new Map();
    /** The first block of each page whose source differs from the page before's, for the join count. */
    boundaryHeads = [];
    bodySize;
    vocab;
    lastSource;
    constructor(pass, vocabulary, layout, corrections = []) {
        this.pass = pass;
        this.vocabulary = vocabulary;
        this.layout = layout;
        this.corrections = corrections;
        this.pages = pass.read();
    }
    /** The blocks to use for one page: the pipeline's, or the vision structure's when the page passes the gate. */
    page(input) {
        if (input.volume !== this.pass.volume)
            return input.blocks;
        this.vocab ??= this.vocabulary();
        let noteFlags;
        if (this.layout) {
            this.bodySize ??= layoutBodySize(this.layout, this.pass.volume);
            noteFlags = noteFlagsFromLayout(input.body, this.layout.lines(input.volume, input.pdfIndex), this.bodySize);
        }
        const result = visionPage({
            doctags: this.pages.get(input.pdfIndex),
            body: input.body,
            footLines: input.footLines,
            noteFlags,
            pipeline: input.blocks,
            pipelineNotes: input.pipelineNotes,
            corrections: this.corrections,
            at: input.at,
            vocab: this.vocab,
            options: this.pass.options,
        });
        this.records.push(result.record);
        const blocks = result.blocks ?? input.blocks;
        const source = result.record.source;
        if (result.notes)
            this.notesByPage.set(`${input.volume}:${input.pdfIndex}`, result.notes);
        const head = blocks.find((b) => b.kind !== "page");
        if (head && this.lastSource && this.lastSource !== source) {
            this.boundaryHeads.push({ block: head, from: this.lastSource, to: source, pdfIndex: input.pdfIndex });
        }
        if (head)
            this.lastSource = source;
        return blocks;
    }
    /**
     * The report's notes with each vision page's replaced by the vision reading's,
     * in page order. A note's tail that ran over onto the next page (`runOvers`,
     * appended to the page's last note by the pipeline) goes to the vision
     * reading's last note on that page, or to the note before the page.
     */
    footnotes(notes, runOvers) {
        if (!this.notesByPage.size)
            return notes;
        const key = (n) => `${n.volume ?? 1}:${n.pdfIndex ?? n.page}`;
        const kept = [];
        const orphans = new Map();
        for (const note of notes) {
            if (!this.notesByPage.has(key(note))) {
                kept.push(note);
                continue;
            }
            const tail = runOvers.get(note);
            if (tail)
                orphans.set(key(note), [...(orphans.get(key(note)) ?? []), tail]);
        }
        for (const record of this.records) {
            const k = `${record.volume}:${record.pdfIndex}`;
            const page = this.notesByPage.get(k);
            if (!page)
                continue;
            const added = page.map((n) => ({
                number: Number.isFinite(n.number) ? n.number : 0,
                text: n.text,
                page: record.pdfIndex,
                volume: record.volume,
                pdfIndex: record.pdfIndex,
                printed: record.printed,
            }));
            const tails = orphans.get(k) ?? [];
            if (tails.length) {
                const target = added[added.length - 1] ?? [...kept].reverse().find((n) => (n.pdfIndex ?? n.page) < record.pdfIndex);
                if (target)
                    target.text = `${target.text} ${tails.join(" ")}`.replace(/\s+/g, " ").trim();
            }
            kept.push(...added);
        }
        const at = (n) => (n.volume ?? 1) * 1e6 + (n.pdfIndex ?? n.page);
        return kept.map((n, i) => ({ n, i })).sort((a, b) => at(a.n) - at(b.n) || a.i - b.i).map((x) => x.n);
    }
    /** Counts the page breaks between sources that the joins closed (`joined` is `mergeAcrossPages`'s output). */
    joins(joined) {
        const present = new Set(joined);
        const closed = this.boundaryHeads.filter((h) => !present.has(h.block));
        return {
            total: this.boundaryHeads.length,
            joined: closed.length,
            examples: closed.slice(0, 20).map((h) => `p${h.pdfIndex} (${h.from} → ${h.to}): "${(h.block.kind === "list" ? h.block.items[0] : "text" in h.block ? h.block.text : "").slice(0, 60)}"`),
        };
    }
    report(boundaries) {
        return { source: this.pass.source, options: this.pass.options, pages: this.records, boundaries };
    }
}
/**
 * The provenance a report repo keeps beside its `full.md` (`reference/vision/hybrid.{md,json}`, written by
 * the site's `pnpm ingest run`): which source every page's and every block's structure came from, why each
 * pipeline page was not given the vision reading, and the joins across the boundaries between the two.
 */
export function renderVisionReport(report, blocks = []) {
    const vision = report.pages.filter((p) => p.source === "vision");
    const words = report.pages.reduce((a, p) => a + p.words, 0);
    const visionWords = vision.reduce((a, p) => a + p.words, 0);
    const reasons = new Map();
    for (const p of report.pages) {
        if (!p.reason)
            continue;
        const key = p.reason.replace(/"[^"]*"/, '"…"').replace(/\d+/g, "N");
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
    const opening = (b) => (b.kind === "list" ? b.items[0] ?? "" : b.kind === "page" ? "" : b.text).replace(/\s+/g, " ").slice(0, 60);
    const provenance = blocks
        .filter((b) => b.kind !== "page")
        .map((b) => ({ pdf: b.at?.pdfIndex ?? null, printed: b.at?.printed ?? null, source: b.source ?? "pipeline", kind: b.kind, opening: opening(b) }));
    const markdown = [
        "# Block structure: vision model or pipeline, page by page",
        "",
        "Generated by `pnpm ingest run` (`visionStructure`, @rtm/ingest src/vision/hybrid.ts; reportsthatmatter-jsqw). Do not edit.",
        "",
        `Pages with the vision model's structure: **${vision.length} of ${report.pages.length}** (${pct(visionWords, words)} of the words). The words are the text layer's everywhere. Gate: at least ${Math.round(report.options.minAccepted * 100)}% of a page's blocks verified (${report.options.strict ? "strict" : "lenient"} setting), no section heading, note or correction text lost${report.options.keepStarts ? ", no paragraph start lost" : ""}.`,
        "",
        `Page breaks between a vision page and a pipeline page: ${report.boundaries.total}, of which the page-break joins closed ${report.boundaries.joined}.`,
        "",
        `Blocks: ${provenance.filter((b) => b.source === "vision").length} from the vision reading, ${provenance.filter((b) => b.source !== "vision").length} from the pipeline (a block joined over a page break keeps the source of the page it starts on).`,
        "",
        "| why a page kept the pipeline's structure | pages |",
        "|---|---:|",
        ...[...reasons].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k.replace(/\|/g, "\\|")} | ${n} |`),
        "",
        "| PDF page | printed | source | blocks accepted | paragraph starts (vision / pipeline) | notes (vision / pipeline) | why not |",
        "|---:|---|---|---|---|---|---|",
        ...report.pages.map((p) => `| ${p.pdfIndex} | ${p.printed ?? ""} | ${p.source} | ${p.accepted}/${p.blocks} | ${p.source === "vision" ? `${p.starts.vision} / ${p.starts.pipeline}` : ""} | ${p.source === "vision" ? `${p.notes.vision} / ${p.notes.pipeline}` : ""} | ${(p.reason ?? "").replace(/\|/g, "\\|")} |`),
        "",
    ].join("\n");
    const json = JSON.stringify({ source: report.source, options: report.options, boundaries: report.boundaries, pages: report.pages, blocks: provenance }, null, 1) + "\n";
    return { markdown, json };
}
