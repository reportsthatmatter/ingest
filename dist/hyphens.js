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
export function rejoinHyphenated(text, words, options = {}) {
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
        // Opt-in (`hyphenFragments`): a head that is no word of the document's own is a
        // fragment, so the break is the typesetter's.
        if (options.fragments && isFragmentBreak(head, tail, options.fragments))
            return `${head}${tail}`;
        return whole;
    });
}
/**
 * Words the source writes whole: not as the head of a line-end break and not as its tail.
 * `vocabulary` counts "indel-" as "indel", so a fragment looks like a word; this does not.
 */
export function wholeWords(sourceText) {
    return vocabulary(sourceText.replace(BREAK, " "));
}
/**
 * A line-end hyphen the vocabulary could not decide (`hyphenFragments`): "indel- ible",
 * "constitu- ents", "Hamp- ton". The typesetter's break, when the head is not a word the
 * document writes whole ("indel" is not; "mid" in "mid- to" and "million" in "million- pounds"
 * are, and stay compounds, unless the tail is no word either: "weld- ing"). A short head ("in- tends", "Boe- amount") before a tail that is a
 * word is as likely a compound or a garble, and a tail of one or two letters is a function word
 * as often as a suffix: those keep their hyphen.
 */
function isFragmentBreak(head, tail, whole) {
    const h = head.toLowerCase();
    const t = tail.toLowerCase();
    if (t.length <= 2)
        return false;
    // A head that is a word ("weld- ing", "con- stituents") breaks only before a tail that is no word.
    if (whole.has(h))
        return !whole.has(t);
    if (h.length <= 3 && whole.has(t))
        return false;
    return true;
}
