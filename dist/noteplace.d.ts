import type { Block } from "./paragraphs.js";
import { type Footnote } from "./footnotes.js";
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
export type NoteOffPage = {
    volume: number;
    page: number;
    label: string;
    definedVolume: number;
    definedPage: number;
};
/** The notes sit at the foot of the page that cites them (not endnotes, not an edition's own notes). */
export declare function hasPageNotes(passes: ReadonlyArray<{
    name: string;
}> | undefined): boolean;
export declare function noteOffPage(
/** The final blocks (`finalBlocks`): markers linked as `[^N]`. */
blocks: Block[], footnotes: Footnote[], 
/** How far apart, in pages, a reference and its note may be. */
tolerance?: number): NoteOffPage[];
