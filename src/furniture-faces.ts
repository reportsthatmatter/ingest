import type { PipelineContext } from "./context";
import type { Provenance } from "./paragraphs";

export type FurnitureFacesOptions = {
  /**
   * How far from the top or bottom edge of the page, as a share of its height, a line in a declared
   * face must sit to be taken as furniture. Default 0.08: a running head or foot, never the body.
   */
  edge?: number;
};

const key = (text: string) => text.replace(/\s+/g, "");

/**
 * Drops the page's lines that the layout sets in one of `faces` at the page's top or bottom edge.
 * A line is matched to its layout line by its text with all whitespace removed (pdftotext's
 * `-layout` spacing and the layout's differ). Without a layout, or for a page the layout lacks,
 * the lines are returned unchanged.
 */
export function dropFurnitureFaces(
  lines: string[],
  faces: ReadonlySet<string>,
  context: PipelineContext | undefined,
  at: Provenance | undefined,
  options: FurnitureFacesOptions = {}
): string[] {
  const layout = context?.layout;
  if (!layout || !at) return lines;
  const page = layout.page(at.volume, at.pdfIndex);
  if (!page) return lines;
  const edge = options.edge ?? 0.08;
  const furniture = new Set(
    page.lines
      .filter((l) => faces.has(l.font) && (l.top < edge * page.height || l.top + l.height > (1 - edge) * page.height))
      .map((l) => key(l.text))
      .filter((k) => k.length > 0)
  );
  if (!furniture.size) return lines;
  return lines.filter((line) => !furniture.has(key(line)));
}

/** A figure text's characters, any whitespace between them (pdftotext spaces a figure's letters freely). */
const spaced = (text: string) =>
  new RegExp(key(text).split("").map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));

/**
 * Drops the text a figure or chart draws, by its font family (`figureFaces`, reportsthatmatter-7150).
 *
 * The layout lines on the page whose family is one of `families` are the figure's words. A page line
 * that is one of them (whitespace ignored), or is made only of them set apart by three or more
 * spaces (labels side by side, a label beside a caption's folio), goes. A page line that is none of
 * the body's layout lines, but becomes part of one once a figure's words are cut out of it, had them
 * drawn into it ("BS 476-6presentation:", a label over the body's last line): they are cut and the
 * body's words kept. A line that is already the body's own is never touched, so a body word that a
 * figure also uses stays. Without a layout, or for a page the layout lacks, the lines are returned
 * unchanged.
 */
export function dropFigureFaces(
  lines: string[],
  families: ReadonlySet<string>,
  context: PipelineContext | undefined,
  at: Provenance | undefined
): string[] {
  const layout = context?.layout;
  if (!layout || !at) return lines;
  const page = layout.page(at.volume, at.pdfIndex);
  if (!page) return lines;
  const figure = page.lines.filter((l) => families.has(l.family)).map((l) => l.text).filter((t) => key(t).length > 0);
  if (!figure.length) return lines;
  const keys = new Set(figure.map(key));
  const longest = [...keys].sort((a, b) => b.length - a.length);
  const others = page.lines.filter((l) => !families.has(l.family));
  const body = others.map((l) => key(l.text)).filter((k) => k.length > 0);
  const inBody = (text: string) => {
    const k = key(text);
    return k.length > 0 && body.some((b) => b.includes(k));
  };
  // A figure's label can have the same words as a heading on its page ("Limited combustibility"): the
  // n-th page line with those words is the n-th such layout line from the top.
  const order = new Map<string, boolean[]>();
  for (const l of [...page.lines].sort((a, b) => a.top - b.top)) {
    const k = key(l.text);
    if (keys.has(k)) order.set(k, [...(order.get(k) ?? []), families.has(l.family)]);
  }
  const seen = new Map<string, number>();
  const out: string[] = [];
  // Lines a figure's words were cut out of: their order is pdftotext's, which the figure upset.
  const cutLines = new Set<number>();
  for (const line of lines) {
    const k = key(line);
    if (!k) {
      out.push(line);
      continue;
    }
    if (keys.has(k)) {
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      const figures = order.get(k) ?? [];
      if (figures[Math.min(n, figures.length - 1)]) continue;
      out.push(line);
      continue;
    }
    if (inBody(line)) {
      out.push(line);
      continue;
    }
    // Nothing but the figure's words, run together across its columns ("1972   Building Regulations").
    let rest = k;
    for (const f of longest) while (f.length && rest.includes(f)) rest = rest.replace(f, "");
    if (!rest) continue;
    const segments = line.trim().split(/\s{3,}/);
    const kept = segments.filter((s) => !keys.has(key(s)));
    if (!kept.length) continue;
    const indent = line.slice(0, line.length - line.trimStart().length);
    let text = kept.length < segments.length ? indent + kept.join("   ") : line;
    if (!inBody(text)) {
      let cut = text;
      for (const words of figure) {
        const m = spaced(words).exec(cut);
        if (m) cut = cut.slice(0, m.index) + " " + cut.slice(m.index + m[0].length);
      }
      cut = indent + cut.trim().replace(/\s{2,}/g, " ");
      if (inBody(cut)) {
        text = cut;
        cutLines.add(out.length);
      }
    }
    if (text.trim()) out.push(text);
  }
  return reweave(out, figure, others, (text, index) => inBody(text) && !cutLines.has(index));
}

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * A figure drawn beside the body's lines can interleave its words with them over several page lines
 * ("the three definitions" / "National central to" / "framework – our work: non-combustible,"). Such
 * a run of lines (between blank lines), less the figure's words, holds exactly the words of a run
 * of the body's layout lines, from the one its first line opens with: those lines replace it, in the
 * layout's order (`relaid`). A token pdftotext glued from a body word and a figure word
 * ("takenbuildings") counts as the two. A run that does not come out exactly is left as it was.
 */
