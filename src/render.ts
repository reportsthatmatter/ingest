/**
 * Markdown → the artifact set a report publishes.
 *
 * This is the stage that used to live in the site repo, which meant paragraph
 * ids — the product, and the thing a citation resolves through — were
 * generated one stage *downstream* of anything a report had a pin on. An edit
 * there could repoint every citation in the archive, and no report's
 * `baseline.json` covered it. Here, an id-affecting change is a versioned
 * release each report adopts deliberately, exactly as a pipeline change is.
 *
 * What comes out is content and only content: no layout, no site chrome. The
 * app owns the page, the report owns the text
 * (docs/plans/2026-09-04-content-publishing.md §2 in the site repo).
 */
import { renderMarkdownUnits, type IdUnit } from "./markdown";
import { splitSections, paragraphIndex, type Section } from "./sections";
import { extractPassages } from "./passages";

/** A section as the contents page needs it — everything but the html. */
export type SectionSummary = Omit<Section, "html">;

export type ReportMeta = {
  words: number;
  pages?: number;
  sections: SectionSummary[];
  /** Which section holds each citable paragraph, so a `?p=` link can be routed. */
  paragraphToSection: Record<string, string>;
};

/** Everything a report publishes, and nothing else. */
export type RenderedArtifacts = {
  meta: ReportMeta;
  /** The whole report's body. Stored so `/full` is one read, not one per section. */
  fullBody: string;
  /** One section's body, keyed by slug. */
  fragments: Record<string, string>;
};

function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
}

/**
 * A paragraph id already published, and where: the section it was served in and its text's
 * `paragraphFingerprint`. See `renderArtifacts`' `reserved` option.
 */
export type ReservedId = { id: string; section: string; fingerprint?: string };

export type RenderOptions = {
  /**
   * Published ids, highest priority first (oldest first: the meaning a link was made with). Each
   * keeps the paragraph it named when that paragraph is still in the same section, so a new
   * paragraph whose text asks for the same id (a repeated "Key Messages", a second reference to
   * the same author and year) is suffixed instead of taking it (reportsthatmatter-efso, site
   * decision 0012). A reservation whose paragraph cannot be found constrains nothing.
   */
  reserved?: readonly ReservedId[];
};

/** A short, stable hash of a passage's text (as `extractPassages` gives it), words only, case-folded. */
export function paragraphFingerprint(text: string): string {
  const words = text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // FNV-1a, 32 bits.
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) {
    h ^= words.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The id families a reserved id can belong to: its own text's (`foo-2` from text "Foo 2") or a suffixed one (`foo` + `-2`). */
function familiesOf(id: string): string[] {
  const m = id.match(/^(.+)-(\d+)$/);
  return m && Number(m[2]) >= 2 ? [id, m[1]] : [id];
}

/**
 * Which reading-order units must carry which reserved id. Empty when the plain pass already gives
 * every matched reservation its own paragraph, so a report whose ids never moved renders exactly
 * as without reservations.
 *
 * Each reservation is matched, in priority order, to a unit in the same section whose text asks
 * for that id's family (`base`, `base-N`): first one with the same text fingerprint, then (a
 * paragraph corrected since) the first left in that section.
 */
export function reservedAssignments(units: readonly IdUnit[], sections: readonly Section[], reserved: readonly ReservedId[]): Map<number, string> {
  const sectionOf = paragraphIndex(sections as Section[]);
  const textOf = new Map<string, string>();
  for (const section of sections) for (const p of extractPassages(section.html)) textOf.set(p.paragraphId, p.text);
  const byFamily = new Map<string, number[]>();
  units.forEach((u, k) => byFamily.set(u.base, [...(byFamily.get(u.base) ?? []), k]));
  const fingerprints = new Map<number, string>();
  const fingerprintOf = (k: number) => {
    if (!fingerprints.has(k)) {
      const text = textOf.get(units[k].id);
      fingerprints.set(k, text === undefined ? "" : paragraphFingerprint(text));
    }
    return fingerprints.get(k)!;
  };

  const claimed = new Map<number, string>();
  const placed = new Set<string>();
  const candidates = (r: ReservedId) =>
    familiesOf(r.id)
      .flatMap((f) => byFamily.get(f) ?? [])
      .filter((k) => (!claimed.has(k) && sectionOf[units[k].id] === r.section))
      .sort((a, b) => a - b);
  for (const exact of [true, false]) {
    for (const r of reserved) {
      if (placed.has(r.id)) continue;
      const k = candidates(r).find((k) => !exact || (r.fingerprint !== undefined && fingerprintOf(k) === r.fingerprint));
      if (k === undefined) continue;
      claimed.set(k, r.id);
      placed.add(r.id);
    }
  }
  for (const [k, id] of claimed) if (units[k].id !== id) return claimed;
  return new Map();
}

export function renderArtifacts(markdown: string, options: RenderOptions = {}): RenderedArtifacts {
  let { html, units } = renderMarkdownUnits(markdown);
  let sections = splitSections(html);
  if (options.reserved?.length) {
    const forced = reservedAssignments(units, sections, options.reserved);
    if (forced.size) {
      ({ html } = renderMarkdownUnits(markdown, forced));
      sections = splitSections(html);
    }
  }

  const fragments: Record<string, string> = {};
  for (const section of sections) fragments[section.slug] = section.html;

  return {
    meta: {
      words: wordCount(html),
      sections: sections.map(({ html: _html, ...rest }) => rest),
      paragraphToSection: paragraphIndex(sections),
    },
    fullBody: html,
    fragments,
  };
}

