import { describe, expect, it } from "vitest";
import { KNOWN_PAGE_PASS_NAMES, KNOWN_PAGE_PASSES, pipeline, resolvePasses } from "../src/define";
import * as lib from "../src/index";
import * as passModule from "../src/passes";
import { geometry, runningFurniture, printedPageNumber } from "../src/passes";

const base = {
  id: "x",
  title: "X",
  repo: "../x",
  volumes: [{ path: "archive/a.pdf" }],
};

describe("pipeline", () => {
  it("accepts a minimal definition", () => {
    expect(pipeline(base).id).toBe("x");
  });

  it("rejects a definition with no volumes", () => {
    expect(() => pipeline({ ...base, volumes: [] })).toThrow(/volume/i);
  });

  it("rejects a volume path that escapes the report repo", () => {
    expect(() =>
      pipeline({ ...base, volumes: [{ path: "../../etc/passwd" }] })
    ).toThrow(/escapes/i);
  });

  it("rejects two geometry passes, which would silently pick one", () => {
    expect(() =>
      pipeline({ ...base, passes: [geometry("document"), geometry("per-volume")] })
    ).toThrow(/geometry/i);
  });
});

describe("resolvePasses", () => {
  it("defaults to whole-document geometry and no volume passes", () => {
    const resolved = resolvePasses(pipeline(base));
    expect(resolved.geometry).toBe("document");
    expect(resolved.volumePasses).toEqual([]);
  });

  it("reads a multi-volume declaration", () => {
    // What Leveson declares. This replaced a `pageGroups.length > 1` test —
    // a property of the document inferred from the argument count.
    const resolved = resolvePasses(
      pipeline({ ...base, passes: [geometry("per-volume"), runningFurniture()] })
    );
    expect(resolved.geometry).toBe("per-volume");
    expect(resolved.volumePasses.map((p) => p.name)).toEqual(["runningFurniture"]);
  });

  it("ignores page-stage passes, which the page splitter runs itself", () => {
    const resolved = resolvePasses(pipeline({ ...base, passes: [printedPageNumber()] }));
    expect(resolved.volumePasses).toEqual([]);
  });
});

describe("body passes", () => {
  it("resolves a declared columns pass", async () => {
    const { columns } = await import("../src/passes");
    const resolved = resolvePasses(pipeline({ ...base, passes: [columns()] }));
    expect(resolved.bodyPasses.map((p) => p.name)).toEqual(["columns"]);
    // It is a body pass, so it must not be mistaken for a volume one.
    expect(resolved.volumePasses).toEqual([]);
  });

  it("declares nothing by default, so a report is never split by surprise", () => {
    expect(resolvePasses(pipeline(base)).bodyPasses).toEqual([]);
  });
});

describe("flushFootnoteMarkers", () => {
  it("is off unless a report declares it", async () => {
    // It is safe only where a note number identifies one note. Leveson
    // restarts numbering per chapter, so linking every fused "20" pointed 54
    // references at a single note.
    expect(resolvePasses(pipeline(base)).flushFootnoteMarkers).toBe(false);
  });

  it("is on when declared", async () => {
    const { flushFootnoteMarkers } = await import("../src/passes");
    const resolved = resolvePasses(
      pipeline({ ...base, passes: [flushFootnoteMarkers()] })
    );
    expect(resolved.flushFootnoteMarkers).toBe(true);
  });
});

describe("numberedParagraphs", () => {
  it("is off unless a report declares it", async () => {
    // A report that does not number its paragraphs "7.1", "10.14" still has
    // plenty of lines that coincidentally open with a decimal-shaped number
    // wrapped onto its own line, and reading those as paragraph breaks
    // would sever a sentence rather than a paragraph.
    expect(resolvePasses(pipeline(base)).numberedParagraphs).toBe(false);
  });

  it("is on when declared", async () => {
    const { numberedParagraphs } = await import("../src/passes");
    const resolved = resolvePasses(
      pipeline({ ...base, passes: [numberedParagraphs()] })
    );
    expect(resolved.numberedParagraphs).toBe(true);
  });
});

describe("quoteInset", () => {
  it("is undefined unless declared, so the default stands", async () => {
    expect(resolvePasses(pipeline(base)).quoteInset).toBeUndefined();
  });

  it("carries a report's own inset", async () => {
    // Litvinenko sets body text at 7 and quotations at 10. At the default of
    // five, every quotation in the report reads as ordinary prose; lowering
    // the default instead turned 442 Challenger paragraphs into quotations.
    const { quoteInset } = await import("../src/passes");
    expect(resolvePasses(pipeline({ ...base, passes: [quoteInset(3)] })).quoteInset).toBe(3);
  });
});

describe("allCapsHeadings", () => {
  it("is on unless a report opts out", () => {
    expect(resolvePasses(pipeline(base)).allCapsHeadings).toBe(true);
  });

  it("is off when a report declares allCapsHeadings(false)", async () => {
    // Saville quotes 1972 telegrams in capitals; its real structure comes
    // from Chapter divisions, which do not depend on this heuristic.
    const { allCapsHeadings } = await import("../src/passes");
    expect(
      resolvePasses(pipeline({ ...base, passes: [allCapsHeadings(false)] })).allCapsHeadings
    ).toBe(false);
  });
});

describe("paragraphNotes", () => {
  it("is off unless a report declares it", async () => {
    const { paragraphNotes } = await import("../src/passes");
    expect(resolvePasses(pipeline(base)).paragraphNotes).toBe(false);
    expect(resolvePasses(pipeline({ ...base, passes: [paragraphNotes()] })).paragraphNotes).toBe(true);
  });
});

/** Every page pass a module's exported factories build (factories that need arguments are skipped). */
const pagePassNames = (mod: Record<string, unknown>) =>
  Object.values(mod).flatMap((make) => {
    if (typeof make !== "function") return [];
    try {
      const p = (make as () => { name?: string; stage?: string })();
      return p && typeof p === "object" && p.stage === "page" && p.name ? [p.name] : [];
    } catch {
      return [];
    }
  });

/** The entries of a module's namespace that are the same function `src/passes.ts` exports (never calls an unrelated export). */
const fromPasses = (mod: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(mod).filter(([k, v]) => (passModule as Record<string, unknown>)[k] === v));

describe("KNOWN_PAGE_PASSES (one name per line, so parallel pass PRs merge: reportsthatmatter-wwmg)", () => {
  it("is sorted", () => {
    expect([...KNOWN_PAGE_PASS_NAMES]).toEqual([...KNOWN_PAGE_PASS_NAMES].sort());
  });

  it("has no duplicates", () => {
    expect(KNOWN_PAGE_PASS_NAMES.filter((n, i) => KNOWN_PAGE_PASS_NAMES.indexOf(n) !== i)).toEqual([]);
    expect(KNOWN_PAGE_PASSES.size).toBe(KNOWN_PAGE_PASS_NAMES.length);
  });

  it("names every page pass the public entry point exports", () => {
    const exported = pagePassNames(fromPasses(lib as Record<string, unknown>));
    expect(exported.length).toBeGreaterThan(20);
    expect(exported.filter((n) => !KNOWN_PAGE_PASSES.has(n))).toEqual([]);
  });

  it("exports from src/index.ts every page pass src/passes.ts builds", () => {
    const exported = new Set(pagePassNames(fromPasses(lib as Record<string, unknown>)));
    expect(pagePassNames(passModule as Record<string, unknown>).filter((n) => !exported.has(n))).toEqual([]);
  });
});
