import { describe, expect, it } from "vitest";
import { pipeline, resolvePasses } from "../src/define";
import { ingestPageGroups } from "../src/pipeline";
import type { SourcePass } from "../src/passes";

// The Senate Intelligence Committee study (reportsthatmatter-gqsy.6) prints a classification banner
// under the folio-bearing foot of every page, and its redactions read as OCR garble. Both have to come
// off the raw lines before the page is split: a banner below the notes hides the folio and is read
// into the last note.
const page = (pdfIndex: number, lines: string[]) => ({ index: pdfIndex, volume: 1, pdfIndex, lines });
const banner = "            TOP SECRET//^ ^ ^//NOFORN";
const pages = [
  page(1, ["The first paragraph of the page runs on to its end.", "", "1", "   The note's text.", banner, "               12"]),
  page(2, ["The second page opens a new paragraph here.", "", banner, "               13"]),
];
const dropBanner: SourcePass = { name: "dropBanner", stage: "source", run: (lines) => lines.filter((l) => !l.includes("NOFORN")) };
const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

describe("source passes (reportsthatmatter-gqsy.6)", () => {
  it("the defect: a banner under the folio leaves the page unnumbered and runs into the note", () => {
    const out = ingestPageGroups([pages], { title: "T" }, resolvePasses(pipeline({ ...base, passes: [] })));
    expect(out.markdown).toContain("NOFORN");
  });

  it("runs on the raw lines before the page is split, in declared order", () => {
    const seen: number[] = [];
    const record: SourcePass = { name: "record", stage: "source", run: (lines, at) => (seen.push(at.pdfIndex), lines) };
    const resolved = resolvePasses(pipeline({ ...base, passes: [dropBanner, record] }));
    expect(resolved.sourcePasses?.map((p) => p.name)).toEqual(["dropBanner", "record"]);
    const out = ingestPageGroups([pages], { title: "T" }, resolved);
    expect(seen).toEqual([1, 2]);
    expect(out.markdown).not.toContain("NOFORN");
    expect(out.markdown).toContain("%%page 12%%");
    expect(out.markdown).toContain("%%page 13%%");
  });

  it("leaves a report that declares none byte-identical", () => {
    const none = ingestPageGroups([pages], { title: "T" }, resolvePasses(pipeline({ ...base, passes: [] })));
    const identity: SourcePass = { name: "identity", stage: "source", run: (l) => l };
    const same = ingestPageGroups([pages], { title: "T" }, resolvePasses(pipeline({ ...base, passes: [identity] })));
    expect(same.markdown).toBe(none.markdown);
  });
});
