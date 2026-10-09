import { describe, expect, it } from "vitest";
import { exemptionCodes, redactLine, redactPage } from "../src/redactions";
import { losslessCheck } from "../src/fidelity";
import { pipeline, resolvePasses } from "../src/define";
import { foiaRedactions } from "../src/passes";

// The Mueller report as the Department of Justice released it under FOIA (reportsthatmatter-gqsy.5).
// Lines are pdftotext -layout's, from Volume I PDF pp. 20, 25, 50 and Volume II p. 51.
describe("foiaRedactions (reportsthatmatter-gqsy.5)", () => {
  it("marks a box label as a redaction and keeps its codes", () => {
    expect(redactLine("of Michael Cohen, Richard Gates, (b) (6), (b) (7)(C)            Roger Stone, and (b) (6), (b) (7)(C)")).toBe(
      "of Michael Cohen, Richard Gates, [Redacted: (b) (6), (b) (7)(C)]            Roger Stone, and [Redacted: (b) (6), (b) (7)(C)]"
    );
    expect(redactLine("federal criminal law, (b) (3)                                             , and resulted in Flynn’s (b)(3)-1")).toBe(
      "federal criminal law, [Redacted: (b) (3)]                                             , and resulted in Flynn’s"
    );
  });

  it("takes a margin label out, alone or welded onto a body line", () => {
    expect(redactLine("full and thorough investigation of the Russian government’s efforts to interfere in the 2016 (b)(6)/")).toBe(
      "full and thorough investigation of the Russian government’s efforts to interfere in the 2016"
    );
    expect(redactLine("                                                                (b)(7)(C)-2")).toBeNull();
    expect(redactLine("4/ 10/ 14 Email , (b) (7)(A), (b) (7)(E), (b) (3)         (attachment).     (b)(3)-2 , (b)(?)(E)-l")).toBe(
      "4/ 10/ 14 Email , [Redacted: (b) (7)(A), (b) (7)(E), (b) (3)]         (attachment)."
    );
    expect(redactLine("(b) (7}(A}, (b} (7}(E}                                                (7)(C)-4")).toBe("[Redacted: (b) (7)(A), (b) (7)(E)]");
  });

  it("reads a scanned page's OCR braces", () => {
    expect(exemptionCodes("(b} (7}(A}, (b} (7}(E}")).toEqual(["(b) (7)(A)", "(b) (7)(E)"]);
    expect(redactLine("■ (b} (7}(A}, (b} (7}(E}")).toBe("■ [Redacted: (b) (7)(A), (b) (7)(E)]");
  });

  it("never touches a statute's subsection", () => {
    for (const line of [
      "See 18 U.S.C. §§ 1503, 1505, 1512(b)(3), 1512(c)(2). Section 1512(c)(2) is an omnibus",
      "in an official proceeding”); 1512(b)(2)(B) (use of intimidation, threats, corrupt persuasion, or",
      "§ 1028(a)(7) and (b)(1)(D). Plea Agreement, United States v. Richard Pinedo, No. 1:18-cr-24",
      "that arose . . . directly from the investigation,” Appointment Order ¶ (b)(ii), covers similar crimes",
      "(b) The President’s February 14, 2017 meeting with Comey in which the President reportedly",
    ])
      expect(redactLine(line)).toBe(line);
  });

  it("drops only lines that held nothing but margin labels; blank lines stay", () => {
    expect(redactPage(["first line of a paragraph", "(b)(7)(E)-2", "second line", "", "next"])).toEqual([
      "first line of a paragraph",
      "second line",
      "",
      "next",
    ]);
  });

  it("does not leave a link's shape", () => {
    expect(redactLine("Email, (b) (3)(attachment)")).toBe("Email, [Redacted: (b) (3)] (attachment)");
  });

  it("the marker's word is not counted as invented by the fidelity check", () => {
    const source = "of Michael Cohen, Richard Gates, (b) (6), (b) (7)(C) Roger Stone";
    const markdown = "of Michael Cohen, Richard Gates, [Redacted: (b) (6), (b) (7)(C)] Roger Stone";
    expect(losslessCheck(source, markdown).detail).toMatch(/all accounted for/);
  });

  it("resolves from the declared passes", () => {
    const def = pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [foiaRedactions()] });
    expect(resolvePasses(def)).toMatchObject({ foiaRedactions: true });
  });
});
