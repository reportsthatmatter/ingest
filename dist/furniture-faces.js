const key = (text) => text.replace(/\s+/g, "");
/**
 * Drops the page's lines that the layout sets in one of `faces` at the page's top or bottom edge.
 * A line is matched to its layout line by its text with all whitespace removed (pdftotext's
 * `-layout` spacing and the layout's differ). Without a layout, or for a page the layout lacks,
 * the lines are returned unchanged.
 */
export function dropFurnitureFaces(lines, faces, context, at, options = {}) {
    const layout = context?.layout;
    if (!layout || !at)
        return lines;
    const page = layout.page(at.volume, at.pdfIndex);
    if (!page)
        return lines;
    const edge = options.edge ?? 0.08;
    const furniture = new Set(page.lines
        .filter((l) => faces.has(l.font) && (l.top < edge * page.height || l.top + l.height > (1 - edge) * page.height))
        .map((l) => key(l.text))
        .filter((k) => k.length > 0));
    if (!furniture.size)
        return lines;
    return lines.filter((line) => !furniture.has(key(line)));
}
