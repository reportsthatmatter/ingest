import type { PipelineContext } from "./context.js";
import type { Provenance } from "./paragraphs.js";
export type FurnitureFacesOptions = {
    /**
     * How far from the top or bottom edge of the page, as a share of its height, a line in a declared
     * face must sit to be taken as furniture. Default 0.08: a running head or foot, never the body.
     */
    edge?: number;
};
/**
 * Drops the page's lines that the layout sets in one of `faces` at the page's top or bottom edge.
 * A line is matched to its layout line by its text with all whitespace removed (pdftotext's
 * `-layout` spacing and the layout's differ). Without a layout, or for a page the layout lacks,
 * the lines are returned unchanged.
 */
export declare function dropFurnitureFaces(lines: string[], faces: ReadonlySet<string>, context: PipelineContext | undefined, at: Provenance | undefined, options?: FurnitureFacesOptions): string[];
/**
 * Drops the text a figure or chart draws, by its font family (`figureFaces`, reportsthatmatter-7150).
 *
 * The layout lines on the page whose family is one of `families` are the figure's words. A page line
 * that is one of them (whitespace ignored), or is made only of them set apart by three or more
 * spaces (labels side by side, a label beside a caption's folio), goes. A page line that is none of
 * the body's layout lines, but becomes part of one once a figure's words are cut out of it, had them
 * drawn into it ("BS 476-6presentation:", a label over the body's last line): they are cut and the
 * body's words kept. A line that is already the body's own is never touched, so a body word that a
 * figure also uses stays. Without a layout, or for a page the layout lacks, the lines are returned
 * unchanged.
 */
export declare function dropFigureFaces(lines: string[], families: ReadonlySet<string>, context: PipelineContext | undefined, at: Provenance | undefined): string[];
