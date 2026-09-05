/**
 * Publishing a report's rendered content to reportsthatmatter
 * (docs/plans/2026-09-04-content-publishing.md in that repo, §4, §5).
 *
 * Lives here, not in the site, so that both sides of a publish — a report
 * repo computing a manifest and calling the endpoint, and the site's Worker
 * verifying one — use the exact same hashing. Two implementations of "what
 * is this content's version" is two things that can quietly disagree about
 * what a hash means.
 *
 * Publishing is two phases, and only the second one is visible:
 *
 *   1. **Write objects** under `reports/<id>/<hash>/…`. Idempotent, and
 *      nothing points at them, so a half-finished upload is invisible rather
 *      than broken.
 *   2. **Flip the pointer** — one `UPDATE` of `report_versions`. That is the
 *      only non-idempotent step, which is what makes a publish atomic per
 *      report and a rollback the same statement with the previous hash.
 *
 * This goes through the site's endpoint rather than handing every report
 * repo an R2 key and a D1 binding directly, for two reasons the site's plan
 * sets out: a store that eleven repos write to directly is a store nothing
 * can refuse a bad publish from, and a credential that can rewrite the whole
 * corpus is a bad thing to keep in eleven places. `tokenFor` below is what
 * makes a credential per-report instead: derived from one shared secret, so
 * a leaked token can rewrite exactly the report it names.
 *
 * `bin/publish.ts` is the CLI a report repo runs to actually do this —
 * render its own `full.md` with `renderArtifacts` and call the two phases
 * above over HTTP. This module is the pure logic underneath it, exported
 * separately so the site's Worker can import the exact same functions for
 * verification without depending on the CLI or Node.
 */
/** One file of a report's rendered content, keyed by its path under the version prefix. */
export type PublishFile = {
    path: string;
    body: string;
};
/** The digest of one file's bytes. */
export declare function fileHash(body: string): Promise<string>;
/** What a publisher declares it has written: every path, and what is in it. */
export type Manifest = Array<{
    path: string;
    hash: string;
}>;
export declare function manifestFor(files: PublishFile[]): Promise<Manifest>;
/**
 * The version a set of files *is*.
 *
 * Derived from the content, never assigned: two builds of the same text
 * publish to the same key and cannot disagree about which is newer, and a
 * hash that has been served can always be served again, which is what lets a
 * citation pin the text it quoted.
 *
 * Computed over the *manifest* — path and per-file digest — rather than over
 * the bodies, so that `commit` can re-derive it from something small and then
 * check each object one at a time. Verifying a 19 MB report never means
 * holding 19 MB.
 *
 * Sorted by path, and each field length-delimited, so no rearrangement of
 * files and no shifting of a boundary between them can collide.
 */
export declare function contentHash(manifest: Manifest): Promise<string>;
/**
 * Everything a version must contain to be worth pointing at.
 *
 * The reader asks for exactly these; a version missing one of them is a
 * version that 404s in production, which is precisely what `commit` exists to
 * refuse.
 */
export declare function manifestProblems(manifest: Manifest): string[];
/**
 * The token that publishes one report, and only that report.
 *
 * Derived rather than stored: the Worker holds one secret, each report repo
 * holds `tokenFor(secret, its own id)`, and a leaked token can rewrite
 * exactly one report. Nothing has to keep a list of eleven credentials in
 * step, and adding a report issues a token rather than provisioning one.
 */
export declare function tokenFor(secret: string, reportId: string): Promise<string>;
export declare function authorises(secret: string | undefined, reportId: string, presented: string | undefined): Promise<boolean>;
/** A report id that cannot escape its own prefix in an object key. */
export declare function isReportId(value: string): boolean;
/**
 * A path a report is allowed to publish.
 *
 * Only the shapes the reader actually asks for, so a publish cannot fill the
 * bucket with anything the site would never serve — and no `..`, no leading
 * slash, nothing that could climb out of the version prefix.
 */
export declare function isPublishablePath(path: string): boolean;
