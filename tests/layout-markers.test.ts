import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { linkLayoutMarkers, pageDefinesNotes, foldForMatch } from "../src/markers";
import { measureLayout } from "../src/oracle";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { layoutMarkers } from "../src/passes";
import type { Block } from "../src/paragraphs";

/**
 * Real pages (reportsthatmatter-b94): `pdftohtml -xml` of the page and the blocks and notes the
 * pipeline made for it before `layoutMarkers` existed (`pnpm ingest page --fixture`). Each
 * expectation was read against the page.
 */
const fixture = (name: string) => {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/oracle/${name}.json`, import.meta.url), "utf8"));
  // (the text linkers that ran before this pass existed are undone, so the pass sees what it sees in the pipeline)
  const blocks = (f.blocks as Block[]).map((b) =>
    "text" in b ? { ...b, text: b.text.replace(/\[\^(\d+)\]/g, "$1") } : b
  );
  return {
    layout: buildLayout([parseLayoutXml(f.xml)]),
    blocks,
    footnotes: f.footnotes as Array<{ number: number; volume?: number; pdfIndex?: number; text: string }>,
  };
};

const onPage = (footnotes: Array<{ number: number; volume?: number; pdfIndex?: number }>) => (v: number, p: number) =>
  new Set(footnotes.filter((n) => (n.volume ?? 1) === v && n.pdfIndex === p).map((n) => n.number));

const texts = (blocks: Block[]) => blocks.flatMap((b) => ("text" in b ? [b.text] : b.kind === "list" ? b.items : []));

describe("linkLayoutMarkers on real pages", () => {
  it("Leveson vol.1 p.111: all eleven raised markers, flush against a word, a comma or a year", () => {
    const { layout, blocks, footnotes } = fixture("leveson-v1-p111");
    const stats = linkLayoutMarkers(blocks, layout, { scope: "page", onPage: onPage(footnotes) });
    expect(stats).toMatchObject({ raised: 11, candidates: 11, linked: 11, unplaced: 0 });
    const all = texts(blocks).join("\n");
    for (const s of [
      "both companies.[^7]",
      "related issues at NI.[^8]",
      "News Corp and NI.[^9] It works",
      "standards.[^10] The MSC",
      "legal structure.[^11]",
      "Corp,[^12] but at the time",
      "Board of Directors.[^13] The role",
      "later in the report.[^14]",
      "$61.98bn.[^15] Its financial",
      "turnover for 2009.[^16] In 2011",
      "$2.99bn in 2011.[^17]",
    ]) {
      expect(all).toContain(s);
    }
    // nothing else gained a marker: "29% stake", "7% of News Corp's shares", "$32.78bn" stay text
    expect(all.match(/\[\^/g)).toHaveLength(11);
    expect(all).toContain("owns 7% of News Corp");
  });

  it("then the oracle finds none of them unlinked and none spurious", () => {
    const { layout, blocks, footnotes } = fixture("leveson-v1-p111");
    linkLayoutMarkers(blocks, layout, { scope: "page", onPage: onPage(footnotes) });
    const r = measureLayout(layout, blocks, footnotes, { relink: false });
    expect(r.counts["markers-unlinked"]).toBe(0);
    expect(r.counts["markers-spurious"]).toBe(0);
  });

  it("Chilcot p.11: after a full stop, and on the last line of a bullet", () => {
    const { layout, blocks, footnotes } = fixture("chilcot-p11");
    const stats = linkLayoutMarkers(blocks, layout, { scope: "page", onPage: onPage(footnotes) });
    // "…international community.”1" opens the page, and these blocks are the merged ones: the
    // paragraph holding it starts on p.10. (In the pipeline the pass runs before the merge.)
    expect(stats).toMatchObject({ raised: 4, linked: 3, unplaced: 1 });
    const all = texts(blocks).join("\n");
    expect(all).toContain("Russia abstained.[^2]");
    expect(all).toContain("economic sanctions.[^3]");
    // "resolution 1284 in December 1999": numbers in the same line that are not raised stay text
    expect(all).toContain("resolution 1284 in December 1999");
  });

  it("Lehman p.20: a marker on every cell of a table, glued to the figure (16.1 then raised 72)", () => {
    const { layout, blocks, footnotes } = fixture("lehman-p20");
    const stats = linkLayoutMarkers(blocks, layout, { scope: "page", onPage: onPage(footnotes) });
    expect(stats.unplaced).toBe(0);
    const table = texts(blocks).find((t) => t.startsWith("Date Repo 105"))!;
    expect(table).toContain("$38.6 B[^71] 16.1[^72] 17.8[^73] 1.7");
    expect(table).toContain("12.1[^78] 13.9[^79] 1.8");
  });

  it("PSI p.399: a raised marker poppler emits after the text that follows it", () => {
    // `<text left=108>assets, "I broke my phone." </text><text left=332>He also…</text><text left=310>1585</text>`
    const { layout, blocks, footnotes } = fixture("psi-p399");
    const line = layout.lines(1, 399).find((l) => l.text.includes("I broke my phone"))!;
    expect(line.raised.map((r) => r.text)).toEqual(["1585"]);
    expect(line.text.slice(0, line.raised[0].offset)).toMatch(/phone\.["”]\s?$/);
    linkLayoutMarkers(blocks, layout, { scope: "page", onPage: onPage(footnotes) });
    expect(texts(blocks).join("\n")).toMatch(/I broke my phone\.["”]\[\^1585\] He also/);
  });

  it("Litvinenko p.22: a marker after a closing quote in an italic quotation (4ef1)", () => {
    // `<text left=136 width=477><i>"looking into the possibility of assassinating Berezovsky" </i></text>
    //  <text left=610 width=12 font=small>33</text><text left=622> and in her initial oral </text>`:
    // the marker starts 3px inside the italic fragment's box (its trailing space), so it was a line of its own.
    const { layout, blocks, footnotes } = fixture("litvinenko-v1-p22");
    const line = layout.lines(1, 22).find((l) => /assassinating\s+Berezovsky/.test(l.text))!;
    expect(line.raised.map((r) => r.text)).toEqual(["33"]);
    expect(layout.lines(1, 22).some((l) => l.text.trim() === "33" && l.top < 110)).toBe(false);
    const stats = linkLayoutMarkers(blocks, layout, { scope: "page", onPage: onPage(footnotes) });
    expect(stats.unplaced).toBe(0);
    const all = texts(blocks).join("\n");
    expect(all).toMatch(/assassinating Berezovsky["”]\[\^33\] and in her initial oral/);
    expect(all).toMatch(/unaccountable unit["”]\.\[\^35\]/);
    // the page's other markers still link, and nothing else gained one
    expect(all.match(/\[\^\d+\]/g)).toHaveLength(6);
  });

  it("Litvinenko p.18: the same, at the end of the quotation's last line (4ef1)", () => {
    // `<text left=162 width=486><i>incident resulted in Litvinenko and I becoming close friends." </i></text><text left=645>14 </text>`
    const { layout, blocks, footnotes } = fixture("litvinenko-v1-p18");
    expect(layout.lines(1, 18).some((l) => l.text.trim() === "14")).toBe(false);
    const stats = linkLayoutMarkers(blocks, layout, { scope: "page", onPage: onPage(footnotes) });
    // (note 13 closes the paragraph that opens on p.17: these blocks are the merged ones, as in Chilcot p.11)
    expect(stats.misses.map((m) => m.note)).toEqual([13]);
    expect(texts(blocks).join("\n")).toMatch(/becoming close friends\.["”]\[\^14\]/);
  });

  it("a contents page read as notes defines none; a footnoted page does", () => {
    expect(pageDefinesNotes(fixture("leveson-v1-p6").layout, 1, 6)).toBe(false);
    expect(pageDefinesNotes(fixture("leveson-v1-p111").layout, 1, 111)).toBe(true);
  });
});

/** A one- or two-page layout: body lines at 18pt, raised runs at 11pt, note lines at 14pt. */
const doc = (pages: Array<Array<{ text: string; raised?: Array<{ after: string; digits: string }>; note?: boolean }>>) => {
  const fonts = `<fontspec id="0" size="18" family="ABCDEF+Times" color="#000000"/>
<fontspec id="1" size="11" family="ABCDEF+Times" color="#000000"/>
<fontspec id="2" size="14" family="ABCDEF+Times" color="#000000"/>`;
  const body = pages
    .map((lines, p) => {
      let top = 100;
      const out: string[] = [];
      for (const l of lines) {
        top += 22;
        if (l.note) {
          out.push(`<text top="${top}" left="100" width="500" height="15" font="2">${l.text}</text>`);
          continue;
        }
        // split the line at each raised run; 9 units a character
        let rest = l.text;
        let left = 100;
        // `after` is the text just before the run, searched from the end of the previous run
        for (const r of l.raised ?? []) {
          const at = rest.indexOf(r.after + r.digits) + r.after.length;
          const head = rest.slice(0, at);
          if (head) out.push(`<text top="${top}" left="${left}" width="${head.length * 9}" height="16" font="0">${head}</text>`);
          left += head.length * 9;
          out.push(`<text top="${top - 4}" left="${left}" width="${r.digits.length * 6}" height="11" font="1">${r.digits}</text>`);
          left += r.digits.length * 6;
          rest = rest.slice(at + r.digits.length);
        }
        if (rest) out.push(`<text top="${top}" left="${left}" width="${rest.length * 9}" height="16" font="0">${rest}</text>`);
      }
      return `<page number="${p + 1}" position="absolute" top="0" left="0" height="1000" width="800">\n${p === 0 ? fonts : ""}\n${out.join("\n")}\n</page>`;
    })
    .join("\n");
  return buildLayout([parseLayoutXml(`<?xml version="1.0"?>\n<pdf2xml producer="poppler" version="26.08.0">\n${body}\n</pdf2xml>`)]);
};

const para = (text: string, pdfIndex = 1): Block => ({ kind: "paragraph", text, at: { volume: 1, pdfIndex, printed: pdfIndex } });

describe("linkLayoutMarkers: what it leaves alone", () => {
  it("a raised number with no note on its page, or out of sequence with the page's markers", () => {
    const layout = doc([
      [
        { text: "The first claim.151 An area of 40 km2 was cleared, and a second claim.152 Then a third.9", raised: [{ after: "claim.", digits: "151" }, { after: "km", digits: "2" }, { after: "second claim.", digits: "152" }, { after: "third.", digits: "9" }] },
        { text: "151 A note.", note: true },
        { text: "152 Another.", note: true },
      ],
    ]);
    const blocks = [para("The first claim.151 An area of 40 km2 was cleared, and a second claim.152 Then a third.9")];
    // note 2 exists on the page, but 2 between 151 and 152 is out of sequence; there is no note 9
    const stats = linkLayoutMarkers(blocks, layout, { scope: "page", onPage: () => new Set([2, 151, 152]) });
    expect((blocks[0] as { text: string }).text).toBe(
      "The first claim.[^151] An area of 40 km2 was cleared, and a second claim.[^152] Then a third.9"
    );
    expect(stats).toMatchObject({ raised: 4, candidates: 2, linked: 2 });
  });

  it("a note on the next page is cited only when that page's own markers do not cite it", () => {
    // page 1's notes 2 and 3 went unread; page 2's notes 2 and 3 belong to page 2's markers
    const layout = doc([
      [{ text: "Elsewhere in this Report.2 Grounds for concern.3", raised: [{ after: "Report.", digits: "2" }, { after: "concern.", digits: "3" }] }],
      [{ text: "He said so.2 And again.3 Then.4", raised: [{ after: "so.", digits: "2" }, { after: "again.", digits: "3" }, { after: "Then.", digits: "4" }] }],
    ]);
    const blocks = [para("Elsewhere in this Report.2 Grounds for concern.3", 1), para("He said so.2 And again.3 Then.4", 2)];
    const notes = new Map([[2, new Set([2, 3, 4])]]);
    linkLayoutMarkers(blocks, layout, { scope: "page", onPage: (_v, p) => notes.get(p) ?? new Set() });
    expect((blocks[0] as { text: string }).text).toBe("Elsewhere in this Report.2 Grounds for concern.3");
    expect((blocks[1] as { text: string }).text).toBe("He said so.[^2] And again.[^3] Then.[^4]");
  });

  it("two markers in a row: the second is found after the first is linked", () => {
    const layout = doc([[{ text: "On this basis.261262 we go on.", raised: [{ after: "basis.", digits: "261" }, { after: "", digits: "262" }] }]]);
    const blocks = [para("On this basis.261262 we go on.")];
    linkLayoutMarkers(blocks, layout, { scope: "page", onPage: () => new Set([261, 262]) });
    expect((blocks[0] as { text: string }).text).toBe("On this basis.[^261][^262] we go on.");
  });
});

describe("linkLayoutMarkers: raised lists", () => {
  it("'8 9 10' set as one raised fragment links all three (Leveson vol.1 p.91, reportsthatmatter-u00i)", () => {
    const layout = doc([[{ text: "shape culture and change perceptions:8 9 10", raised: [{ after: "perceptions:", digits: "8 9 10" }] }]]);
    const blocks = [para("shape culture and change perceptions:8 9 10")];
    linkLayoutMarkers(blocks, layout, { scope: "page", onPage: () => new Set([8, 9, 10]) });
    expect((blocks[0] as { text: string }).text).toBe("shape culture and change perceptions:[^8][^9][^10]");
  });
});

describe("foldForMatch", () => {
  it("folds quotes, dashes and ligatures, keeping each character's source index", () => {
    const f = foldForMatch("“ﬁne”—x");
    expect(f.text).toBe('"fine"-x');
    expect(f.from.slice(0, 4)).toEqual([0, 1, 1, 2]);
  });
});

describe("the layoutMarkers pass in the pipeline", () => {
  const def = (passes: ReturnType<typeof layoutMarkers>[]) =>
    resolvePasses(pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes }));

  it("is opt-in, page scope by default, and keeps the text linkers out unless asked", () => {
    expect(def([]).layoutMarkers).toBeUndefined();
    expect(def([layoutMarkers()]).layoutMarkers).toEqual({ scope: "page", textFallback: false });
    expect(def([layoutMarkers({ scope: "document", textFallback: true })]).layoutMarkers).toEqual({
      scope: "document",
      textFallback: true,
    });
  });

  it("links what is raised and nothing the text linker would have guessed", () => {
    const layout = doc([
      [
        { text: "The Inquiry heard evidence over many months from a great number of witnesses, and it set out what it heard at length here." },
        { text: "Of these, 2 people were arrested.1", raised: [{ after: "arrested.", digits: "1" }] },
        { text: "1 A note on the arrests.", note: true },
        { text: "2 A note cited on another page.", note: true },
      ],
    ]);
    const page = { index: 1, volume: 1, pdfIndex: 1, lines: ["The Inquiry heard evidence over many months from a great number of witnesses, and it set out what it heard at length here.", "Of these, 2 people were arrested.1", "", "1 A note on the arrests.", "2 A note cited on another page."] };
    const on = ingestPageGroups([[page]], { title: "T" }, def([layoutMarkers()]), [], { layout });
    expect(on.footnotes.map((n) => n.number)).toEqual([1, 2]);
    expect(on.markdown).toContain("Of these, 2 people were arrested.[^1]");
    expect(on.layoutMarkers).toMatchObject({ linked: 1 });
    // with the text linkers after it, ", 2 people" is read as note 2
    const fallback = ingestPageGroups([[page]], { title: "T" }, def([layoutMarkers({ textFallback: true })]), [], { layout });
    expect(fallback.markdown).toContain("Of these,[^2] people were arrested.[^1]");
  });
});
