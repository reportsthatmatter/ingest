import { describe, expect, it } from "vitest";
import { mergeAcrossPages, type Block } from "../src/paragraphs";
import { pipeline, resolvePasses } from "../src/define";
import { quoteListRunOns } from "../src/passes";

const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
const quote = (text: string, page: number): Block => ({ kind: "quote", text, at: at(page) });
const marker = (page: number): Block => ({ kind: "page", number: page, at: at(page) });
const list = (items: string[], page: number, quoted = false): Block => ({ kind: "list", items, quoted, at: at(page) });
const on = { quoteListRunOns: true };

describe("quoteListRunOns (reportsthatmatter-38s.9, cgr)", () => {
  it("joins a quotation over a page break (Philip Morris, TIRC memo)", () => {
    const merged = mergeAcrossPages(
      [
        quote("establishing a joint industry group consisting initially of the undersigned. This group will be", 3),
        marker(4),
        quote('known as TOBACCO INDUSTRY RESEARCH COMMITTEE ["TIRC"].', 4),
      ],
      on
    );
    expect(merged.map((b) => b.kind)).toEqual(["quote", "page"]);
    expect(merged[0]).toMatchObject({
      text: 'establishing a joint industry group consisting initially of the undersigned. This group will be known as TOBACCO INDUSTRY RESEARCH COMMITTEE ["TIRC"].',
    });
  });

  it("looks past every page marker and leaves them after the quotation", () => {
    const merged = mergeAcrossPages(
      [quote("the Vice President has cleared us to", 3), marker(4), marker(5), quote("intercept traffic and shoot them down.", 5)],
      on
    );
    expect(merged.map((b) => b.kind)).toEqual(["quote", "page", "page"]);
  });

  it("joins a comma or semicolon opening (Chilcot, Saville)", () => {
    const merged = mergeAcrossPages([quote("a threat to peace and, in", 1), marker(2), quote(", the longer term, to rebuild.", 2)], on);
    expect(merged).toHaveLength(2);
  });

  it("closes up a word the page break cut (PSI, 'pro-' / 'actively')", () => {
    const merged = mergeAcrossPages(
      [quote("the Credit Department will pro-", 1), marker(2), quote("actively review the Strategy.", 2)],
      on
    );
    expect(merged[0]).toMatchObject({ text: "the Credit Department will proactively review the Strategy." });
  });

  it("leaves a finished quotation alone, and a capital opening", () => {
    expect(mergeAcrossPages([quote("It was finished.", 1), marker(2), quote("and then more", 2)], on)).toHaveLength(3);
    expect(mergeAcrossPages([quote("It stopped mid", 1), marker(2), quote("Another quotation", 2)], on)).toHaveLength(3);
  });

  it("never joins into a line that opens on its own label (rule 2)", () => {
    const labelled = ["b. On 4 November the Committee met.", "(c) the report was filed", "iv. the last point"];
    for (const text of labelled) {
      expect(mergeAcrossPages([quote("The Committee agreed that", 1), marker(2), quote(text, 2)], on)).toHaveLength(3);
    }
    expect(
      mergeAcrossPages([list(["the first reason, and"], 1), marker(2), list(["(b) the second reason"], 2)], on)
    ).toHaveLength(3);
  });

  it("does nothing within a page, or unless declared", () => {
    expect(mergeAcrossPages([quote("stops mid", 1), quote("sentence here.", 1)], on)).toHaveLength(2);
    const blocks = [quote("stops mid", 1), marker(2), quote("sentence here.", 2)];
    expect(mergeAcrossPages(blocks)).toHaveLength(3);
    expect(mergeAcrossPages(blocks, { continuations: true })).toHaveLength(3);
  });

  it("joins a list item running over a page, keeping the rest of the list", () => {
    const merged = mergeAcrossPages(
      [
        list(["opening the border to", ], 1),
        marker(2),
        list(["traffickers without checks", "closing the gap"], 2),
      ],
      on
    );
    expect(merged.map((b) => b.kind)).toEqual(["list", "page"]);
    expect(merged[0]).toMatchObject({ items: ["opening the border to traffickers without checks", "closing the gap"] });
  });

  it("starts a new item after a finished item or '; and' (9/11, Chilcot)", () => {
    for (const last of ["agency center to target illegal entry and human traffickers;", "threat to peace and security; and", "tighter controls."]) {
      const merged = mergeAcrossPages(
        [list(["first", last], 1, true), marker(2), list(["to support the use of all means"], 2, true)],
        on
      );
      expect(merged).toHaveLength(3);
    }
  });

  it("does not join a quoted list to a plain one", () => {
    expect(mergeAcrossPages([list(["half an"], 1, true), marker(2), list(["item"], 2, false)], on)).toHaveLength(3);
  });

  it("is a declared pass", () => {
    const def = pipeline({ id: "x", title: "X", repo: ".", volumes: [{ path: "archive/x.pdf" }], passes: [quoteListRunOns()] } as never);
    expect(resolvePasses(def).quoteListRunOns).toBe(true);
  });
});

describe("a list item's run-over opening the next page inset (reportsthatmatter-2hn, 9/11 p.415)", () => {
  it("joins a lower-case quotation into the last item of the list above", () => {
    const merged = mergeAcrossPages(
      [
        list(["The CIA will be one among several claimants.", "Covert operations are tactical. The Director should rely on the relevant joint"], 3),
        marker(4),
        quote("mission center to oversee these details.", 4),
      ],
      on
    );
    expect(merged.map((b) => b.kind)).toEqual(["list", "page"]);
    expect(merged[0]).toMatchObject({
      items: ["The CIA will be one among several claimants.", "Covert operations are tactical. The Director should rely on the relevant joint mission center to oversee these details."],
    });
  });

  it("not after a finished item, a capital opening, or an item's own label", () => {
    const l = () => list(["It was finished."], 3);
    expect(mergeAcrossPages([l(), marker(4), quote("and then more", 4)], on)).toHaveLength(3);
    expect(mergeAcrossPages([list(["It stopped and"], 3), marker(4), quote("Then a new quotation.", 4)], on)).toHaveLength(3);
    expect(mergeAcrossPages([list(["It stopped and"], 3), marker(4), quote("b. an item", 4)], on)).toHaveLength(3);
  });

  it("not without the pass", () => {
    expect(mergeAcrossPages([list(["It stopped and"], 3), marker(4), quote("went on.", 4)])).toHaveLength(3);
  });
});
