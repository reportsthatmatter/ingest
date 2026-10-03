/**
 * Word tokens for alignment: runs of letters and digits, lower-cased, with
 * diacritics folded. Offsets are into the original string, so a footnote
 * marker recorded at a character offset can be placed between tokens.
 */
const WORD = /[\p{L}\p{N}]+/gu;
export function fold(word) {
    return word
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
}
export function tokens(text) {
    const out = [];
    for (const m of text.matchAll(WORD)) {
        const word = fold(m[0]);
        if (word)
            out.push({ word, start: m.index, end: m.index + m[0].length });
    }
    return out;
}
export function words(text) {
    return tokens(text).map((t) => t.word);
}
/** How many tokens of `text` start before character `offset`. */
export function tokensBefore(text, offset) {
    let n = 0;
    for (const t of tokens(text)) {
        if (t.start >= offset)
            break;
        n++;
    }
    return n;
}
export const hasLetter = (w) => /\p{L}/u.test(w);
