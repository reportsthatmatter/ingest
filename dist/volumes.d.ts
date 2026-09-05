import type { Volume } from "./define.js";
/** Absolute path to a volume's PDF, resolved against the report repo. */
export declare function resolveVolume(def: {
    repo: string;
}, volume: Volume, rootDir: string): string;
export declare function fileChecksum(path: string): string;
/**
 * Compares a volume against the checksum the recipe records.
 *
 * Returns a result rather than throwing: the caller decides whether a mismatch
 * is fatal (ingesting) or a warning (reporting). `matched` is null when the
 * recipe has no checksum to compare against yet.
 */
export declare function checkVolume(def: {
    repo: string;
}, volume: Volume, rootDir: string): {
    path: string;
    sha256: string;
    matched: boolean | null;
};
