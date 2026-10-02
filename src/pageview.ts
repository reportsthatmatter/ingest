import type { Layout, LayoutLine } from "./layout";
import type { Block } from "./paragraphs";
import type { Footnote } from "./footnotes";
import { linkInlineMarkers } from "./footnotes";

/**
 * The page inspection kit: one PDF page's layout lines beside the blocks the
 * pipeline made from it, as text a person (or an agent holding the page image)
 * can read in two minutes, plus a draft golden entry and a test fixture cut
 * from the same data. Read-only; nothing here changes an output.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function blockText(b: Block): string {
  if (b.kind === "paragraph" || b.kind === "quote" || b.kind === "heading") return b.text;
  if (b.kind === "list") return b.items.join(" | ");
  if (b.kind === "contents") return `${b.text} … ${b.page}`;
  return `printed ${b.number}`;
}

/** Blocks that start on the page, in order (the `page` markers are kept: they carry the printed number). */
export function pageBlocks(blocks: Block[], volume: number, pdfIndex: number): Block[] {
  return blocks.filter((b) => b.at?.volume === volume && b.at.pdfIndex === pdfIndex);
}

export function pageFootnotes<T extends Pick<Footnote, "volume" | "pdfIndex">>(notes: T[], volume: number, pdfIndex: number): T[] {
  return notes.filter((n) => (n.volume ?? 1) === volume && n.pdfIndex === pdfIndex);
}

/** The first layout line whose text opens a block, so each block can be pinned to its line. */
function opening(lines: LayoutLine[], text: string, taken: Set<LayoutLine>): LayoutLine | undefined {
  const head = norm(text.replace(/^\s*(?:\d{1,4}(?:\.\d{1,4})*[.)]?\s+|\([a-z0-9]{1,4}\)\s*|[•·▪–-]\s+)/, "")).slice(0, 12);
  if (head.length < 3) return undefined;
  return lines.find((l) => {
    if (taken.has(l)) return false;
    const t = norm(l.text.replace(/^\s*(?:\d{1,4}(?:\.\d{1,4})*[.)]?\s+|\([a-z0-9]{1,4}\)\s*|[•·▪–-]\s+)/, ""));
    return t.length >= 3 && (t.startsWith(head) || head.startsWith(t));
  });
}

export function renderPage(
  id: string,
  layout: Layout,
  blocks: Block[],
  footnotes: Footnote[],
  volume: number,
  pdfIndex: number
): string {
  const page = layout.page(volume, pdfIndex);
  const mine = pageBlocks(blocks, volume, pdfIndex);
  const out: string[] = [];
  const printed = mine.find((b) => b.at?.printed != null)?.at?.printed;
  out.push(`${id} · volume ${volume} · PDF page ${pdfIndex}${printed != null ? ` · printed ${printed}` : ""}`);
  if (!page) {
    out.push("  (no layout for this page: it is not in the PDF, or pdftohtml found no text)");
  } else {
    const bf = layout.bodyFont;
    out.push(
      `  page ${page.width}x${page.height}, body margin left ${page.left} right ${page.right}, pitch ${page.pitch}; ` +
        `document body font ${bf.family} ${bf.size}pt ${bf.color}, this page's ${page.bodyFont}`
    );
  }

  const marks = new Map<LayoutLine, string[]>();
  if (page) {
    const taken = new Set<LayoutLine>();
    mine.forEach((b, i) => {
      if (b.kind === "page") return;
      const texts = b.kind === "list" ? [b.items[0]] : [blockText(b)];
      const line = opening(page.lines, texts[0] ?? "", taken);
      if (line) {
        taken.add(line);
        marks.set(line, [...(marks.get(line) ?? []), `B${i + 1} ${b.kind}${b.kind === "heading" ? b.level : ""}`]);
      }
    });
  }

  out.push("", "LAYOUT  (indent and rgap in ems of the line; * = body font, L = opens on a label, ^ = raised digit run)");
  out.push("  idx    top  indent   rgap  font                              flags  block   text");
  for (const l of page?.lines ?? []) {
    const flags = `${l.body ? "*" : " "}${l.label ? "L" : " "}${l.raised.length ? "^" : " "}`;
    const raised = l.raised.length ? `  ⟨raised: ${l.raised.map((r) => r.text).join(",")}⟩` : "";
    out.push(
      `${String(l.index).padStart(5)} ${String(Math.round(l.top)).padStart(6)} ${l.indentEm.toFixed(1).padStart(7)} ${l.rightGapEm.toFixed(1).padStart(6)}  ` +
        `${clip(l.font, 32).padEnd(32)}  ${flags}   ${(marks.get(l) ?? []).join("+").padEnd(10)} ${clip(l.text.trim(), 110)}${raised}`
    );
  }

  const known = new Set(footnotes.map((n) => n.number));
  out.push("", `BLOCKS the pipeline made starting on this page (${mine.filter((b) => b.kind !== "page").length})`);
  mine.forEach((b, i) => {
    if (b.kind === "page") {
      out.push(`  B${i + 1} page marker: printed ${b.number}`);
      return;
    }
    const text = b.kind === "heading" || !known.size ? blockText(b) : b.kind === "list" ? b.items.map((t) => linkInlineMarkers(t, known)).join(" | ") : linkInlineMarkers(b.text, known);
    const label = b.kind === "heading" ? `heading h${b.level}` : b.kind;
    const words = text.length;
    out.push(`  B${i + 1} ${label} (${words} chars)`);
    out.push(`        ${clip(text, 160)}`);
    if (words > 160) out.push(`        … ${text.slice(-70)}`);
  });

  const notes = pageFootnotes(footnotes, volume, pdfIndex);
  out.push("", `FOOTNOTES defined on this page (${notes.length}): ${notes.map((n) => n.number).join(", ") || "none"}`);
  for (const n of notes.slice(0, 12)) out.push(`  ${n.number}  ${clip(n.text, 110)}`);
  return out.join("\n");
}

