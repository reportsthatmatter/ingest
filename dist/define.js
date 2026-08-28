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
        bodyPasses: passes.filter((pass) => pass.stage === "body"),
        volumePasses: passes.filter((pass) => pass.stage === "volume"),
    };
}
