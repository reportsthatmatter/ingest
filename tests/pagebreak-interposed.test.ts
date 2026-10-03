import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLayout, parseLayoutXml, type Layout } from "../src/layout";
import { decidePageBreak, findPageBreakLines } from "../src/pagebreaks";
import { mergeAcrossPages, type Block } from "../src/paragraphs";

/**
 * Upstream of the page-break join (reportsthatmatter-y7ix): the join has to
 * see the right pair. Real page pairs, `pdftohtml -xml -hidden -i` of the two
 * pages either side of the break, with the blocks the pipeline read from them.
 */
const dir = new URL("./fixtures/pagebreaks/", import.meta.url);
const layoutOf = (name: string): Layout => buildLayout([parseLayoutXml(readFileSync(new URL(`${name}.xml`, dir), "utf8"))]);
const fixture = (name: string) => ({
  ...(JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) as { at: { volume: number; pdfIndex: number }; prev: string; next: string }),
  layout: layoutOf(name),
});
const at = (pdfIndex: number, volume = 1) => ({ volume, pdfIndex, printed: pdfIndex });
const para = (text: string, pdfIndex: number, volume = 1): Block => ({ kind: "paragraph", text, at: at(pdfIndex, volume) });
const page = (n: number, pdfIndex: number, volume = 1): Block => ({ kind: "page", number: n, at: at(pdfIndex, volume) });
const texts = (blocks: Block[]) => blocks.filter((b) => b.kind !== "page").map((b) => (b as { text: string }).text);

describe("past a caption and a photo credit to the paragraph's rest (Deepwater p.63/64)", () => {
  // "…and Thunder Horse in the Mississippi" / [caption title] [caption] [credit] / "Canyon—with total potential reserves…"
  const layout = layoutOf("deepwater-p64-caption");
  const prev =
    "BP's decision to develop multiple deepwater fields at once was an incredibly ambitious undertaking. Its program focused on the major fields at Holstein (a discovery above the salt), Mad Dog, Atlantis in the Green Canyon, and Thunder Horse in the Mississippi";
  // The caption's title and credit (its text sits in the body face on these two pages alone).
  const caption = ["BP Thunder Horse Platform", "Getty Images/U.S. Coast Guard photo/PA3 Robert M. Reed/digital version by Science Faction"];
  const next =
    "Canyon—with total potential reserves of 2.5 billion barrels of oil, in water ranging from 4,000 to 7,000 feet deep, requiring wells reaching 30,000 feet in total depth.";
  const stream = (): Block[] => [para(prev, 63), page(48, 64), ...caption.map((c) => para(c, 64)), para(next, 64)];

  it("joins the capital continuation by the layout rules; the caption stays where it is, after the paragraph", () => {
    const merged = mergeAcrossPages(stream(), { layout, layoutJoins: {} });
    expect(texts(merged)).toEqual([`${prev} ${next}`, ...caption]);
  });

  it("not across a heading: a capital after a heading may open a new section", () => {
    const b = stream();
    b[2] = { kind: "heading", level: 3, text: caption[0], at: at(64) };
    expect(texts(mergeAcrossPages(b, { layout, layoutJoins: {} }))).toEqual([prev, ...caption, next]);
  });

  it("not without the pass", () => {
    expect(texts(mergeAcrossPages(stream(), { layout }))).toEqual([prev, ...caption, next]);
  });
});

