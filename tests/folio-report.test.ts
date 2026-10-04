import { describe, expect, it } from "vitest";
import { folioReport, type FolioRow } from "../src/folios";

const row = (pdfIndex: number, printed: number | null, dropped = false, volume = 1): FolioRow => ({ volume, pdfIndex, printed, dropped });
const steady = (from: number, n: number, off: number) => Array.from({ length: n }, (_, i) => row(from + i, from + i + off));

describe("folioReport (reportsthatmatter-vwqr)", () => {
  it("summarises offset runs, a stray read and an unread page, by the foliosInStep rule", () => {
    const report = folioReport({ folios: [...steady(1, 4, -2), row(5, 2), ...steady(6, 4, -2), row(10, null), ...steady(11, 3, -2)] });
    // a run is the reads at one offset: the stray page and the unread page do not break it
    expect(report.runs.map((r) => [r.fromPdf, r.toPdf, r.offset, r.reads])).toEqual([[1, 13, -2, 11]]);
    expect(report.pages[4]).toMatchObject({ printed: null, stray: { printed: 2, dropped: false }, offset: -3 });
    expect(report).toMatchObject({ strays: 1, unread: 1 });
  });

  it("marks a read the pipeline already dropped, and reports a page numbered from its neighbours", () => {
    const report = folioReport({
      folios: [...steady(1, 4, 0), row(5, 77, true), ...steady(6, 4, 0)],
      blocks: [{ kind: "page", number: 5, at: { volume: 1, pdfIndex: 5 } }],
    });
    expect(report.pages[4]).toMatchObject({ printed: null, inferred: 5, stray: { printed: 77, dropped: true } });
    expect(report.inferred).toBe(1);
  });

  it("takes the source from the vision report, or html for an edition", () => {
    const folios = steady(1, 3, 0);
    const vision = { pages: [{ volume: 1, pdfIndex: 2, source: "vision" as const }] };
    expect(folioReport({ folios, vision }).pages.map((p) => p.source)).toEqual(["pipeline", "vision", "pipeline"]);
    expect(folioReport({ folios, edition: {} }).pages.every((p) => p.source === "html")).toBe(true);
  });

  it("keeps volumes apart: a restart of the numbering is a new run, not a stray", () => {
    const report = folioReport({ folios: [...steady(1, 4, 0), ...steady(1, 4, 10).map((r) => ({ ...r, volume: 2 }))] });
    expect(report.runs.map((r) => [r.volume, r.offset])).toEqual([[1, 0], [2, 10]]);
    expect(report.strays).toBe(0);
  });
});
