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
/** Every word the source uses, including its hyphenated compounds. */
export declare function vocabulary(sourceText: string): Set<string>;
/**
 * Rejoins words split across a line break.
 *
 * Decided from the document's own vocabulary: if it writes "records"
 * elsewhere, the hyphen was the typesetter's; if it writes "well-known", it
 * was the author's. Only when the document says nothing either way does this
 * fall back to the case of the following word, which is the same guess
 * `mergeAcrossPages` has always made at a page break.
 */
export declare function rejoinHyphenated(text: string, words: Set<string>): string;
