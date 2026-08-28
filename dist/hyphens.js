/**
 * Rejoining words broken across a line by the typesetter.
 *
 * Justified text hyphenates at the right margin, and `pdftotext` has no way
 * to tell that hyphen from a real one. Joined naively, every one leaves a
 * broken word in the prose — "Specifically, re- cords", "non-con- formances".
 * Columbia carries 2,111 of them, Leveson 656.
 *
 * Whether the hyphen belongs to the word or to the typesetter cannot be
 * decided from the two fragments alone: "re-" + "cords" wants joining into
 * "records", while "well-" + "known" must keep its hyphen. The document
 * itself is the evidence — a word broken at one margin is almost always
 * written whole somewhere else in the same report — so look it up rather
 * than guess.
 */
const BREAK = /([A-Za-zÀ-ÿ]{2,})[-­‐]\s+([a-zà-ÿ][A-Za-zÀ-ÿ]*)/g;
/** Every word the source uses, including its hyphenated compounds. */
export function vocabulary(sourceText) {
    const words = new Set();
    for (const token of sourceText.toLowerCase().split(/[^a-zà-ÿ-]+/)) {
        const word = token.replace(/^-+|-+$/g, "");
        if (word.length > 2)
            words.add(word);
    }
    return words;
}
/**
 * Rejoins words split across a line break.
 *
 * Decided from the document's own vocabulary: if it writes "records"
 * elsewhere, the hyphen was the typesetter's; if it writes "well-known", it
 * was the author's. Only when the document says nothing either way does this
 * fall back to the case of the following word, which is the same guess
 * `mergeAcrossPages` has always made at a page break.
 */
export function rejoinHyphenated(text, words) {
    return text.replace(BREAK, (whole, head, tail) => {
        const joined = `${head}${tail}`.toLowerCase();
        const hyphenated = `${head}-${tail}`.toLowerCase();
        const knowsJoined = words.has(joined);
        const knowsHyphenated = words.has(hyphenated);
        if (knowsJoined && !knowsHyphenated)
            return `${head}${tail}`;
        if (knowsHyphenated && !knowsJoined)
            return `${head}-${tail}`;
        if (knowsJoined && knowsHyphenated) {
            // Both are real words in this document. The break itself is evidence
            // the typesetter made it, so prefer the joined form.
            return `${head}${tail}`;
        }
        // The document has never written either whole. Leave it alone rather than
        // invent a word: a visible break is honest, an invented word is not.
        return whole;
    });
}
