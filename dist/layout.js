import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, readSync, closeSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { popplerVersion } from "./poppler.js";
let installed;
const decode = (s) => s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
const LABEL = /^(?:\d{1,4}(?:\.\d{1,4})*[.)]?|[a-z][.)]|[A-Z]\.|[ivxlc]{1,5}[.)]|\([a-z0-9]{1,4}\)|[•·▪–-])\s/;
/** A fragment that is only a paragraph label: "2.4", "(b)", "•". */
const LABEL_ONLY = /^\s*(?:\d{1,4}(?:\.\d{1,4})*[.)]?|[a-z][.)]|\([a-z0-9]{1,4}\)|[•·▪–-])\s*$/;
/** A footnote-marker shape: digits, or the usual symbols. */
const MARKER = /^\s*(?:\d{1,4}|[*†‡§])\s*$/;
/** A raised number with the sentence's stop set inside it ("232."): the digits. */
const MARKER_STOPPED = /^\s*(\d{1,4})[.,;]\s*$/;
/**
 * Raised numbers set as one fragment with commas between ("24,25"), or behind
 * the sentence's own stop, set raised with them (".113", ":6"): each number is
 * a marker. Spaces between are taken only for numbers in sequence (Leveson's
 * "8 9 10" after "perceptions:"): a scan's raised "1 2" or "3 17" in a table
 * or a figure is not a list of notes (Challenger's oracle read 89 of them).
 */
const MARKER_LIST = /^\s*[.,:;]?\s?\d{1,4}(?:(?:,\s?|\s)\d{1,4})*\s*$/;
function isMarkerList(text) {
    if (!MARKER_LIST.test(text))
        return false;
    if (/\d,/.test(text) || !/\d\s+\d/.test(text))
        return true;
    const numbers = [...text.matchAll(/\d{1,4}/g)].map((m) => Number(m[0]));
    return numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
}
/**
 * How far a footnote marker's box may start inside the box before it. A fragment's box includes its
 * trailing space, and an italic one's is wider still, so a marker set after a closing quotation mark
 * in an italic quotation starts a pixel or three inside it: "Berezovsky\u201d 33 and" (Litvinenko
 * p.22), "becoming close friends.\u201d 14" (p.18). Without the allowance it was a line of its own
 * and its number stayed bare (reportsthatmatter-4ef1).
 */
