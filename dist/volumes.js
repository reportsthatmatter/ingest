import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
/** Absolute path to a volume's PDF, resolved against the report repo. */
export function resolveVolume(def, volume, rootDir) {
    return resolve(join(rootDir, def.repo, volume.path));
}
export function fileChecksum(path) {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}
/**
 * Compares a volume against the checksum the recipe records.
 *
 * Returns a result rather than throwing: the caller decides whether a mismatch
 * is fatal (ingesting) or a warning (reporting). `matched` is null when the
 * recipe has no checksum to compare against yet.
 */
export function checkVolume(def, volume, rootDir) {
    const path = resolveVolume(def, volume, rootDir);
    const sha256 = fileChecksum(path);
    return { path, sha256, matched: volume.sha256 ? volume.sha256 === sha256 : null };
}
