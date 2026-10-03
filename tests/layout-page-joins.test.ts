import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { decidePageBreak, findPageBreakLines, layoutJoins, pageBreakKey, type PageBreakCase } from "../src/pagebreaks";
import { mergeAcrossPages, type Block } from "../src/paragraphs";
import { pipeline, resolvePasses } from "../src/define";
import { layoutPageJoins } from "../src/passes";

/**
 * Real page pairs (reportsthatmatter-38s.10): `<name>.xml` is `pdftohtml -xml -hidden` of the two
 * pages either side of the break, `<name>.json` the two blocks' text as the pipeline read them
 * (the paragraph's end on the old page, the block's start on the new one).
 */
const fixture = (name: string) => {
  const dir = new URL("./fixtures/pagebreaks/", import.meta.url);
  const f = JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) as {
    at: { volume: number; pdfIndex: number };
    prev: string;
    next: string;
  };
  const layout = buildLayout([parseLayoutXml(readFileSync(new URL(`${name}.xml`, dir), "utf8"))]);
  return { ...f, layout };
};

const decide = (name: string, options = {}) => {
  const f = fixture(name);
  const lines = findPageBreakLines(f.layout, f.prev, f.next, f.at);
  expect(lines, `${name}: lines found in the layout`).toBeDefined();
  return { ...decidePageBreak(lines!, f.prev, f.next, options), lines: lines! };
};

describe("layoutPageJoins on real page breaks", () => {
  it("R1: a capital continuation flush with the line under it joins (Philip Morris p.1050)", () => {
    // "…addressed to Nancy Brennan Lund, now Senior Vice President for" / "Marketing at Philip Morris…"
    const d = decide("pm-p1050");
    expect(d).toMatchObject({ join: true, rule: "R1" });
    expect(Math.abs(d.indentEm!)).toBeLessThan(0.6);
  });

  it("R2: past a full stop, a full justified last line and a flush first line join (9/11 p.58)", () => {
    // "We believe this call would have taken place sometime before 10:10 to 10:15." /
    // "Among the sources that reflect other important events of that morning, there is no documentary…"
    const d = decide("911-p58");
    expect(d).toMatchObject({ join: true, rule: "R2", ambiguous: true });
    expect(d.lines.prev.reachesRight).toBe(true);
  });

  it("a footnote marker after the full stop still ends the sentence; an indented first line splits (9/11 p.22)", () => {
    // "…began at 8:14 or shortly thereafter.24" / "Reports from two flight attendants…" (indented 1.2 em)
    const d = decide("911-p22");
    expect(d.join).toBe(false);
    expect(d.indentEm).toBeGreaterThan(0.6);
  });

  it("a marker after the stop on a ragged page: a new paragraph, not R1 (Deepwater p.20)", () => {
    // "…the well's new bottom cement seal.21" / "According to the BP team's plan…": flush, but finished,
    // and the page is not justified, so R2 cannot apply either. Read as unfinished, R1 joined it.
    const d = decide("deepwater-p20");
    expect(d).toMatchObject({ join: false, reason: "finished, next line flush", confidence: "medium", ambiguous: false });
  });

  it("never joins into a numbered paragraph (Saville p.122, '7.44')", () => {
    const d = decide("saville-p122");
    expect(d).toMatchObject({ join: false, reason: "next opens on a label" });
  });

  it("a change of face blocks the join: a map caption a point under the body (9/11 p.33)", () => {
    // "…Northeast Air Defense Sector Graphics courtesy of ESRI" (Bembo 14) / "Virginia, which oversees…" (Bembo 15)
    const d = decide("911-p33");
    expect(d).toMatchObject({ join: false, reason: "font changes across the break" });
  });

  it("an index entry is not prose run over the page (Deepwater p.387)", () => {
    // "Duplessis, Clarence R., 209" / "East Cameron Partners, 227": unfinished and flush, but the last line stops
    // far short of the margin.
    const d = decide("deepwater-p387");
    expect(d).toMatchObject({ join: false, reason: "unfinished, but a short last line" });
  });

  it("a scan's OCR layer may size consecutive lines a point apart: joins only when declared scanned (Challenger p.36)", () => {
    // "…the Office of Space" (17) / "Flight also suffered a decline in staff." (16)
    expect(decide("challenger-p36")).toMatchObject({ join: false, reason: "font changes across the break" });
    expect(decide("challenger-p36", { scanned: true })).toMatchObject({ join: true, rule: "R1" });
  });

  it("returns no lines (and so no join) when the text is not on those pages", () => {
    const f = fixture("pm-p1050");
    expect(findPageBreakLines(f.layout, "nothing like this appears anywhere in the", f.next, f.at)).toBeUndefined();
    expect(layoutJoins(f.layout, "nothing like this appears anywhere in the", f.next, f.at)).toBe(false);
  });
});

