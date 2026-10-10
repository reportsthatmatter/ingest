import type { Layout } from "./layout.js";
/**
 * `noteFaceRunOver` (reportsthatmatter-07k, mv0j): the body lines at the foot of a page that are set in the
 * face of the page's own notes. A note that runs over the page break opens the page's footnote area
 * before the page's first note, but the text reading starts the block at the first numbered note, so the
 * run-over (an email exchange, a quotation, paragraphs of its own) stays in the body: PSI's note 1770,
 * three indented paragraphs printed above notes 1771-1775 (PDF p.439), read as a quotation.
 *
 * The layout knows better: those lines are in the notes' size and family, the body's lines are not.
 * Walks up from the end of the body while each non-blank line is set in the first note's face (found in
 * the layout by its text, as `inNoteFace` does) and returns how many body lines that is. A line the
 * layout cannot place, or in any other face (a chart's axis labels, a table), ends the walk.
 */
export declare function noteFaceRunOverCount(layout: Layout, volume: number, pdfIndex: number, body: string[], footnotes: string[]): number;