const yamlStr = (s: string) => JSON.stringify(s);
const words = (s: string, n: number, fromEnd = false) => {
  const w = s.trim().split(/\s+/);
  return (fromEnd ? w.slice(-n) : w.slice(0, n)).join(" ");
};

/**
 * A draft golden entry from what the pipeline produced. It is the pipeline's
 * reading, not the truth: the agent writing the entry compares each line with
 * the page image and corrects it, and only then fills `verified_by`.
 */
export function draftGolden(blocks: Block[], footnotes: Footnote[], layout: Layout, volume: number, pdfIndex: number): string {
  const mine = pageBlocks(blocks, volume, pdfIndex).filter((b) => b.kind !== "page" && b.kind !== "contents");
  const known = new Set(footnotes.map((n) => n.number));
  const printed = pageBlocks(blocks, volume, pdfIndex).find((b) => b.at?.printed != null)?.at?.printed;
  const lines: string[] = [];
  lines.push(`  - pdf: ${pdfIndex}`);
  if (volume !== 1) lines.push(`    volume: ${volume}`);
  if (printed != null) lines.push(`    printed: ${printed}`);
  lines.push(`    verified_by: ""   # DRAFT from the pipeline: check every line against the page image, then fill in`);
  lines.push(`    blocks:`);
  for (const b of mine) {
    if (b.kind === "heading") lines.push(`      - heading: ${yamlStr(b.text)}`, `        level: ${b.level}`);
    else {
      const text = b.kind === "list" ? b.items.join(" ") : b.text;
      const linked = known.size ? linkInlineMarkers(text, known) : text;
      const notes = [...linked.matchAll(/\[\^(\d+)\]/g)].map((m) => m[1]);
      const plain = linked.replace(/\[\^\d+\]/g, "");
      const extra = `${notes.length ? `, notes: [${notes.join(", ")}]` : ""}${b.kind === "list" ? `, items: ${b.items.length}` : ""}`;
      lines.push(`      - ${b.kind}: {start: ${yamlStr(words(plain, 6))}, end: ${yamlStr(words(plain, 5, true))}${extra}}`);
    }
  }
  const defined = pageFootnotes(footnotes, volume, pdfIndex).map((n) => n.number);
  if (defined.length) lines.push(`    footnotes: [${defined.join(", ")}]`);
  const raised = [...new Set((layout.page(volume, pdfIndex)?.lines ?? []).filter((l) => l.body).flatMap((l) => l.raised.map((r) => r.text)).filter((t) => /^\d+$/.test(t)))];
  lines.push(`    markers: [${raised.join(", ")}]   # the layout's raised digits; confirm on the image`);
  return lines.join("\n");
}

/**
 * A test fixture in the shape `tests/fixtures/oracle/*.json` already uses:
 * the page's own `pdftohtml -xml`, the blocks and the notes that start on it.
 * `source` says where it came from, so a failing test can be traced to a page.
 */
export function pageFixture(
  source: string,
  xml: string,
  blocks: Block[],
  footnotes: Footnote[],
  volume: number,
  pdfIndex: number
): { source: string; xml: string; blocks: Block[]; footnotes: Footnote[] } {
  const m = new RegExp(`<page number="${pdfIndex}"[\\s\\S]*?</page>`).exec(xml);
  if (!m) throw new Error(`page ${pdfIndex} is not in the layout XML`);
  const head = /^[\s\S]*?<pdf2xml[^>]*>/.exec(xml)?.[0] ?? "";
  return {
    source,
    xml: `${head}\n${m[0]}\n</pdf2xml>\n`,
    blocks: pageBlocks(blocks, volume, pdfIndex),
    footnotes: pageFootnotes(footnotes, volume, pdfIndex),
  };
}