describe("the referee hook (38s.11)", () => {
  it("is asked only on low-margin calls, with a stable key, and its answer stands", () => {
    const seen: PageBreakCase[] = [];
    const f = fixture("911-p58");
    // R2 is always low-margin: the referee may overrule it.
    expect(layoutJoins(f.layout, f.prev, f.next, f.at, { referee: (c) => (seen.push(c), false) })).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0].decision.rule).toBe("R2");
    expect(seen[0].key).toBe(pageBreakKey(seen[0].lines.prev.text, seen[0].lines.next.text));
    expect(seen[0].key).toMatch(/^[0-9a-f]{16}$/);
    // No answer: the rules stand.
    expect(layoutJoins(f.layout, f.prev, f.next, f.at, { referee: () => undefined })).toBe(true);
    // A clear call is never put to it.
    const label = fixture("saville-p122");
    const asked: PageBreakCase[] = [];
    layoutJoins(label.layout, label.prev, label.next, label.at, { referee: (c) => (asked.push(c), true) });
    expect(asked).toHaveLength(0);
  });
});

describe("mergeAcrossPages with layoutJoins", () => {
  const blocks = (name: string): Block[] => {
    const f = fixture(name);
    const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
    return [
      { kind: "paragraph", text: f.prev, at: at(f.at.pdfIndex - 1) },
      { kind: "page", number: f.at.pdfIndex, at: at(f.at.pdfIndex) },
      { kind: "paragraph", text: f.next, at: at(f.at.pdfIndex) },
    ];
  };

  it("joins what the layout says runs on, and leaves the page marker after it", () => {
    const f = fixture("pm-p1050");
    const merged = mergeAcrossPages(blocks("pm-p1050"), { layout: f.layout, layoutJoins: {} });
    expect(merged.map((b) => b.kind)).toEqual(["paragraph", "page"]);
    expect((merged[0] as { text: string }).text).toBe(`${f.prev} ${f.next}`);
  });

  it("does nothing without the pass, or without a layout", () => {
    const f = fixture("pm-p1050");
    expect(mergeAcrossPages(blocks("pm-p1050"), { layout: f.layout })).toHaveLength(3);
    expect(mergeAcrossPages(blocks("pm-p1050"), { layoutJoins: {} })).toHaveLength(3);
  });

  it("does not join a numbered finding", () => {
    const f = fixture("pm-p1050");
    const b = blocks("pm-p1050");
    (b[2] as { finding?: number }).finding = 2752;
    expect(mergeAcrossPages(b, { layout: f.layout, layoutJoins: {} })).toHaveLength(3);
  });

  it("only at a page break: a block that follows another on its own page is not one", () => {
    const f = fixture("pm-p1050");
    const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
    const b: Block[] = [
      { kind: "paragraph", text: f.prev, at: at(f.at.pdfIndex - 1) },
      { kind: "page", number: f.at.pdfIndex, at: at(f.at.pdfIndex) },
      { kind: "heading", level: 3, text: "A heading", at: at(f.at.pdfIndex) },
      { kind: "paragraph", text: f.next, at: at(f.at.pdfIndex) },
    ];
    expect(mergeAcrossPages(b, { layout: f.layout, layoutJoins: {} })).toHaveLength(4);
  });
});