describe("a lower-case continuation goes to the paragraph, not the credit in front of it (Deepwater p.17/18)", () => {
  // The old text rules joined "the well bore…" onto "< Photo courtesy of Transocean"; then nothing was left to
  // join "The crew worked on" to but "By the time…", a new paragraph.
  const layout = layoutOf("deepwater-p18-credit");
  const prev =
    "Outside in the Gulf, it was still dark—beyond the glare of the floodlights on the gargantuan rig. The rig's industrial hum and loud mechanical noises punctuated the sea air as a slight breeze blew in off the water. The crew worked on";
  const caption =
    "Pride of the Transocean fleet of offshore drilling rigs, Deepwater Horizon rides calmly on station 40 miles off the Louisiana coast.";
  const credit = "< Photo courtesy of Transocean";
  const rest = "the well bore, aiming always to keep the pressure inside the well balancing the force exerted by the surrounding seabed.2";
  const after =
    "By the time the Halliburton engineer had arrived at the rig four days earlier to help cement in the two-and-a-half-mile-deep Macondo well, some crew members had dubbed it \"the well from hell.\"";

  it("joins the rest to the paragraph and leaves the next paragraph alone", () => {
    const merged = mergeAcrossPages([para(prev, 17), para(caption, 17), para(credit, 17), page(2, 18), para(rest, 18), para(after, 18)], {
      layout,
      layoutJoins: {},
    });
    expect(texts(merged)).toEqual([`${prev} ${rest}`, caption, credit, after]);
  });
});

describe("not past what carries the sentence on itself (Leveson vol. II p.40/41)", () => {
  // "…the Rt Hon Gordon Brown, apologised" / "“on behalf of all politicians” for the expenses…" / "Leader of the
  // Conservative Party…": the quotation opening the page continues the sentence; the capital after it does not.
  const layout = layoutOf("leveson-ii-p41-italic");
  const prev =
    "2.52 The disclosure by the Telegraph of MPs' expenses claims was the subject of intense and extended media coverage and, indeed, public debate. On 11 May 2009, the then Prime Minister, the Rt Hon Gordon Brown, apologised";
  const quoted = '"on behalf of all politicians" for the expenses claims that had been made. Later that day, the';
  const next = "Leader of the Conservative Party, Rt Hon David Cameron, said that all MPs should apologise for the expenses scandal.";

  it("leaves the capital where it is", () => {
    const merged = mergeAcrossPages([para(prev, 40, 1), page(41, 41, 1), para(quoted, 41, 1), para(next, 41, 1)], { layout, layoutJoins: {} });
    expect(texts(merged)).not.toContain(`${prev} ${next}`);
    expect(texts(merged).at(-1)).toContain(next);
  });
});

describe("the page-break pair the layout could not find or misread", () => {
  it("a bare number opening the new page is the sentence running on, not a label (Saville p.302, hfrd)", () => {
    const f = fixture("saville-p302-number");
    const lines = findPageBreakLines(f.layout, f.prev, f.next, f.at);
    expect(lines).toBeDefined();
    expect(lines!.next.label).toBe(true); // the layout's own label test still says so
    const d = decidePageBreak(lines!, f.prev, f.next);
    expect(d).toMatchObject({ join: true, rule: "R1", confidence: "medium" });
    expect(d.reason).toContain("a bare number");
  });

  it("a bare number after a finished sentence is still a label", () => {
    const f = fixture("saville-p302-number");
    const lines = findPageBreakLines(f.layout, f.prev, f.next, f.at)!;
    expect(decidePageBreak(lines, `${f.prev}.`, f.next)).toMatchObject({ join: false, reason: "next opens on a label (layout)" });
  });

  it("finds a first line whose raised ordinal the layout set apart (Philip Morris p.1581, \"7th Cir.\")", () => {
    const f = fixture("pm-p1581-ordinal");
    const lines = findPageBreakLines(f.layout, f.prev, f.next, f.at);
    expect(lines?.next.text).toMatch(/^States v\. Hickok/);
    expect(lines?.prev.text).toMatch(/mail fraud.” +United$/);
    expect(decidePageBreak(lines!, f.prev, f.next)).toMatchObject({ join: true, rule: "R1" });
  });

  it("but not a line that ends a few letters short of the paragraph", () => {
    const f = fixture("pm-p1581-ordinal");
    // The paragraph's last line is "…mail fraud.” United"; with "States" added the tail is no longer any line's.
    expect(findPageBreakLines(f.layout, `${f.prev} States`, f.next, f.at)?.prev.text ?? "").not.toMatch(/United$/);
  });
});
