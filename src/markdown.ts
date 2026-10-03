import MarkdownIt from "markdown-it";
import { parse } from "yaml";

export type FrontMatter = Record<string, unknown>;

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Splits leading YAML front matter off a markdown document.
 * Ingested reports carry their metadata this way, and it must never reach the
 * renderer — otherwise it prints as the opening paragraph of the report.
 */
export function splitFrontMatter(source: string): {
  data: FrontMatter;
  content: string;
} {
  const match = source.match(FRONT_MATTER);
  if (!match) return { data: {}, content: source };

  let data: FrontMatter = {};
  try {
    data = (parse(match[1]) as FrontMatter) ?? {};
  } catch {
    // Malformed front matter is metadata we lose, not a reason to fail the page.
    data = {};
  }

  return { data, content: source.slice(match[0].length) };
}

/** The ingestion pipeline marks where each printed page of the source begins. */
const PAGE_MARKER = /^%%page (\d+|[ivxlc]+)(?:#(\d+))?%%$/;

/** Words too common to identify a paragraph by. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "by",
  "for", "with", "as", "is", "was", "were", "that", "this", "it", "he", "she",
  "they", "mr", "mrs", "ms",
]);

/**
 * The characters a `paragraphId()` can contain, as a regex source: any letter
 * or number (so `boardʼs`, `frédéric`, `since¼` keep the report's own
 * spelling) plus the hyphen. Anything that reads ids back out of rendered
 * HTML must use this rather than `[a-z0-9-]`, or a paragraph whose opening
 * words carry a non-ASCII letter silently drops out of the section index,
 * search and the corpus baseline (reportsthatmatter-4k6). Use with the `u`
 * flag.
 */
export const PARAGRAPH_ID_CHARS = "[\\p{L}\\p{N}-]+";

/**
 * A durable id for a paragraph, derived from its own opening words.
 *
 * Positional ids (`p-1`, `p-2`, …) look stable and are not: re-ingesting a
 * report to fix one OCR error renumbers everything after it, so every link
 * ever shared keeps resolving but now points at different text. Deriving the id
 * from the text means a paragraph keeps its address as long as its words do,
 * and a link that *does* break is visibly wrong rather than quietly wrong.
 *
 * It also reads better in a URL, which matters when the URL is the product:
 * `#rioters-at-the-capitol-had-been` over `#p-318`.
 */
export function paragraphId(text: string, taken: Set<string>): string {
  const words = text
    .toLowerCase()
    .replace(/\[\^\d+(?:-\d+)?\]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Dropping stopwords makes the id both shorter and more distinctive, but a
  // very short paragraph can be almost entirely stopwords — keep them then.
  const meaningful = words.filter((word) => !STOPWORDS.has(word));
  const chosen = (meaningful.length >= 2 ? meaningful : words).slice(0, 5);

  let base = chosen.join("-").slice(0, 60).replace(/-+$/, "");
  if (!base) base = "para";

  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }

  // Identical openings do occur — headings repeated across sections, boilerplate.
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/**
 * markdown-it's default `linkify: true` recognises URLs with no `http(s):`
 * prefix by guessing at a domain from bare text, and two shapes of OCR
 * artifact both happen to satisfy that guess (reportsthatmatter-yhb —
 * confirmed on production, not hypothetical; 301 instances across the
 * corpus, verified by diffing every report's rendered output before and
 * after this fix):
 *
 * - Short mis-scanned fragments that coincidentally end in a real TLD:
 *   `Z.TZ`, `a.cz`, `aU.SE`, `q.cn` are not links, they are garbled words.
 * - Far more common: a dropped space at a sentence boundary, immediately
 *   before a short capitalised word that happens to be a real two-letter
 *   ccTLD — `people.To the extent…`, `flight.At 8:46…`, `Omari.As the
 *   investigation…` read as links to `.to` (Tonga), `.at` (Austria), `.as`
 *   (American Samoa). Accounts for the bulk of the 301: 156 of them in
 *   `us-911-commission` alone.
 *
 * Both share one tell a genuine domain never has: the TLD itself is not
 * lowercase. A citation might reasonably read `guardian.co.uk`,
 * `FT.com`, or `GroupSystems.com` — capitalised *labels* are ordinary
 * brand names — but nobody writes a TLD as anything but lowercase, and a
 * dropped-space sentence boundary always leaves the following word
 * capitalised. Filtering on that, via `validateLink` (the documented hook
 * for exactly this), rejects both artifact shapes while keeping every
 * genuine schemeless citation the corpus has — including several that an
 * earlier, blunter version of this fix (requiring an explicit `www.`)
 * would have cost: `guardian.co.uk`, `GroupSystems.com`, and 94 of
 * Leveson's own `levesoninquiry.org.uk/…` citation links, none of which
 * carry a `www.` prefix in the source and all of which are live, working
 * links on production today.
 *
 * A residual is accepted, not chased further: a handful of short,
 * all-lowercase-TLD fragments (`a.cz`, `q.cn`, `cu.in` — Challenger,
 * Columbia, jack-smith-vol1's own worst OCR regions) still auto-link.
 * Telling those apart from a short real domain (`FT.com`) by shape alone
 * risks losing the real ones; this fix targets the two confirmed,
 * systemic patterns above, not every possible false positive.
 */
function configureLinkify(md: MarkdownIt): void {
  const defaultValidateLink = md.validateLink.bind(md);
  md.validateLink = (url) => {
    if (!defaultValidateLink(url)) return false;
    const host = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0];
    const tld = host.split(".").pop();
    return !tld || tld === tld.toLowerCase();
  };
}

/**
 * Renders report markdown to HTML.
 *
 * Top-level paragraphs get a text-derived id and a permalink anchor. Page
 * markers left by the ingestion pipeline become anchors of their own, so a
 * passage can also be cited the way these documents are normally cited — by the
 * printed page it appears on.
 */
export function renderMarkdown(markdown: string): string {
  const { content } = splitFrontMatter(markdown);

  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  configureLinkify(md);

  md.core.ruler.push("rtm_anchors", (state) => {
    const tokens = state.tokens;
    const taken = new Set<string>();
    let page: string | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // A bulleted list is a citable unit too — in these reports the list is
      // often the finding. Its id comes from its first item, by the same rule
      // paragraphs use, so re-ingestion cannot repoint the citation.
      //
      // The search for that item's inline content must stop at the first
      // item's own close: unbounded, it walks past a genuinely empty first
      // item (a bare "-", common in OCR-garbled figure/diagram captions) and
      // grabs the next inline token anywhere later in the document — a
      // second item, or text entirely outside the list (reportsthatmatter-ru3).
      // An empty first item gets the same "para" default an empty paragraph
      // gets, not a borrowed id.
      if (token.type === "bullet_list_open" && token.level === 0) {
        let firstItemText = "";
        let itemDepth = 0;
        for (let j = i + 1; j < tokens.length; j++) {
          const later = tokens[j];
          if (later.type === "list_item_open") {
            itemDepth += 1;
            continue;
          }
          if (later.type === "list_item_close") {
            itemDepth -= 1;
            if (itemDepth === 0) break; // end of the first item
            continue;
          }
          if (itemDepth >= 1 && later.type === "inline") {
            firstItemText = later.content;
            break;
          }
        }
        token.attrSet("id", paragraphId(firstItemText, taken));
        if (page !== null) token.attrSet("data-page", String(page));
        continue;
      }

      if (token.type !== "paragraph_open" || token.level !== 0) continue;

      const text = tokens[i + 1]?.content ?? "";

      const marker = text.match(PAGE_MARKER);
      if (marker) {
        page = /^\d+$/.test(marker[1]) ? String(Number.parseInt(marker[1], 10)) : marker[1];
        // A report's pagination restarts, so the same printed number can
        // appear more than once. The first keeps the bare anchor, so existing
        // citations to it stay valid; later ones are suffixed.
        const id = marker[2] ? `page-${page}-${marker[2]}` : `page-${page}`;
        const anchor = new state.Token("html_block", "", 0);
        anchor.content =
          `<a class="page-marker" id="${id}" href="#${id}"` +
          ` aria-label="Printed page ${page}">${page}</a>\n`;
        tokens.splice(i, 3, anchor);
        continue;
      }

      // Only top-level paragraphs are citable units. A paragraph nested in a
      // list item or a block quote would put its marker mid-line.
      const id = paragraphId(text, taken);
      token.attrSet("id", id);
      if (page !== null) token.attrSet("data-page", String(page));
    }
  });

  const defaultListOpen = md.renderer.rules.bullet_list_open;
  md.renderer.rules.bullet_list_open = (tokens, idx, options, env, self) => {
    const open = defaultListOpen
      ? defaultListOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);

    const id = tokens[idx].attrGet("id");
    if (!id) return open;

    return `${open}<a class="permalink" href="#${id}" aria-label="Link to this list">¶</a>`;
  };

  const defaultParagraphOpen = md.renderer.rules.paragraph_open;
  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    const open = defaultParagraphOpen
      ? defaultParagraphOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);

    const id = tokens[idx].attrGet("id");
    if (!id) return open;

    return `${open}<a class="permalink" href="#${id}" aria-label="Link to this paragraph">¶</a>`;
  };

  const notes = collectNotes(content);
  const { html, placed } = withSidenotes(md.render(stripNotesSection(content)), notes, collectNoteOrder(content));

  // Not every note has a reference in the text — footnote recall is
  // imperfect, and a note we cannot place is still evidence. List the
  // remainder rather than dropping it. Per instance, not per number: with a
  // restarting numbering scheme a number can carry several definitions, and
  // `placed` says which of a number's definitions a reference actually
  // resolved to, so one chapter's "20" can be placed while another's goes
  // unreferenced.
  const orphans: Array<{ number: string; text: string; instance: number }> = [];
  for (const [number, texts] of notes) {
    const resolved = placed.get(number);
    texts.forEach((text, instance) => {
      if (!resolved?.has(instance)) orphans.push({ number, text, instance });
    });
  }
  if (!orphans.length) return html;

  const items = orphans
    .map(
      ({ number, text, instance }) =>
        `<li id="note-${number}${instance > 0 ? `-${instance + 1}` : ""}"><sup>${number.replace(/-\d+$/, "")}</sup> ${escapeText(text)}</li>`
    )
    .join("");

  return (
    `${html}\n<section class="orphan-notes">` +
    `<h2>Notes not linked in the text</h2>` +
    `<p class="orphan-notes-why">These notes appear in the source but the pipeline ` +
    `could not place their reference in the body. They are listed here so nothing ` +
    `is lost.</p><ol>${items}</ol></section>`
  );
}

