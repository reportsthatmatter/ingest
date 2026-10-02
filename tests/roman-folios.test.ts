import { describe, expect, it } from "vitest";
import { takePrintedNumber } from "../src/clean";
import { renderMarkdown } from "../src/markdown";
import { pipeline, resolvePasses } from "../src/define";
import { romanFolios } from "../src/passes";

// Deep Water's front matter is folioed i-xiii: a lone numeral at the head of
// even pages and doubled ("vii   vii") on odd ones (reportsthatmatter-cbr).
describe("romanFolios (reportsthatmatter-cbr)", () => {
  it("the defect: a roman folio is left in the text and the page has no number", () => {
    const { printed, lines } = takePrintedNumber(["vii   vii", "From the outset, the Commissioners"]);
    expect(printed).toBeNull();
    expect(lines).toContain("vii   vii");
  });

  it("takes a head folio, a doubled folio and a foot folio off", () => {
    expect(takePrintedNumber(["viii", "We reach these conclusions"], { roman: true })).toEqual({
      printed: null,
      roman: "viii",
      lines: ["We reach these conclusions"],
    });
    expect(takePrintedNumber(["iii   iii", "Deep Water"], { roman: true }).roman).toBe("iii");
    expect(takePrintedNumber(["Text.", "", "xiii xiii xiii"], { roman: true })).toMatchObject({
      roman: "xiii",
      lines: ["Text.", ""],
    });
  });

  it("leaves arabic folios, words and non-numerals alone", () => {
    expect(takePrintedNumber(["12", "text"], { roman: true })).toMatchObject({ printed: 12 });
    expect(takePrintedNumber(["mix", "text"], { roman: true }).roman).toBeUndefined();
    expect(takePrintedNumber(["vv", "text"], { roman: true }).roman).toBeUndefined();
    expect(takePrintedNumber(["Fran Ulmer v", "text"], { roman: true }).roman).toBeUndefined();
  });

  it("renders a page anchor with a roman id", () => {
    const html = renderMarkdown("%%page vii%%\n\nFirst paragraph.\n\n%%page 1%%\n\nSecond.");
    expect(html).toContain('id="page-vii"');
    expect(html).toContain('data-page="vii"');
    expect(html).toContain('id="page-1"');
  });

  it("resolves from the declared pass", () => {
    const def = pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [romanFolios()] });
    expect(resolvePasses(def).romanFolios).toBe(true);
  });
});
