/**
 * FOIA redactions (`foiaRedactions`, reportsthatmatter-gqsy.5).
 *
 * A U.S. federal document released under the Freedom of Information Act is printed with its withheld
 * passages blacked out, and each black box carries the exemption it was withheld under, printed in white
 * inside it: "(b) (6), (b) (7)(C)" (personal privacy), "(b) (3)" (a statute: grand-jury material under
 * Rule 6(e)), "(b) (7)(A)" (ongoing enforcement proceedings), "(b) (7)(E)" (investigative techniques). The
 * page margin beside each box repeats the codes with the release's own category number ("(b)(3)-1",
 * "(b)(7)(E)-2", "(b)(6)/" over "(b)(7)(C)-2"). The Department of Justice's releases of the Mueller report
 * are printed this way.
 *
 * Read as text, the box labels are words in the middle of a sentence ("of Michael Cohen, Richard Gates,
 * (b) (6), (b) (7)(C) Roger Stone"), and the margin labels are welded onto whichever line they sit beside
 * ("…interfere in the 2016 (b)(6)/"). This pass makes the redaction visible and keeps its printed label:
 * a box label becomes `[Redacted: (b)(6), (b)(7)(C)]`, and a margin label, which only repeats the box's
 * codes with a processing number, is taken out. Nothing else is touched.
 *
 * The two are told apart by how they are printed. A box label spaces its codes ("(b) (6)"); a margin label
 * does not ("(b)(6)") and ends in its category number ("-2") or a slash ("(b)(6)/" continued on the next
 * line). A scanned page's OCR spells the brackets as braces ("(b} (7}(A}") and reads the category's "1" as
 * "l"; both are accepted. Only real exemptions are read: (b)(1) to (b)(9), with a letter only after
 * (b)(7). A statute's own subsection ("18 U.S.C. § 1512(b)(3)", "and (b)(1)(D).") is never touched: a code
 * that follows a digit, or runs on into a further bracket, is not a label.
 */
/**
 * The codes of a matched run, set as the box prints them: "(b} (7}(A}, (b} (3)" → "(b) (7)(A)", "(b) (3)".
 * The box's spacing is kept so that the marker's codes are the PDF's own words.
 */
export declare function exemptionCodes(run: string): string[];
/** The marker a box label is replaced with. */
export declare const redactionMarker: (codes: string[]) => string;
/** Matches a marker this pass wrote, for the fidelity check (the word "Redacted" is ours, the codes the PDF's). */
export declare const REDACTION_MARKER: RegExp;
/** Counts of what `redactLine` did, for the run's report. */
export type RedactionCounts = {
    boxes: number;
    margin: number;
};
/**
 * Rewrites one line of a page: margin labels out, box labels as `[Redacted: …]`. A box label is a
 * run of codes; a "box" holding only codes that a margin label also matched is gone with it, so a
 * code is never both dropped and marked. Spaces a margin label left are kept (pdftotext's `-layout`
 * columns): later passes measure indents, and the body's own text does not move. Returns null for a
 * line that held nothing but margin labels.
 */
export declare function redactLine(line: string, counts?: RedactionCounts): string | null;
/** `redactLine` over a page's lines; a line that held only margin labels is taken out. */
export declare function redactPage(lines: string[], counts?: RedactionCounts): string[];
