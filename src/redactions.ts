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

const O = String.raw`[({]`;
const C = String.raw`[)}]`;
/** One exemption: (b)(1) to (b)(9), (b)(7)(A) to (b)(7)(F); OCR may read a digit as "?". */
const CODE = String.raw`${O}\s?b\s?${C}\s?${O}\s?(?:[7?]\s?${C}(?:\s?${O}\s?[A-F?]\s?${C})?|[1-9]\s?${C})`;
/** A run of codes, comma-separated, as one box prints them. */
const RUN = String.raw`${CODE}(?:\s?[,.]?\s?${CODE})*`;
/** A margin label's ending: "-2", "- l", "-", or a slash before its continuation on the next line. */
const SUFFIX = String.raw`(?:\s?-\s?[0-9lI]?(?![A-Za-z0-9])|/(?:\s?${O}\s?b\s?${C})?)`;

/** "(b)(3)-2, (b)(7)(E)-1", "(b)(6)/", "(b)(6)/(b)": a margin label (possibly several). */
const MARGIN = new RegExp(String.raw`(?<![0-9§])${RUN}${SUFFIX}(?:\s?,?\s?${RUN}${SUFFIX})*`, "g");
/** "(7)(C)-4", "(E)-2": a margin label's second line, after "(b)(6)/(b)" or "(b)(7)". */
const MARGIN_TAIL = new RegExp(String.raw`(?<![0-9A-Za-z§)])(?:${O}7${C}(?:${O}[A-F]${C})?|${O}[A-F]${C})\s?-\s?[0-9lI](?![A-Za-z0-9])`, "g");
/** A line that is nothing but unspaced codes ("(b)(7)" over "(E)-2"): a margin label broken over two lines. */
const MARGIN_LINE = new RegExp(String.raw`^\s*\(b\)\((?:[1-9])\)(?:\([A-F]\))?\s*$`);
/** A box label: a run of codes not inside a statute citation. */
const BOX = new RegExp(String.raw`(?<![0-9§])${RUN}(?!\s?${O}[A-Z]${C})`, "g");
/** One code within a matched run, brackets normalised. */
const ONE = /\(b\)\((?:[7?]\)(?:\([A-F?]\))?|[1-9]\))/g;

/**
 * The codes of a matched run, set as the box prints them: "(b} (7}(A}, (b} (3)" → "(b) (7)(A)", "(b) (3)".
 * The box's spacing is kept so that the marker's codes are the PDF's own words.
 */
export function exemptionCodes(run: string): string[] {
  const flat = run.replace(/\s+/g, "").replace(/\{/g, "(").replace(/\}/g, ")");
  return (flat.match(ONE) ?? []).map((code) => code.replace("(b)(", "(b) ("));
}

/** The marker a box label is replaced with. */
export const redactionMarker = (codes: string[]) => `[Redacted: ${codes.join(", ")}]`;

/** Matches a marker this pass wrote, for the fidelity check (the word "Redacted" is ours, the codes the PDF's). */
export const REDACTION_MARKER = /\[Redacted: (?=\(b\))/g;

/** Counts of what `redactLine` did, for the run's report. */
export type RedactionCounts = { boxes: number; margin: number };

/**
 * Rewrites one line of a page: margin labels out, box labels as `[Redacted: …]`. A box label is a
 * run of codes; a "box" holding only codes that a margin label also matched is gone with it, so a
 * code is never both dropped and marked. Spaces a margin label left are kept (pdftotext's `-layout`
 * columns): later passes measure indents, and the body's own text does not move. Returns null for a
 * line that held nothing but margin labels.
 */
export function redactLine(line: string, counts?: RedactionCounts): string | null {
  if (!/[({]\s?[b7A-F]\s?[)}]/.test(line)) return line;
  if (MARGIN_LINE.test(line)) {
    if (counts) counts.margin++;
    return null;
  }
  let out = line.replace(MARGIN, (m) => {
    if (counts) counts.margin++;
    return " ".repeat(m.length);
  });
  out = out.replace(MARGIN_TAIL, (m) => {
    if (counts) counts.margin++;
    return " ".repeat(m.length);
  });
  out = out.replace(BOX, (m, offset: number, whole: string) => {
    const codes = exemptionCodes(m);
    if (!codes.length) return m;
    if (counts) counts.boxes++;
    const marker = redactionMarker(codes);
    // a link's shape, "[…](…)", is never left behind
    return whole[offset + m.length] === "(" ? `${marker} ` : marker;
  });
  // a line that held only margin labels goes: left blank, it would end the paragraph it sat beside
  return out.trim() ? out.replace(/\s+$/, "") : null;
}

/** `redactLine` over a page's lines; a line that held only margin labels is taken out. */
export function redactPage(lines: string[], counts?: RedactionCounts): string[] {
  return lines.flatMap((line) => {
    const out = redactLine(line, counts);
    return out === null ? [] : [out];
  });
}

/** A line of three or more asterisks and nothing else: a section break ("* * *", "***"). */
const ASTERISKS = /^\s*\*(?:\s*\*){2,}\s*$/;

/**
 * `asteriskBreaks` (reportsthatmatter-gqsy.5): a section break set as a line of asterisks stands apart from
 * the paragraphs either side. Read as text, the centred "* * *" was taken for the first line of a quotation
 * with the next paragraph's indented first line, and the paragraph's other lines were cut off below it (the
 * Mueller report, Volume I p.2, p.13; Volume II p.2). A blank line either side keeps it a block of its own.
 */
export function separateAsterisks(lines: string[]): string[] {
  if (!lines.some((line) => ASTERISKS.test(line))) return lines;
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!ASTERISKS.test(line)) return void out.push(line);
    if (out.length && out[out.length - 1].trim()) out.push("");
    out.push(line);
    if (i + 1 < lines.length && lines[i + 1].trim()) out.push("");
  });
  return out;
}