const markerOverlap = (lineHeight) => Math.max(2, 0.25 * lineHeight);
/** Parses one `pdftohtml -xml` document into raw lines (no per-page statistics yet). */
export function parseLayoutXml(xml) {
    const lines = [];
    // Font ids are global to the document: a fontspec appears on the first page that uses it.
    const fonts = new Map();
    for (const page of xml.split(/<page /).slice(1)) {
        const num = Number(/number="(\d+)"/.exec(page)[1]);
        const ph = Number(/height="(\d+)"/.exec(page)[1]);
        const pw = Number(/width="(\d+)"/.exec(page)[1]);
        for (const f of page.matchAll(/<fontspec id="(\d+)" size="(-?[\d.]+)" family="([^"]*)" color="([^"]*)"\/>/g)) {
            fonts.set(f[1], { size: Number(f[2]), family: f[3].replace(/^[A-Z]{6}\+/, ""), color: f[4] });
        }
        const frags = [];
        for (const t of page.matchAll(/<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="(\d+)">([\s\S]*?)<\/text>/g)) {
            const text = decode(t[6]);
            if (!text.trim())
                continue;
            frags.push({ top: +t[1], left: +t[2], width: +t[3], height: +t[4], font: t[5], inner: t[6], text });
        }
        // Merge fragments that sit on one baseline and touch (a raised marker, a font change mid-line).
        const used = new Set();
        for (let i = 0; i < frags.length; i++) {
            if (used.has(i))
                continue;
            const parts = [frags[i]];
            used.add(i);
            let right = frags[i].left + frags[i].width;
            for (let j = i + 1; j < frags.length && j < i + MAX_FRAGMENTS_PER_LINE; j++) {
                if (used.has(j))
                    continue;
                const f = frags[j];
                const base = parts[0];
                // fragments arrive line by line: one well below this line's bottom starts the next
                if (f.top > base.top + base.height)
                    break;
                const sameLine = Math.abs(f.top - base.top) <= 3 ||
                    (f.top >= base.top - base.height / 2 && f.top + f.height <= base.top + base.height + 2 && f.height < base.height);
                // A paragraph label ("2.4") often stands off from its text by an indent's width.
                const reach = LABEL_ONLY.test(parts[parts.length - 1].text) ? 100 : 24;
                // (a marker-shaped fragment smaller than the line may overlap the one before: see `markerOverlap`)
                const tolerance = MARKER.test(f.text) && f.height < base.height ? markerOverlap(base.height) : 2;
                if (sameLine && f.left >= right - tolerance && f.left - right < reach) {
                    parts.push(f);
                    used.add(j);
                    right = f.left + f.width;
                }
            }
            // A raised marker poppler emits after the text that follows it on the line ("phone.” ",
            // "He also sent…", then "1585": PSI p.399) goes back into the gap it sits in.
            for (let j = i + 1; j < frags.length && j < i + MAX_FRAGMENTS_PER_LINE; j++) {
                if (used.has(j))
                    continue;
                const f = frags[j];
                const base = parts[0];
                if (f.top > base.top + base.height)
                    break;
                if (!MARKER.test(f.text) || f.height >= base.height)
                    continue;
                if (f.top < base.top - base.height / 2 || f.top + f.height > base.top + base.height + 2)
                    continue;
                const overlap = markerOverlap(base.height);
                const k = parts.findIndex((p, n) => n < parts.length - 1 && f.left >= p.left + p.width - overlap && f.left + f.width <= parts[n + 1].left + overlap);
                if (k < 0)
                    continue;
                parts.splice(k + 1, 0, f);
                used.add(j);
            }
            // The line's face is its longest fragment's, not counting a marker-shaped one: "7." and a raised
            // "1361" is a line of the body's face with a marker, not a line in the marker's 12pt, whose raised
            // digits `layoutMarkers` then skips as smaller than the body (PSI p.359; reportsthatmatter-kvxj).
            const words = parts.filter((p) => !MARKER.test(p.text));
            const main = (words.length ? words : parts).reduce((a, b) => (b.text.length > a.text.length ? b : a));
            const font = fonts.get(main.font) ?? { size: main.height, family: "", color: "" };
            const joined = joinParts(parts, font.size);
            const raised = [];
            parts.forEach((p, k) => {
                if (p === main)
                    return;
                const pf = fonts.get(p.font);
                const smaller = pf ? pf.size <= font.size - 2 : p.height < main.height - 2;
                // (a raised "232." carries the sentence's full stop inside it, Lehman p.77: the digits are the marker;
                // reportsthatmatter-qsfc)
                const marker = MARKER.test(p.text) ? p.text.trim() : MARKER_STOPPED.exec(p.text)?.[1];
                if (smaller && p.top < main.top + main.height / 2 && marker) {
                    const offset = joined.starts[k] + (p.text.length - p.text.trimStart().length);
                    raised.push({ text: marker, size: pf?.size ?? p.height, left: p.left, offset });
                }
                else if (smaller && p.top < main.top + main.height / 2 && isMarkerList(p.text)) {
                    // "£3.8m.²⁴,²⁵" set as one raised fragment: each number is a marker (Hillsborough p.235;
                    // reportsthatmatter-kgpr); so is each of "⁸ ⁹ ¹⁰", and the ".¹¹³" whose stop was set
                    // raised with it (Leveson pp.78, 767; reportsthatmatter-u00i)
                    const from = joined.starts[k];
                    for (const m of p.text.matchAll(/\d{1,4}/g))
                        raised.push({ text: m[0], size: pf?.size ?? p.height, left: p.left, offset: from + m.index });
                }
            });
            const left = parts[0].left;
            const bold = /<b>/.test(main.inner) || /bold|black|heavy|semibold/i.test(font.family);
            const italic = /<i>/.test(main.inner) || /italic|oblique/i.test(font.family);
            lines.push({
                page: num,
                pageHeight: ph,
                pageWidth: pw,
                top: main.top,
                left,
                width: right - left,
                right,
                height: main.height,
                size: font.size,
                family: font.family,
                color: font.color,
                font: `${font.family}|${font.size}|${font.color}${bold ? "|b" : ""}${italic ? "|i" : ""}`,
                bold,
                italic,
                raised,
                text: joined.text,
            });
        }
    }
    return lines;
}
/**
 * A line's fragments as text: poppler may emit each word as its own fragment
 * with no space between, so a gap wider than a hair of the font size is a space.
 * A raised marker sits close against its word and gets none.
 */
