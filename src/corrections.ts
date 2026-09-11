import { parse } from "yaml";
import type { Block } from "./paragraphs";
import type { Footnote } from "./footnotes";

/**
 * A human judgement about this document's text, expressed as data.
 *
 * Corrections are the things the pipeline cannot decide: an OCR repair checked
 * against the scan, a word the extractor mangled beyond any rule's reach.
 * They are applied deterministically as a final pass, so re-running still
 * reproduces the same output and the fidelity checks still see everything.
 *
 * **A correction describes the text. A pass describes how to read the source.**
 * If you are writing a correction to undo something the parser did, you needed
 * a different pass or a bug fix.
 */
/**
 * A suspect looked at and judged correct as it stands.
 *
 * The review queue is a list of places the scanner probably got wrong. Half
 * the answers are "fix it", which is a correction; the other half are "I
 * checked this against the scan and it is right", and until now those had
 * nowhere to go — so the same entries reappeared on every run and the queue
 * never shrank. That is why nobody reviewed it (#105).
 */
export type Dismissal = {
  /** The suspect text, exactly as the queue lists it. */
  match: string;
  reason?: string;
  added?: string;
};

export type Correction = {
  id: string;
  /** Narrows the correction to one page. Omit to search the whole document. */
  where?: { volume?: number; printed?: number };
  find: string;
  replace: string;
  reason?: string;
  added?: string;
};

/** Parses, and says which report's file is at fault rather than throwing a stack. */
function load(yamlText: string, reportId: string): Record<string, unknown> | null {
  try {
    return parse(yamlText) as Record<string, unknown> | null;
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new Error(`${reportId}: corrections.yaml is not valid YAML — ${detail}`);
  }
}

export function parseCorrections(yamlText: string, reportId: string): Correction[] {
  const raw = load(yamlText, reportId) as { corrections?: Correction[] } | null;
  const corrections = raw?.corrections ?? [];

  const seen = new Set<string>();
  for (const correction of corrections) {
    if (!correction?.id) {
      throw new Error(`${reportId}: a correction has no id — errors have to name one`);
    }
    if (seen.has(correction.id)) {
      throw new Error(`${reportId}: duplicate correction id ${correction.id}`);
    }
    seen.add(correction.id);
    if (typeof correction.find !== "string" || !correction.find) {
      throw new Error(`${reportId}: correction ${correction.id} has no find`);
    }
    if (typeof correction.replace !== "string") {
      throw new Error(`${reportId}: correction ${correction.id} has no replace`);
    }
  }
  return corrections;
}

/** Where a piece of text sits, in the terms a correction's `where` scopes against. */
type Location = { volume?: number; printed?: number | null };

function inScopeAt(at: Location, where: Correction["where"]): boolean {
  if (!where) return true;
  if (where.volume !== undefined && at.volume !== where.volume) return false;
  if (where.printed !== undefined && at.printed !== where.printed) return false;
  return true;
}

function inScope(block: Block, where: Correction["where"]): boolean {
  return inScopeAt({ volume: block.at?.volume, printed: block.at?.printed }, where);
}

/** Every string a block carries that a correction could address. */
function texts(block: Block): string[] {
  if (block.kind === "list") return block.items;
  if (block.kind === "page") return [];
  return [block.text];
}

function countMatches(text: string, find: string): number {
  let count = 0;
  let index = text.indexOf(find);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(find, index + find.length);
  }
  return count;
}

/**
 * Applies corrections to the parsed blocks, and to footnote-definition text.
 *
 * **Every correction must match exactly once** — across the body and the
 * footnotes together, since a report's `find` is not told in advance which
 * side its text sits on. Zero matches or more than one fails the build,
 * naming the id. A stale correction is a loud error and never a silent skip
 * — that is what keeps the output reproducible while the parser underneath
 * it changes, and what stops a correction from quietly rotting into a lie
 * about what was reviewed.
 *
 * Footnotes are optional and default to none, so every existing call that
 * only has blocks to correct is unaffected.
 */
export function applyCorrections(
  blocks: Block[],
  corrections: Correction[],
  reportId: string,
  footnotes: Footnote[] = []
): { blocks: Block[]; footnotes: Footnote[]; applied: number } {
  if (!corrections.length) return { blocks, footnotes, applied: 0 };

  const out = blocks.map((block) => ({ ...block }) as Block);
  const outNotes = footnotes.map((note) => ({ ...note }));

  for (const correction of corrections) {
    let matches = 0;
    for (const block of out) {
      if (!inScope(block, correction.where)) continue;
      for (const text of texts(block)) matches += countMatches(text, correction.find);
    }
    for (const note of outNotes) {
      if (!inScopeAt({ volume: note.volume, printed: note.printed }, correction.where)) continue;
      matches += countMatches(note.text, correction.find);
    }

    if (matches !== 1) {
      const scope = correction.where
        ? ` in ${JSON.stringify(correction.where)}`
        : " in the whole document";
      throw new Error(
        `${reportId}: correction ${correction.id} matched ${matches} times${scope}, ` +
          "expected exactly 1.\n" +
          `  find: ${JSON.stringify(correction.find)}\n` +
          (matches === 0
            ? "  The text has changed, or the correction was never right. Re-check it " +
              "against the scan rather than deleting it blind."
            : "  Narrow it with `where: { volume, printed }`, or make `find` longer.")
      );
    }

    for (const block of out) {
      if (!inScope(block, correction.where)) continue;
      if (block.kind === "list") {
        block.items = block.items.map((item) =>
          item.replace(correction.find, correction.replace)
        );
      } else if (block.kind !== "page") {
        block.text = block.text.replace(correction.find, correction.replace);
      }
    }
    for (const note of outNotes) {
      if (!inScopeAt({ volume: note.volume, printed: note.printed }, correction.where)) continue;
      note.text = note.text.replace(correction.find, correction.replace);
    }
  }

  return { blocks: out, footnotes: outNotes, applied: corrections.length };
}

/** Words a correction introduces, so the lossless check does not call them invented. */
export function correctionVocabulary(corrections: Correction[]): string[] {
  return corrections.flatMap((correction) => correction.replace.split(/\s+/));
}

/**
 * The suspects a reviewer has judged correct, so the queue stops listing them.
 *
 * Deliberately keyed on the suspect text rather than a position: the queue is
 * regenerated from scratch on every ingest, and a line number would go stale
 * the moment anything above it moved.
 */
export function parseDismissals(yamlText: string, reportId: string): Dismissal[] {
  const raw = load(yamlText, reportId) as { dismissed?: Dismissal[] } | null;
  const dismissed = raw?.dismissed ?? [];
  for (const entry of dismissed) {
    if (!entry?.match) {
      throw new Error(`${reportId}: a dismissed entry has no match`);
    }
  }
  return dismissed;
}
