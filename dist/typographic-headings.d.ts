import type { Layout } from "./layout.js";
import type { Block } from "./paragraphs.js";
/**
 * `typographicHeadings` (reportsthatmatter-a8l): subsection headings read off the PDF's typography,
 * where the text reading ran them into the paragraph after them.
 *
 * `pdftotext -layout` sets a heading on a line of its own, but the block parser only knows a heading
 * by its text (listed in the contents, numbered, all capitals). A heading set only by face and size,
 * as in Hillsborough ("Recognition of the disaster" in 26pt maroon, then paragraph 2.4.20), comes out
 * as the first words of the next paragraph. The layout has what the text lacks: the line's size,
 * weight and colour. This pass finds the heading lines in it and cuts each out of the block that
 * swallowed it.
 *
 * What is a heading line: set larger than the body (`minRatio`, 1.15 times), not in the body's face,
 * not italic (captions), short, not a bare number, not ending a sentence. A face (family, size, weight,
 * colour) counts only when it recurs, on enough pages, so a title page's one-off lines are not a
 * heading style. The faces are ranked by size and the largest takes `firstLevel`, each smaller one
 * level deeper.
 *
 * Opt-in, and for a report whose headings are not marked by their text. It never touches a block that
 * is already a heading, and it does not need the PDF to be tagged: it reads what every PDF has, so it
 * serves any hybrid whose stretches come from the PDF (the gaps `fillGaps` fills).
 */
export type TypographicHeadingsOptions = {
    /** Level of the largest heading face; each smaller face is one level deeper. Default 2. */
    firstLevel?: number;
    /**
     * The heading sizes in points, largest first: only lines set at one of them (within half a point) are
     * headings, the first at `firstLevel`, the next one level deeper. Omitted, every face that qualifies
     * is one, ranked by size. Declare it where the largest face is not a subsection heading
     * (Hillsborough's 35pt is the title of a part or chapter, which its other passes read).
     */
    sizes?: number[];
    /** A heading line is at least this many times the body's size. Default 1.15. */
    minRatio?: number;
    /** Longest heading, in characters. Default 160. */
    maxChars?: number;
    /** A face must be set on at least this many pages to be a heading style. Default 3. */
    minPages?: number;
    /** ... and be at least this many lines. Default 5. */
    minLines?: number;
    /**
     * The heading faces themselves, one list per level from `firstLevel` down, each a layout face key
     * (`family|size|color`, then `|b`, `|i`, as `pnpm ingest page` prints them). Declared, these faces
     * and no others are headings, whatever their size, weight or slant and however often they recur:
     * for a report whose levels are not told apart by size alone. The Post Office Horizon IT Inquiry sets
     * its subsections in 18 to 20pt bold (one 20pt in Open Sans, one in Roboto, the rest 18pt) and the
     * topics under them in 18pt italic, against a 17pt body, so `sizes` can neither group the first nor
     * tell the 18pt bold from the 18pt italic. The other tests (short, not a bare label, not ending a
     * sentence) still apply. Overrides `sizes`, `minRatio`, `minPages` and `minLines`.
     */
    faces?: string[][];
    /**
     * A block the text reading already made a heading, at another level than the face declares, takes
     * the face's level. The Grenfell Tower Inquiry's executive summary heads its account of each Part
     * "Part 3 / The testing and marketing of products (Chapters 15 – 29)" in the face of its subsections;
     * read by its text as a division ("Part 3:"), each became a top-level section beside the volume's own
     * Parts 1 and 2. Matched on letters and digits only, since the division reading adds a colon. Only
     * with `faces`. Default false.
     */
    relevel?: boolean;
    /**
     * A heading set at the head of a block the text reading made a quotation (its bold, inset first line
     * opens one) leaves the paragraph below it as a quotation of one or two lines and the rest of the
     * paragraph as a block of its own, cut where the quotation's lines stop: PSI's "(3) Examination
     * Process" (PDF p.174) and the ~30 subheads like it. With this the remainder joins the paragraph
     * that follows it when it stops short of a sentence's end (reportsthatmatter-bi5), and is a paragraph.
     * Opt-in: a quotation that really follows a heading would stop at a sentence's end, but the reading
     * is the layout's, so the report that has checked it declares it. Default false.
     */
    quotedRemainder?: boolean;
};
export type TypographicHeadingStats = {
    /** Heading faces found, largest first, with the level each was given. */
    faces: Array<{
        face: string;
        level: number;
        lines: number;
        pages: number;
    }>;
    /** Heading lines the layout showed (a heading wrapped over lines counts once). */
    headings: number;
    /** Cut out of a block that ran the heading into its text. */
    split: number;
    /** Already a heading block (left alone, or re-levelled under `relevel`). */
    already: number;
    /** Of those, given the face's level under `relevel`. */
    relevelled?: number;
    /** Not found in any block of the page. */
    unplaced: number;
    misses: Array<{
        volume: number;
        pdfIndex: number;
        text: string;
    }>;
    /** Each heading added, for review. */
    added: Array<{
        volume: number;
        pdfIndex: number;
        level: number;
        text: string;
        before: string;
        after: string;
    }>;
};
type Heading = {
    volume: number;
    pdfIndex: number;
    text: string;
    level: number;
};
/**
 * The heading lines of the layout, wrapped lines joined, each with its level.
 * Exported for the tests.
 */
export declare function layoutHeadings(layout: Layout, options?: TypographicHeadingsOptions): {
    headings: Heading[];
    faces: TypographicHeadingStats["faces"];
};
/**
 * Cuts each heading the layout shows out of the blocks of its page, in place. A block that opens on
 * the heading's words, or holds them after the end of a sentence, becomes (the text before it), the
 * heading, and (the text after it). A block that is already that heading stays as it is.
 */
export declare function applyTypographicHeadings(blocks: Block[], layout: Layout, options?: TypographicHeadingsOptions): TypographicHeadingStats;
export {};