describe("declaring layoutPageJoins", () => {
  const def = (passes: Parameters<typeof pipeline>[0]["passes"]) =>
    pipeline({ id: "x", title: "X", repo: ".", volumes: [{ path: "a.pdf" }], passes });

  it("is off unless declared", () => {
    expect(resolvePasses(def([])).layoutPageJoins).toBeUndefined();
  });

  it("carries scanned and the referee through", () => {
    const referee = () => undefined;
    expect(resolvePasses(def([layoutPageJoins()])).layoutPageJoins).toEqual({});
    expect(resolvePasses(def([layoutPageJoins({ scanned: true, referee })])).layoutPageJoins).toEqual({ scanned: true, referee });
  });
});

describe("a footnote's run-over between the paragraph and its continuation (reportsthatmatter-j6qm)", () => {
  // Lehman p.59/60: the paragraph stops at the page foot ("primarily Fuld, Joseph"), then the run-over of
  // a note begun on the page before (smaller face, no number) reads as a body paragraph, then the new page
  // opens on "Gregory (Lehman's President…".
  const f = fixture("lehman-p60") as ReturnType<typeof fixture> & { note: string };
  const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
  const stream = (): Block[] => [
    { kind: "paragraph", text: f.prev, at: at(59) },
    { kind: "paragraph", text: f.note, at: at(59) },
    { kind: "page", number: 60, at: at(60) },
    { kind: "paragraph", text: f.next, at: at(60) },
  ];

  it("joins the continuation to the paragraph above the note, which stays where it is", () => {
    const merged = mergeAcrossPages(stream(), { layout: f.layout, layoutJoins: {} });
    expect(merged.map((b) => b.kind)).toEqual(["paragraph", "paragraph", "page"]);
    expect((merged[0] as { text: string }).text).toBe(`${f.prev} ${f.next}`);
    expect((merged[1] as { text: string }).text).toBe(f.note);
  });

  it("not past a figure's caption, which is off the body face too", () => {
    const b = stream();
    (b[1] as { text: string }).text = `Figure 3.4-6. ${f.note}`;
    expect(mergeAcrossPages(b, { layout: f.layout, layoutJoins: {} })).toHaveLength(4);
  });

  it("not without the pass", () => {
    expect(mergeAcrossPages(stream(), { layout: f.layout })).toHaveLength(4);
  });
});

describe("a scan's stray glyph inside a paragraph (reportsthatmatter-ky1o, Jack Smith p.44)", () => {
  const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
  const stream = (): Block[] => [
    { kind: "paragraph", text: "House official who engaged with Mr. Trump, and even his own", at: at(44) },
    { kind: "paragraph", text: "° running mate.[^14] For example, Mr. Trump's Campaign Manager informed him.", at: at(44) },
  ];

  it("drops the degree sign and joins, on a scan", () => {
    const merged = mergeAcrossPages(stream(), { layoutJoins: { scanned: true } });
    expect(merged).toHaveLength(1);
    expect((merged[0] as { text: string }).text).toBe(
      "House official who engaged with Mr. Trump, and even his own running mate.[^14] For example, Mr. Trump's Campaign Manager informed him."
    );
  });

  it("leaves a born-digital page, and a finished paragraph, alone", () => {
    expect(mergeAcrossPages(stream(), { layoutJoins: {} })).toHaveLength(2);
    const done = stream();
    (done[0] as { text: string }).text = "He was told so.";
    expect(mergeAcrossPages(done, { layoutJoins: { scanned: true } })).toHaveLength(2);
  });
});
