import type { Block } from "./paragraphs";
import { mergeFootnotes, type Footnote } from "./footnotes";
import { resolveNoteReferences } from "./markdown";

/**
 * A reference whose rendered note was printed on another page.
 *
 * The renderer pairs each `[^N]` in the body with a `[^N]:` definition by
 * alignment (`resolveNoteReferences`) wherever a label is defined more than
 * once, and the alignment is only as good as the references it is given: with
 * few of a chapter's markers linked it has many equal-length solutions and
 * takes early definitions. Litvinenko opened 20 notes from another page and
 * Philip Morris 17 of 19 that way, live, and no signal saw it
 * (reportsthatmatter-y0w9): `note-marker-wrong-note` takes the same alignment
 * as its truth.
 *
 * This pairs references with definitions exactly as the renderer does
 * (`withSidenotes`: the alignment where there is one, else the k-th definition
 * of the label, clamped to the last) and compares each reference's page, from
 * its block's provenance, with its definition's `pdfIndex`. A page footnote is
 * printed on the page of its marker; one more page away is allowed for a
 * paragraph that runs over a page break (a block's `at` is where it opens) and
 * a note that runs over. Only meaningful for a report whose notes are page
 * footnotes: an endnotes report's notes are all at the back.
 */
export type NoteOffPage = { volume: number; page: number; label: string; definedVolume: number; definedPage: number };

/** The notes sit at the foot of the page that cites them (not endnotes, not an edition's own notes). */
export function hasPageNotes(passes: ReadonlyArray<{ name: string }> | undefined): boolean {
  return !(passes ?? []).some((pass) => pass.name === "endnotes" || pass.name === "layoutEndnotes" || pass.name === "edition");
}

function texts(b: Block): string[] {
  if (b.kind === "paragraph" || b.kind === "quote" || b.kind === "heading" || b.kind === "contents") return [b.text];
  if (b.kind === "list") return b.items;
  return [];
}

export function noteOffPage(
  /** The final blocks (`finalBlocks`): markers linked as `[^N]`. */
  blocks: Block[],
  footnotes: Footnote[],
  /** How far apart, in pages, a reference and its note may be. */
  tolerance = 1
): NoteOffPage[] {
  const notes = mergeFootnotes(footnotes.map((n) => ({ ...n })));
  const order = notes.map((n) => String(n.label ?? n.number));
  // `collectNotes`: a definition with no text is not a definition, but it still takes a place in the order
  const defined = new Map<string, Array<{ volume: number; page: number } | null>>();
  notes.forEach((n, i) => {
    if (!n.text.trim()) return;
    const list = defined.get(order[i]) ?? [];
    list.push(n.pdfIndex === undefined ? null : { volume: n.volume ?? 1, page: n.pdfIndex });
    defined.set(order[i], list);
  });

  const refs: Array<{ label: string; volume: number; page: number } | { label: string; volume?: undefined }> = [];
  for (const b of blocks) {
    for (const t of texts(b)) {
      for (const m of t.matchAll(/\[\^(\d+(?:-\d+)?)\]/g)) {
        refs.push(b.at ? { label: m[1], volume: b.at.volume, page: b.at.pdfIndex } : { label: m[1] });
      }
    }
  }
  const aligned = resolveNoteReferences(
    refs.map((r) => r.label),
    order
  );
  const used = new Map<string, number>();
  const off: NoteOffPage[] = [];
  refs.forEach((ref, at) => {
    const list = defined.get(ref.label);
    if (!list?.length) return;
    const seen = used.get(ref.label) ?? 0;
    const target = list[Math.min(aligned[at] ?? seen, list.length - 1)];
    used.set(ref.label, seen + 1);
    if (!target || ref.volume === undefined) return;
    if (target.volume !== ref.volume || Math.abs(target.page - ref.page) > tolerance) {
      off.push({ volume: ref.volume, page: ref.page, label: ref.label, definedVolume: target.volume, definedPage: target.page });
    }
  });
  return off;
}