function reweave(
  lines: string[],
  figure: string[],
  others: Line[],
  settled: (text: string, index: number) => boolean
): string[] {
  const out: string[] = [];
  const sorted = [...others].sort((a, b) => a.top - b.top || a.left - b.left);
  for (let i = 0; i < lines.length; ) {
    if (!lines[i].trim()) {
      out.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].trim()) j++;
    const chunk = lines.slice(i, j);
    const replaced = chunk.every((line, k) => settled(line, i + k)) ? undefined : rebuild(chunk, figure, sorted);
    out.push(...(replaced ?? chunk));
    i = j;
  }
  return out;
}

function rebuild(chunk: string[], figure: string[], sorted: Line[]): string[] | undefined {
  const bag = (list: string[]) => {
    const m = new Map<string, number>();
    for (const w of list) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  };
  const drawn = bag(figure.flatMap(words));
  // pdftotext glues a body word to a figure word it overlaps ("takenbuildings", "Drthrough"): split
  // such a token into two words the page has.
  const vocabulary = new Set([...sorted.flatMap((l) => words(l.text)), ...drawn.keys()]);
  const unglue = (w: string): string[] => {
    if (vocabulary.has(w)) return [w];
    for (let i = 1; i < w.length; i++) if (vocabulary.has(w.slice(0, i)) && vocabulary.has(w.slice(i))) return [w.slice(0, i), w.slice(i)];
    return [w];
  };
  const pool = bag(chunk.flatMap(words).flatMap(unglue));
  // What is left of the run once the body's lines are taken out of it is all the figure's.
  const onlyFigure = (left: Map<string, number>) => [...left].every(([w, n]) => n <= (drawn.get(w) ?? 0));
  const first = chunk[0].trimStart();
  for (let a = 0; a < sorted.length; a++) {
    if (!first.startsWith(words(sorted[a].text)[0] ?? "\u0000")) continue;
    const left = new Map(pool);
    for (let b = a; b < sorted.length; b++) {
      for (const w of words(sorted[b].text)) {
        const n = left.get(w) ?? 0;
        if (!n) return undefined;
        left.set(w, n - 1);
      }
      if (onlyFigure(left)) {
        const run = sorted.slice(a, b + 1);
        if (run.length === chunk.length && run.every((l, k) => words(l.text).join(" ") === words(chunk[k]).join(" "))) return undefined;
        return relaid(run, chunk);
      }
    }
    return undefined;
  }
  return undefined;
}

type Line = { text: string; top: number; left: number };

/**
 * The body's layout lines set out as pdftotext would: a line the run already had verbatim keeps its
 * own spacing; another takes the indent of the verbatim line nearest its left edge, and a paragraph
 * number opening it the gap that line's number had ("6.23        However"), so the page parse reads
 * paragraphs, hanging text and quotations as it would have.
 */
function relaid(run: Line[], chunk: string[]): string[] {
  const indent = (line: string) => line.length - line.trimStart().length;
  const verbatim = new Map(chunk.map((line) => [key(line), line] as const));
  const known: Array<{ left: number; line: string }> = [];
  for (const l of run) {
    const line = verbatim.get(key(l.text));
    if (line) known.push({ left: l.left, line });
  }
  const LABEL = /^(\d{1,3}[.)]\d{1,3})\s+/;
  return run.map((l) => {
    const line = verbatim.get(key(l.text));
    if (line) return line;
    const text = l.text.trim();
    const near = [...known].sort((x, y) => Math.abs(x.left - l.left) - Math.abs(y.left - l.left))[0];
    if (!near) return text;
    const pad = " ".repeat(indent(near.line));
    const label = text.match(LABEL);
    const theirs = near.line.trimStart().match(/^(\d{1,3}[.)]\d{1,3})(\s+)/);
    if (label && theirs) return pad + label[1].padEnd(theirs[1].length + theirs[2].length) + text.slice(label[0].length);
    // Hanging text under a numbered line sits where that line's text starts.
    if (!label && theirs) return pad + " ".repeat(theirs[1].length + theirs[2].length) + text;
    return pad + text;
  });
}