function joinParts(parts, size) {
    let out = "";
    let right = 0;
    const starts = [];
    parts.forEach((p, i) => {
        if (i > 0 && p.left - right > 0.15 * size && !/\s$/.test(out) && !/^\s/.test(p.text))
            out += " ";
        starts.push(out.length);
        out += p.text;
        right = p.left + p.width;
    });
    return { text: out, starts };
}
/** Some PDFs emit every word as a fragment: a justified line has dozens. */
const MAX_FRAGMENTS_PER_LINE = 120;
const mode = (xs) => {
    const counts = new Map();
    for (const x of xs)
        counts.set(x, (counts.get(x) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
};
/** Adds the per-page statistics and the em-normalised fields. Pure; the test seam. */
export function buildLayout(volumes, checksums = []) {
    // The body font: the font that sets most pages' text. Footnotes can outweigh the text of a page
    // (Lehman's, in a smaller face, outweigh the whole document), so each page votes for the font
    // with most characters in its upper 70% and the document takes the font with most pages.
    const bodyOf = (raws) => {
        const wins = new Map();
        for (const raw of raws) {
            const pages = new Map();
            for (const l of raw)
                pages.set(l.page, [...(pages.get(l.page) ?? []), l]);
            for (const ls of pages.values()) {
                const chars = new Map();
                for (const l of ls)
                    if (l.top < 0.7 * l.pageHeight)
                        chars.set(l.font, (chars.get(l.font) ?? 0) + l.text.trim().length);
                const winner = [...chars].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
                if (!winner)
                    continue;
                const sample = ls.find((l) => l.font === winner[0]);
                const entry = wins.get(winner[0]) ?? { family: sample.family, size: sample.size, color: sample.color, pages: 0, n: 0 };
                entry.pages++;
                entry.n += winner[1];
                wins.set(winner[0], entry);
            }
        }
        const top = [...wins].sort((a, b) => b[1].pages - a[1].pages || b[1].n - a[1].n || a[0].localeCompare(b[0]))[0];
        return top
            ? { key: top[0], family: top[1].family, size: top[1].size, color: top[1].color, characters: top[1].n }
            : { key: "", family: "", size: 0, color: "", characters: 0 };
    };
    const bodyFont = bodyOf(volumes);
    const byVolume = [];
    volumes.forEach((raw, v) => {
        const pages = new Map();
        for (const l of raw)
            pages.set(l.page, [...(pages.get(l.page) ?? []), l]);
        const out = new Map();
        // The volume's own margin: the commonest left of its longer body lines. A page that has two
        // or more lines there is measured from it, so a page given over to an indented quotation does
        // not take the quotation's inset for the margin.
        const volumeKey = bodyOf([raw]).key;
        const longLefts = raw.filter((l) => l.font === volumeKey && l.text.trim().length >= 40).map((l) => Math.round(l.left / 3) * 3);
        const volumeLeft = mode(longLefts);
        for (const [num, ls] of pages) {
            const bodyKey = pageBodyKey(ls, volumeKey);
            const body = ls.filter((l) => l.font === bodyKey);
            const long = body.filter((l) => l.text.trim().length >= 40);
            const pool = long.length >= 3 ? long : body.length ? body : ls;
            const atVolumeLeft = pool.filter((l) => Math.abs(l.left - volumeLeft) <= 3).length;
            const modal = atVolumeLeft >= 2 ? volumeLeft : mode(pool.map((l) => Math.round(l.left / 3) * 3));
            // The modal bucket is 3 units wide; the margin is the median of the lefts in it.
            const inBucket = pool.filter((l) => Math.abs(l.left - modal) <= 3).map((l) => l.left).sort((a, b) => a - b);
            const left = inBucket.length ? inBucket[Math.floor(inBucket.length / 2)] : modal;
            const rights = pool.map((l) => l.right).sort((a, b) => a - b);
            const right = rights[Math.floor(rights.length * 0.9)] ?? 0;
            // The line pitch: the median of the smaller half of the gaps between consecutive lines at the
            // margin (a paragraph gap is a pitch and a half or more, so the smaller half is all pitch;
            // quotations, often set tighter, are not at the margin). Fewer than 5 such lines say nothing.
            const flush = body.filter((l) => Math.abs(l.left - left) <= 3);
            const gaps = [];
            for (let i = 1; i < flush.length; i++) {
                const g = flush[i].top - flush[i - 1].top;
                if (g > 0)
                    gaps.push(g);
            }
            gaps.sort((a, b) => a - b);
            const small = gaps.slice(0, Math.max(1, Math.ceil(gaps.length / 2)));
            const pitch = gaps.length >= 4 ? small[Math.floor(small.length / 2)] : 0;
            const lines = ls.map((l, index) => ({
                ...l,
                volume: v + 1,
                index,
                body: l.font === bodyKey,
                label: LABEL.test(l.text.trim() + " "),
                indentEm: l.size > 0 ? round((l.left - left) / l.size) : 0,
                rightGapEm: l.size > 0 ? round((right - l.right) / l.size) : 0,
                reachesRight: l.size > 0 && (right - l.right) / l.size < 0.5,
            }));
            out.set(num, { volume: v + 1, page: num, width: ls[0].pageWidth, height: ls[0].pageHeight, left, right, pitch, bodyFont: bodyKey, lines });
        }
        byVolume.push(out);
    });
    return {
        volumes: volumes.length,
        lines: (volume, page) => byVolume[volume - 1]?.get(page)?.lines ?? [],
        page: (volume, page) => byVolume[volume - 1]?.get(page),
        pages: (volume) => [...(byVolume[volume - 1]?.keys() ?? [])].sort((a, b) => a - b),
        bodyFont,
        checksums,
    };
}
/**
 * A page with little in the document's body font and mostly one other
 * is set in that font (Hillsborough's summary pages are maroon throughout);
 * a page with a few lines in it (a title page) keeps the document's.
 */
function pageBodyKey(ls, documentKey) {
    const chars = new Map();
    for (const l of ls)
        chars.set(l.font, (chars.get(l.font) ?? 0) + l.text.trim().length);
    // The document's font wins wherever it has a page's worth to say: footnotes in another
    // font can outweigh the text on a page without being what it is set in.
    if ((chars.get(documentKey) ?? 0) >= PAGE_BODY_MIN_CHARACTERS)
        return documentKey;
    const [key, n] = [...chars].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [documentKey, 0];
    return n >= PAGE_BODY_MIN_CHARACTERS ? key : documentKey;
}
const PAGE_BODY_MIN_CHARACTERS = 400;
const round = (x) => Math.round(x * 100) / 100;
/**
 * The em-normalised first-line indent of `line` relative to the line under
 * it: positive when `line` starts to the right of `next`, negative when it is
 * outdented (a hanging number). The layout gate of a page-break join.
 */
export function indentVersus(line, next) {
    return line.size > 0 ? round((line.left - next.left) / next.size) : 0;
}
// — Cache —
function sha256(path) {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function header(path) {
    const fd = openSync(path, "r");
    try {
        const buffer = Buffer.alloc(400);
        readSync(fd, buffer, 0, 400, 0);
        return buffer.toString("utf8");
    }
    finally {
        closeSync(fd);
    }
}
/**
 * The `pdftohtml -xml` of one PDF, cached at `<cacheDir>/layout-<sha256>.xml`.
 * `-hidden` keeps the invisible OCR text layer of a scanned PDF, which `pdftotext` (and so the
 * pipeline) reads and `pdftohtml` otherwise drops. The cache is rebuilt when the poppler that wrote it is not the installed
 * one. `cacheDir` is `<report-repo>/.cache`; a `.gitignore` of `*` is written
 * inside it, so no report repo has to ignore it.
 */
export function layoutXml(pdf, cacheDir, checksum = sha256(pdf)) {
    mkdirSync(cacheDir, { recursive: true });
    const ignore = join(cacheDir, ".gitignore");
    if (!existsSync(ignore))
        writeFileSync(ignore, "*\n", "utf8");
    const cached = join(cacheDir, `layout-${checksum}.xml`);
    if (existsSync(cached)) {
        const version = /<pdf2xml[^>]*version="([^"]*)"/.exec(header(cached))?.[1];
        if (version === (installed ??= popplerVersion()))
            return readFileSync(cached, "utf8");
    }
    let xml;
    try {
        xml = execFileSync("pdftohtml", ["-xml", "-i", "-q", "-hidden", "-nodrm", "-enc", "UTF-8", "-stdout", pdf], {
            encoding: "utf8",
            maxBuffer: 2 * 1024 * 1024 * 1024,
            stdio: ["ignore", "pipe", "ignore"],
        });
    }
    catch (error) {
        throw new Error(`pdftohtml failed on ${pdf}. Is poppler installed? (${String(error)})`);
    }
    const tmp = `${cached}.${process.pid}.tmp`;
    writeFileSync(tmp, xml, "utf8");
    renameSync(tmp, cached);
    return xml;
}
/**
 * Opens the line layout of a report's PDFs, in the order its definition lists
 * them (a multi-volume report is one document; `volume` is 1-based). Reads
 * and parses lazily, so a pass that never asks for a layout costs nothing.
 */
export function openLayout(pdfs, cacheDir) {
    let built;
    const build = () => {
        if (built)
            return built;
        const checksums = pdfs.map((p) => sha256(p));
        built = buildLayout(pdfs.map((pdf, i) => parseLayoutXml(layoutXml(pdf, cacheDir, checksums[i]))), checksums);
        return built;
    };
    return {
        get volumes() {
            return pdfs.length;
        },
        lines: (v, p) => build().lines(v, p),
        page: (v, p) => build().page(v, p),
        pages: (v) => build().pages(v),
        get bodyFont() {
            return build().bodyFont;
        },
        get checksums() {
            return build().checksums;
        },
    };
}
