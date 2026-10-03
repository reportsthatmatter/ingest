/**
 * Worked examples for the page-break referee (reportsthatmatter-38s.11): real
 * page breaks from the test fixtures (tests/fixtures/pagebreaks/), described
 * exactly as `describeCase` describes a case. Drawn from development and
 * PDF-only reports, never the held-out set (reports/score-sets.yaml in the
 * site). `key` is the case key, so an evaluation can leave these breaks out.
 * Regenerate by hand if `describeCase` changes: the prompt id changes with
 * this file, so every cached answer records which examples it saw.
 */
export declare const REFEREE_EXAMPLES: Array<{
    source: string;
    key: string;
    text: string;
    answer: "JOIN" | "SPLIT";
    why?: string;
}>;
