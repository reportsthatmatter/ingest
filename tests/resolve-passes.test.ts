import { describe, expect, it } from "vitest";
import * as passes from "../src/passes";
import { KNOWN_PAGE_PASSES, pipeline, resolvePasses } from "../src/define";

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };

describe("resolvePasses names", () => {
  it("throws on a page pass the library does not implement, naming it", () => {
    const def = pipeline({ ...base, passes: [{ name: "notAPassYet", stage: "page" }] });
    expect(() => resolvePasses(def)).toThrow(/t: pass "notAPassYet" is not implemented/);
  });

  it("names every unknown pass at once", () => {
    const def = pipeline({ ...base, passes: [{ name: "a", stage: "page" }, { name: "b", stage: "page" }] });
    expect(() => resolvePasses(def)).toThrow(/"a", "b" is not implemented.*they would/);
  });

  it("leaves custom body and volume passes alone: they run by stage, not by name", () => {
    const def = pipeline({ ...base, passes: [{ name: "mine", stage: "body", run: (l: string[]) => l }] });
    expect(() => resolvePasses(def)).not.toThrow();
  });

  it("knows every page pass the library exports, so a new one cannot be forgotten", () => {
    const built = (Object.values(passes) as unknown[])
      .filter((v) => typeof v === "function")
      .flatMap((make) => {
        try {
          const p = (make as () => { name: string; stage: string })();
          return p && typeof p === "object" && "stage" in p ? [p] : [];
        } catch {
          return [];
        }
      })
      .filter((p) => p.stage === "page");
    expect(built.length).toBeGreaterThan(20);
    for (const p of built) expect(KNOWN_PAGE_PASSES.has(p.name), p.name).toBe(true);
  });
});
