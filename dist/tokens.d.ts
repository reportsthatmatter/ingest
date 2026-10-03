/**
 * Word tokens for alignment: runs of letters and digits, lower-cased, with
 * diacritics folded. Offsets are into the original string, so a footnote
 * marker recorded at a character offset can be placed between tokens.
 */
export type Token = {
    word: string;
    start: number;
    end: number;
};
export declare function fold(word: string): string;
export declare function tokens(text: string): Token[];
export declare function words(text: string): string[];
/** How many tokens of `text` start before character `offset`. */
export declare function tokensBefore(text: string, offset: number): number;
export declare const hasLetter: (w: string) => boolean;
