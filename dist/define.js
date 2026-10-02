/** Validates a report's definition. Throws rather than ingesting nonsense. */
export function pipeline(def) {
    if (!def.id)
        throw new Error("pipeline has no id");
    if (!def.title)
        throw new Error(`${def.id}: pipeline has no title`);
    if (!def.repo)
        throw new Error(`${def.id}: pipeline has no repo`);
    if (!def.volumes?.length)
        throw new Error(`${def.id}: pipeline lists no volumes`);
    for (const volume of def.volumes) {
        if (!volume?.path)
            throw new Error(`${def.id}: a volume has no path`);
        if (volume.path.startsWith("/") || volume.path.split("/").includes("..")) {
            throw new Error(`${def.id}: volume path "${volume.path}" escapes the report repo`);
        }
    }
    const geometries = (def.passes ?? []).filter((pass) => pass.stage === "geometry");
    if (geometries.length > 1) {
        throw new Error(`${def.id}: more than one geometry pass declared`);
    }
    if ((def.passes ?? []).filter((pass) => pass.stage === "allCapsHeadings").length > 1) {
        throw new Error(`${def.id}: more than one allCapsHeadings pass declared`);
    }
    const passNames = new Set((def.passes ?? []).map((pass) => pass.name));
    if (passNames.has("escapeNumberedParagraphs") && !passNames.has("numberedParagraphs")) {
        throw new Error(`${def.id}: escapeNumberedParagraphs declared without numberedParagraphs — it only escapes the number numberedParagraphs already split on`);
    }
    if (passNames.has("contentsEntries") && !passNames.has("numberedSections")) {
        throw new Error(`${def.id}: contentsEntries declared without numberedSections — it lays out the contents pages numberedSections reads`);
    }
    return def;
}
/**
 * Reads a definition's passes into the shape the executor wants.
 *
 * A report that declares nothing gets the single-volume defaults, which is
 * what every report but Leveson had before passes existed.
 */
export function resolvePasses(def) {
    const passes = def.passes ?? [];
    const geometry = passes.find((pass) => pass.stage === "geometry");
    return {
        geometry: geometry?.scope ?? "document",
        flushFootnoteMarkers: passes.some((pass) => pass.name === "flushFootnoteMarkers"),
        numberedParagraphs: passes.some((pass) => pass.name === "numberedParagraphs"),
        escapeNumberedParagraphs: passes.some((pass) => pass.name === "escapeNumberedParagraphs"),
        escapeLeadingHash: passes.some((pass) => pass.name === "escapeLeadingHash"),
        paragraphNotes: passes.some((pass) => pass.name === "paragraphNotes"),
        chapterContents: passes.some((pass) => pass.name === "chapterContents"),
        listedHeadings: passes.some((pass) => pass.name === "listedHeadings"),
        unmarkedHeadings: passes.some((pass) => pass.name === "unmarkedHeadings"),
        // Inert without the passes it extends: it widens what a contents-matched
        // heading may be, so with no contents to match there is nothing to widen.
        recoverListedHeadings: passes.some((pass) => pass.name === "recoverListedHeadings") &&
            passes.some((pass) => pass.name === "unmarkedHeadings") &&
            passes.some((pass) => pass.name === "listedHeadings"),
        endnotes: passes.some((pass) => pass.name === "endnotes"),
        numberedSections: passes.some((pass) => pass.name === "numberedSections"),
        contentsEntries: passes.some((pass) => pass.name === "contentsEntries"),
        shortSubheads: passes.some((pass) => pass.name === "shortSubheads"),
        shiftedPages: passes.some((pass) => pass.name === "shiftedPages"),
        quoteRunOn: passes.some((pass) => pass.name === "quoteRunOn"),
        quoteListRunOns: passes.some((pass) => pass.name === "quoteListRunOns"),
        unlistedHeadingsMinor: passes.some((pass) => pass.name === "unlistedHeadingsMinor"),
        hangingIndents: passes.some((pass) => pass.name === "hangingIndents"),
        letteredItems: passes.some((pass) => pass.name === "letteredItems"),
        numberedFindings: passes.some((pass) => pass.name === "numberedFindings"),
        doubleSpaced: passes.some((pass) => pass.name === "doubleSpaced"),
        contentsOutline: passes.some((pass) => pass.name === "contentsOutline"),
        listedDivisions: passes.some((pass) => pass.name === "listedDivisions"),
        wrappedHeadings: passes.some((pass) => pass.name === "wrappedHeadings"),
        pageBreakContinuations: passes.some((pass) => pass.name === "pageBreakContinuations"),
        pageBreakQuoteTails: passes.some((pass) => pass.name === "pageBreakContinuations" && "quoteTails" in pass && pass.quoteTails === true),
        citationRunOver: passes.some((pass) => pass.name === "citationRunOver"),
        romanFolios: passes.some((pass) => pass.name === "romanFolios"),
        numberedOutsideTables: passes.some((pass) => pass.name === "numberedOutsideTables"),
        photoCredits: passes.some((pass) => pass.name === "photoCredits"),
        footnoteGap: passes.some((pass) => pass.name === "footnoteGap"),
        quoteInset: passes.find((pass) => pass.stage === "quoteInset")?.columns,
        allCapsHeadings: passes.find((pass) => pass.stage === "allCapsHeadings")?.enabled ?? true,
        numberedHeadings: passes.find((pass) => pass.stage === "numberedHeadings")?.enabled ?? true,
        bodyPasses: passes.filter((pass) => pass.stage === "body"),
        volumePasses: passes.filter((pass) => pass.stage === "volume"),
    };
}
