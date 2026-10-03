import { execFileSync } from "node:child_process";
/**
 * Extracts text with `pdftotext -layout`, which preserves leading whitespace.
 * The indentation is load-bearing: it is what tells us where paragraphs begin.
 */
export function extractPages(pdfPath) {
    let raw;
    try {
        raw = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
            encoding: "utf8",
            maxBuffer: 512 * 1024 * 1024,
            stdio: ["ignore", "pipe", "ignore"],
        });
    }
    catch (error) {
        throw new Error(`pdftotext failed on ${pdfPath}. Is poppler installed? (${String(error)})`);
    }
    return raw
        .split("\f")
        .map((page, i) => ({
        index: i + 1,
        // Volume is assigned by the caller: this function sees one PDF and has
        // no way to know where it sits in the report's order.
        volume: 1,
        pdfIndex: i + 1,
        // InDesign's "indent to here" and similar control characters reach the text layer as C0 controls
        // (U+0007 before a note's text, after a contents number): 744 in the Post Office Horizon IT
        // Inquiry's Volume 1, 52 in Leveson. Each becomes a space, so the line's columns stay as laid out.
        lines: page.split("\n").map((line) => line.replace(CONTROL_CHARACTERS, " ")),
    }))
        .filter((page) => page.lines.some((line) => line.trim().length > 0));
}
/** C0 control characters other than tab, line feed and form feed (which `extractPages` splits on). */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000d-\u001f]/g;
/** Normalises the characters pdftotext emits that would otherwise reach output. */
export function normaliseWhitespace(text) {
    return text
        .replace(/ /g, " ")
        // U+FFFD is pdftotext's stand-in for a glyph with no text mapping: no
        // character survives in it to recover. Saville sets a decorative mark
        // after every paragraph number, and 814 of them reached the page as "�".
        .replace(/�/g, " ")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/–/g, "–")
        .replace(/[ \t]+/g, " ")
        .trim();
}