/** The collected `## Notes` block, which sidenotes replace in the body. */
export function stripNotesSection(markdown: string): string {
  return markdown.replace(/\n## Notes\n[\s\S]*$/, "\n");
}

/**
 * `[^12]: text` definitions, keyed by number, in document order.
 *
 * More than one per number is the case this exists to handle: a report whose
 * footnote numbering restarts (Leveson: per chapter) writes several
 * genuinely different notes under the same label (`footnotes.ts`'s
 * `renderEndnotes`). `withSidenotes` resolves each `[^N]` reference against
 * these positionally — the first `[^20]` in the body to this number's first
 * definition, the second to its second, and so on — rather than a single
 * shared lookup that let one chapter's reference resolve to another's text.
 */
export function collectNotes(markdown: string): Map<string, string[]> {
  const notes = new Map<string, string[]>();
  for (const match of markdown.matchAll(/^\[\^(\d+(?:-\d+)?)\]:[ \t]*(.+)$/gm)) {
    const list = notes.get(match[1]) ?? [];
    list.push(match[2].trim());
    notes.set(match[1], list);
  }
  return notes;
}

/** The labels of the `[^N]:` definitions in document order, repeats included. */
export function collectNoteOrder(markdown: string): string[] {
  return [...markdown.matchAll(/^\[\^(\d+(?:-\d+)?)\]:/gm)].map((match) => match[1]);
}

/**
 * Which definition each reference opens, when a label is defined more than
 * once (a numbering that restarts per chapter: 9/11, Leveson, Litvinenko).
 *
 * Both the references in the body and the definitions in the notes follow
 * reading order, so the pairing is a monotone alignment: the longest common
 * subsequence of the two label sequences, over the repeated labels only. It
 * replaces "the k-th reference takes the k-th definition", which let one
 * stray marker (9/11's drop-cap garble "11,[^20] 01" consumed chapter 1's
 * note 20) hand every later [^20] the previous chapter's note: 148 wrong
 * notes in one report (reportsthatmatter-apk). Here a stray marker is simply
 * the one reference left unpaired, and a note nobody cites is the one
 * definition left unpaired; neither disturbs its neighbours.
 *
 * `labels` are the references in document order; `order` is every
 * definition's label in document order. Returns, per reference, the index of
 * its definition within that label's list, or null for a reference the
 * alignment could not pair (the caller falls back to the old positional
 * rule). A label defined once never needs aligning and always resolves to 0.
 */
export function resolveNoteReferences(
  labels: readonly string[],
  order: readonly string[]
): Array<number | null> {
  const defined = new Map<string, number>();
  for (const label of order) defined.set(label, (defined.get(label) ?? 0) + 1);

  const result: Array<number | null> = labels.map((label) => (defined.get(label) === 1 ? 0 : null));
  const refs: number[] = [];
  labels.forEach((label, i) => {
    if ((defined.get(label) ?? 0) > 1) refs.push(i);
  });
  const ordinal = new Map<string, number>();
  const defs: Array<{ label: string; index: number }> = [];
  for (const label of order) {
    if ((defined.get(label) ?? 0) < 2) continue;
    const index = ordinal.get(label) ?? 0;
    ordinal.set(label, index + 1);
    defs.push({ label, index });
  }
  const n = refs.length;
  const m = defs.length;
  if (!n || !m) return result;
  // A table this size would take hundreds of megabytes (Leveson: 8,500 references by 8,600
  // definitions, once its raised markers are linked, reportsthatmatter-b94). The same alignment in
  // linear space instead; below it, the table, whose pairing every other report already renders.
  if (n * m > 40_000_000) {
    if (n * m > MAX_LINEAR_ALIGNMENT) return result;
    for (const [i, j] of alignLinearSpace(refs.map((r) => labels[r]), defs.map((d) => d.label))) {
      result[refs[i]] = defs[j].index;
    }
    return result;
  }

  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        labels[refs[i]] === defs[j].label
          ? Math.min(65535, table[(i + 1) * width + j + 1] + 1)
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (labels[refs[i]] === defs[j].label && table[i * width + j] === table[(i + 1) * width + j + 1] + 1) {
      result[refs[i]] = defs[j].index;
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return result;
}

/** Beyond this even the linear-space alignment is too slow to run on every render; the positional rule stands. */
const MAX_LINEAR_ALIGNMENT = 1_000_000_000;

/**
 * A longest common subsequence of `a` and `b`, as index pairs in order, in
 * space linear in `b` (Hirschberg's divide and conquer over the same
 * recurrence as the table in `resolveNoteReferences`).
 */
function alignLinearSpace(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const ids = new Map<string, number>();
  const id = (s: string) => {
    let v = ids.get(s);
    if (v === undefined) ids.set(s, (v = ids.size));
    return v;
  };
  const A = Int32Array.from(a, id);
  const B = Int32Array.from(b, id);
  const pairs: Array<[number, number]> = [];
  // LCS lengths of A[aLo, aHi) against every prefix (forward) or suffix (backward) of B[bLo, bHi).
  const row = (aLo: number, aHi: number, bLo: number, bHi: number, forward: boolean): Int32Array => {
    const w = bHi - bLo;
    let prev = new Int32Array(w + 1);
    let cur = new Int32Array(w + 1);
    for (let x = 0; x < aHi - aLo; x++) {
      const av = A[forward ? aLo + x : aHi - 1 - x];
      for (let y = 1; y <= w; y++) {
        const bv = B[forward ? bLo + y - 1 : bHi - y];
        cur[y] = av === bv ? prev[y - 1] + 1 : Math.max(prev[y], cur[y - 1]);
      }
      [prev, cur] = [cur, prev];
    }
    return prev;
  };
  const solve = (aLo: number, aHi: number, bLo: number, bHi: number): void => {
    if (aHi <= aLo || bHi <= bLo) return;
    if (aHi - aLo === 1) {
      for (let j = bLo; j < bHi; j++) {
        if (B[j] === A[aLo]) {
          pairs.push([aLo, j]);
          return;
        }
      }
      return;
    }
    const mid = (aLo + aHi) >> 1;
    const left = row(aLo, mid, bLo, bHi, true);
    const right = row(mid, aHi, bLo, bHi, false);
    const w = bHi - bLo;
    let split = 0;
    let best = -1;
    for (let k = 0; k <= w; k++) {
      const total = left[k] + right[w - k];
      if (total > best) {
        best = total;
        split = k;
      }
    }
    solve(aLo, mid, bLo, bLo + split);
    solve(mid, aHi, bLo + split, bHi);
  };
  solve(0, A.length, 0, B.length);
  return pairs;
}

/**
 * A note this long floating in the margin runs disproportionately taller
 * than the paragraph it supports, and drags every sidenote after it out of
 * alignment with its own paragraph for the rest of the page (floats stack
 * top-to-bottom in the margin column, independent of each note's own
 * anchor). Measured across the published reports before picking a number:
 * the median note everywhere is 47-169 characters, so this only trips for
 * the genuine outliers — see docs/plans/2026-08-09-sidenote-design-research.md.
 */
const LONG_NOTE_CHARS = 400;

/**
 * Turns footnote references into sidenotes.
 *
 * A footnote you have to travel to is a footnote you don't read. These reports
 * are mostly citation, and the citation is the evidence — so the note belongs
 * beside the sentence it supports, not 70 KB away at the end of the document.
 *
 * The markup degrades honestly: the reference is still a link to the collected
 * note, so it works without CSS, without JavaScript, and on a narrow screen
 * where there is no margin to put a sidenote in.
 */
export function withSidenotes(
  html: string,
  notes: Map<string, string[]>,
  order?: readonly string[]
): { html: string; used: Map<string, number>; placed: Map<string, Set<number>> } {
  const used = new Map<string, number>();
  const placed = new Map<string, Set<number>>();
  let counter = 0;

  // With the definitions' own order the references are paired by alignment
  // (resolveNoteReferences); without it, positionally, as before.
  const references = [...html.matchAll(/\[\^(\d+(?:-\d+)?)\]/g)].map((match) => match[1]);
  const aligned = order ? resolveNoteReferences(references, order) : undefined;
  let reference = 0;

  const out = html.replace(/\[\^(\d+(?:-\d+)?)\]/g, (whole, label: string) => {
    const at = reference++;
    // "3-117" is note 3 under one paragraph (`paragraph-notes.ts`): the
    // label keeps it apart from every other note 3, and 3 is what the reader
    // sees, as printed.
    const number = label.replace(/-\d+$/, "");
    const list = notes.get(label);
    if (!list?.length) return whole;

    // Resolve to this number's definitions in order, one reference to one
    // definition — see collectNotes. More references than definitions (a
    // note genuinely cited twice, or recall missed one) fall back to the
    // last definition rather than losing the note.
    const seen = used.get(label) ?? 0;
    const index = Math.min(aligned?.[at] ?? seen, list.length - 1);
    const note = list[index];
    used.set(label, seen + 1);
    if (!placed.has(label)) placed.set(label, new Set());
    placed.get(label)!.add(index);

    counter += 1;
    const toggleId = `sn-${label}-${counter}`;
    const long = note.length > LONG_NOTE_CHARS;

    return (
      `<label class="sidenote-toggle" for="${toggleId}" aria-label="Note ${number}">` +
      `<sup>${number}</sup></label>` +
      `<input class="sidenote-checkbox" id="${toggleId}" type="checkbox" />` +
      `<span class="sidenote${long ? " long" : ""}"><sup>${number}</sup> ${escapeText(note)}` +
      (long ? `<label class="sidenote-expand" for="${toggleId}">Show full note</label>` : "") +
      `</span>`
    );
  });

  return { html: out, used, placed };
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Headings get slug ids so a section can be linked as well as a paragraph. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}
