import { execFileSync } from "node:child_process";

export type Page = {
  /** 1-based index across the whole report, not the printed page number. */
  index: number;
  /** Which source volume this page came from, 1-based. */
  volume: number;
  /** 1-based index within its own PDF. What you open the file at to check. */
  pdfIndex: number;
  lines: string[];
};

/**
 * A rectangle in PDF user-space points (poppler's own coordinate system,
 * origin at the page's top-left corner) to extract text from, discarding
 * everything outside it before layout reconstruction runs.
 *
 * For a source whose furniture sits outside the trimmed page — a rotated
 * chapter-tab printed in the bleed margin beyond the CropBox, say — this
 * removes it before it can be threaded into the line stream, rather than
 * matching its text back out afterwards. `pdfinfo -box` prints a PDF's
 * MediaBox/CropBox so the furniture's margin can be measured once and
 * declared here, the same way a checksum is declared once and reused.
 */
export type Crop = { x: number; y: number; width: number; height: number };

/** The `pdftotext` arguments for one page range, with an optional crop. */
export function pdftotextArgs(pdfPath: string, crop?: Crop): string[] {
  const cropArgs = crop
    ? ["-x", String(crop.x), "-y", String(crop.y), "-W", String(crop.width), "-H", String(crop.height)]
    : [];
  return [...cropArgs, "-layout", "-enc", "UTF-8", pdfPath, "-"];
}

/**
 * Extracts text with `pdftotext -layout`, which preserves leading whitespace.
 * The indentation is load-bearing: it is what tells us where paragraphs begin.
 */
export function extractPages(pdfPath: string, crop?: Crop): Page[] {
  let raw: string;
  try {
    raw = execFileSync("pdftotext", pdftotextArgs(pdfPath, crop), {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    throw new Error(
      `pdftotext failed on ${pdfPath}. Is poppler installed? (${String(error)})`
    );
  }

  return raw
    .split("\f")
    .map((page, i) => ({
      index: i + 1,
      // Volume is assigned by the caller: this function sees one PDF and has
      // no way to know where it sits in the report's order.
      volume: 1,
      pdfIndex: i + 1,
      lines: page.split("\n"),
    }))
    .filter((page) => page.lines.some((line) => line.trim().length > 0));
}

/** Normalises the characters pdftotext emits that would otherwise reach output. */
export function normaliseWhitespace(text: string): string {
  return text
    .replace(/ /g, " ")
    // U+FFFD is pdftotext's stand-in for a glyph with no text mapping: no
    // character survives in it to recover. Saville sets a decorative mark
    // after every paragraph number, and 814 of them reached the page as "�".
    .replace(/�/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "–")
    .replace(/[ \t]+/g, " ")
    .trim();
}
