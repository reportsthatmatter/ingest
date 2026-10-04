import type { PipelineContext } from "./context";
import type { Provenance } from "./paragraphs";

export type FurnitureFacesOptions = {
  /**
   * How far from the top or bottom edge of the page, as a share of its height, a line in a declared
   * face must sit to be taken as furniture. Default 0.08: a running head or foot, never the body.
   */
  edge?: number;
};

const key = (text: string) => text.replace(/\s+/g, "");

/**
 * Drops the page's lines that the layout sets in one of `faces` at the page's top or bottom edge.
 * A line is matched to its layout line by its text with all whitespace removed (pdftotext's
 * `-layout` spacing and the layout's differ). Without a layout, or for a page the layout lacks,
 * the lines are returned unchanged.
 */
export function dropFurnitureFaces(
  lines: string[],
  faces: ReadonlySet<string>,
  context: PipelineContext | undefined,
  at: Provenance | undefined,
  options: FurnitureFacesOptions = {}
): string[] {
  const layout = context?.layout;
  if (!layout || !at) return lines;
  const page = layout.page(at.volume, at.pdfIndex);
  if (!page) return lines;
  const edge = options.edge ?? 0.08;
  const furniture = new Set(
    page.lines
      .filter((l) => faces.has(l.font) && (l.top < edge * page.height || l.top + l.height > (1 - edge) * page.height))
      .map((l) => key(l.text))
      .filter((k) => k.length > 0)
  );
  if (!furniture.size) return lines;
  return lines.filter((line) => !furniture.has(key(line)));
}
