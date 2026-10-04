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
