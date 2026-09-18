import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractParagraphNotes } from "../src/paragraph-notes";
import { renderEndnotes } from "../src/footnotes";
import { collectNotes, withSidenotes } from "../src/markdown";
import { structuralChecks } from "../src/fidelity";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const read = (name: string) => {
  const pages = [{ index: 1, body: fixture(name) }];
  const { notes } = extractParagraphNotes(pages);
  return { notes, body: pages[0].body.join("\n") };
};

describe("paragraph notes (reportsthatmatter-0rx)", () => {
  it("reads a two-column block down each column, wrapped text and all", () => {
    // Saville p138: 7.101's notes 1 and 2 sit side by side, each wrapping
    // over three and four lines of its own column.
    const { notes } = read("saville-paragraph-notes");
    const note = (label: string) => notes.find((n) => n.label === label)?.text;
    expect(note("1-2")).toBe(
      "McKittrick and McVea, Making Sense of the Troubles, p65; Bew and Gillespie, Chronology of the Troubles, p34; Hennessey, History of Northern Ireland, p189."
    );
    expect(note("2-2")).toBe(
      "Elliott and Flackes, Political Directory, p183; Faulkner, Memoirs, p84; McKittrick and McVea, Making Sense of the Troubles, p66; Bew and Gillespie, Chronology of the Troubles, p34."
    );
  });

  it("gives each paragraph's note 1 its own label, and links it in that paragraph", () => {
    const { notes, body } = read("saville-paragraph-notes");
    expect(notes.filter((n) => n.number === 1).map((n) => n.label)).toEqual([
      "1-1",
      "1-2",
      "1-3",
      "1-4",
    ]);
    expect(body).toContain("Bishop of Derry.[^1-1]");
    expect(body).toContain("Unionist Party.[^1-2] The new Prime Minister");
    expect(body).toContain("Stormont government.[^2-2]");
    expect(body).toContain("chairing two of them.[^1-3]");
    expect(body).toContain("from anyone ”.[^1-4]");
  });

  it("takes the note block out of the body and leaves the prose", () => {
    const { body } = read("saville-paragraph-notes");
    expect(body).not.toContain("Lost Lives, pp68–69");
    expect(body).toContain("offering only an extra 1,300 troops.");
  });

  it("links a marker set after a closing quote, and one fused to a word", () => {
    // Saville p275: "…DESERVES I THINK A HIGH PRIORITY.”" carries no marker
    // on the page, but 9.165 does — "Londonderry.1" and "march.2".
    const { body } = read("saville-quoted-telegram");
    expect(body).toMatch(/gone to Londonderry\.\[\^1-\d+\]/);
    expect(body).toMatch(/the proposed march\.\[\^2-\d+\]/);
  });

  it("leaves a numbered map legend where it is", () => {
    // Saville p65: "1   Jackie Duddy" under a map has a note block's shape,
    // but nothing in the text refers to it.
    const { notes, body } = read("saville-map-legend");
    expect(notes.map((n) => n.text)).not.toContain("Jackie Duddy");
    expect(body).toContain("Jackie Duddy");
  });

  it("renders a label as its printed number, each note resolving to its own text", () => {
    const markdown =
      "One.[^1-1] Two.[^1-2]\n\n## Notes\n\n" +
      renderEndnotes([
        { number: 1, label: "1-1", text: "First paragraph's note.", page: 1 },
        { number: 1, label: "1-2", text: "Second paragraph's note.", page: 1 },
      ]);
    const { html } = withSidenotes("<p>One.[^1-1] Two.[^1-2]</p>", collectNotes(markdown));
    expect(html).toContain("<sup>1</sup> First paragraph's note.");
    expect(html).toContain("<sup>1</sup> Second paragraph's note.");
    expect(html).not.toContain("1-2</sup>");
    expect(structuralChecks(markdown).find((c) => c.name.startsWith("every footnote"))?.ok).toBe(
      true
    );
  });

  it("keeps adjacent notes that share a number but not a label", () => {
    // Two paragraphs, one note each: both are "1", and merging them as a
    // repeat would put one paragraph's citation under the other.
    const out = renderEndnotes([
      { number: 1, label: "1-1", text: "A.", page: 1 },
      { number: 1, label: "1-2", text: "B.", page: 1 },
    ]);
    expect(out).toBe("[^1-1]: A.\n\n[^1-2]: B.");
  });
});

describe("unmapped glyphs", () => {
  it("drops pdftotext's replacement character rather than printing it", async () => {
    const { normaliseWhitespace } = await import("../src/extract");
    expect(normaliseWhitespace("8.76 �   Unsurprisingly, little was agreed")).toBe(
      "8.76 Unsurprisingly, little was agreed"
    );
  });
});
