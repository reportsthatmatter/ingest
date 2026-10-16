import { describe, expect, it } from "vitest";
import { structuralChecks } from "../src/fidelity";

const check = (markdown: string) =>
  structuralChecks(markdown).find((c) => c.name === "no control characters");

describe("no control characters (reportsthatmatter-5p44)", () => {
  it("passes clean text", () => {
    expect(check("# H\n\nPlain text.\n")).toMatchObject({ ok: true, detail: "none" });
  });

  it("fails a BEL, with the count and where it is", () => {
    expect(check("# H\n\n3 \x07June 2010\n")).toMatchObject({
      ok: false,
      detail: "1 found; first U+0007 at line 3",
    });
  });

  it("counts every occurrence and names the first", () => {
    expect(check("a\x01b\n\x07\x07\n")?.detail).toBe("3 found; first U+0001 at line 1");
  });

  it("flags DEL, vertical tab and CR (full.md is LF-only)", () => {
    for (const c of ["\x7f", "\x0b", "\r"]) expect(check(`a${c}b\n`)?.ok).toBe(false);
  });

  it("allows tab and LF, and leaves form feeds to their own check", () => {
    expect(check("a\tb\nc\n")?.ok).toBe(true);
    expect(check("a\fb\n")?.ok).toBe(true);
    expect(structuralChecks("a\fb\n").find((c) => c.name === "no form feeds")?.ok).toBe(false);
  });
});
