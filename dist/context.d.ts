import type { Layout } from "./layout.js";
/**
 * What the host hands the pipeline besides pages: things a pass may read but
 * that are not text. Every field is optional; a pass that needs one and does
 * not find it does what it did before it existed.
 *
 * - `layout`: the source PDFs' line layout (position, font, size, colour of
 *   every printed line), from `openLayout`. Lazy and cached per PDF checksum,
 *   so a pipeline that never asks for it never runs `pdftohtml`.
 *   `layout.lines(volume, pdfIndex)` takes the same `volume` and `pdfIndex` a
 *   `SplitPage` and a block's `at` carry.
 */
export type PipelineContext = {
    layout?: Layout;
};
