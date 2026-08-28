/**
 * The poppler version every committed baseline was produced with.
 *
 * `pdftotext` is an unpinned dependency that drifts. It changed under this
 * project mid-flight: re-ingesting `challenger-accident` with **unchanged**
 * ingestion code once produced 2,000+ lines of diff purely from a Homebrew
 * update two weeks earlier (#108). For a project whose promise is that a
 * citation resolves to the same text forever, that is a real risk — and one
 * a routine `brew upgrade` can trigger with nobody noticing.
 *
 * Bumping this is a deliberate act: change it, re-run `pnpm ingest check`,
 * read the diffs, and re-baseline. Never bump it to make a check pass.
 */
export declare const EXPECTED_POPPLER = "26.08.0";
export declare function popplerVersion(): string;
/** A warning line when the installed poppler is not the pinned one. */
export declare function popplerWarning(): string | null;
