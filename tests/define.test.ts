import { describe, expect, it } from "vitest";
import { pipeline, resolvePasses } from "../src/define";
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
