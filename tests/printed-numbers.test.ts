import { describe, expect, it } from "vitest";
import { markPrintedNumbers } from "../src/printed-numbers";
import { blocksToMarkdown, type Block } from "../src/paragraphs";
import { renderMarkdown } from "../src/markdown";

// reportsthatmatter-mv1t: printed paragraph numbers become paragraphs with ids; genuine lists stay lists.
const p = (text: string): Block => ({ kind: "paragraph", text });
const md = (blocks: Block[]) => blocksToMarkdown(markPrintedNumbers(blocks));
const html = (blocks: Block[]) => renderMarkdown(md(blocks));

const prose = (n: number) =>
  `${n}. The disclosed documents show that police officers on the inner concourse restricted access to the tunnel.`;

describe("markPrintedNumbers", () => {
  it("escapes a run of numbered prose paragraphs so each is a paragraph with an id (Hillsborough, Chilcot)", () => {
    const blocks = [p("Intro."), p(prose(1)), p(prose(2)), p(prose(3))];
    expect(md(blocks)).toContain("2\\. The disclosed documents");
    const out = html(blocks);
    expect(out).not.toContain("<ol");
    expect(out.match(/<p[^>]* id="/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("escapes numbers with a closing bracket too", () => {
    expect(md([p(prose(1).replace(". ", ") ")), p(prose(2).replace(". ", ") "))])).toContain("2\\) The disclosed");
  });

  it("tolerates continuation blocks and a missing number inside a run", () => {
    const blocks = [p(prose(1)), p("and so on to the end of the sentence."), p(prose(2)), p(prose(4))];
    expect(md(blocks)).toContain("4\\. The disclosed");
  });

  it("keeps short items a list (Leveson's outline, Saville's fragments)", () => {
    const blocks = [p("1. Setting up and preliminaries"), p("2. Visits"), p("3. Powers and remedies")];
    expect(md(blocks)).toBe("1. Setting up and preliminaries\n\n2. Visits\n\n3. Powers and remedies");
    const fragments = [
      p("1. fundamental changes in the system of local government elections, including the"),
      p("2. the passing of anti-discrimination legislation in Northern Ireland;"),
    ];
    expect(md(fragments)).not.toContain("\\.");
  });

  it("leaves a heading-like fragment inside a prose run alone (Leveson's terms of reference)", () => {
    const blocks = [p("2. Fairness and objectivity of Standards"), p(prose(3)), p(prose(4)), p(prose(5))];
    const out = md(blocks);
    expect(out).toContain("2. Fairness and objectivity of Standards");
    expect(out).toContain("3\\. The disclosed");
  });

  it("leaves a lone lower-case outline line a list unless it runs on from an unfinished paragraph", () => {
    expect(md([p("A heading-like paragraph."), p("2. role of the assessors")])).toBe(
      "A heading-like paragraph.\n\n2. role of the assessors"
    );
    expect(md([p("it was found in the"), p("2. role of the assessors")])).toContain("2\\. role");
  });

  it("keeps a run of date-and-event fragments a list (Columbia's timeline)", () => {
    const blocks = [p("5. January 18: Object reacquired and tracked by Cape"), p("6. January 19: Object tracked")];
    expect(md(blocks)).not.toContain("\\.");
  });

  it("joins a year split off its sentence at a page break (Lehman p.748, xqu)", () => {
    const blocks = [
      p("Lehman's publicly reported net leverage ratio for May 31, 2008 (second quarter"),
      p("2008) was 16.1x, 15.4x and 12.1x, respectively."),
    ];
    const out = markPrintedNumbers(blocks);
    expect(out).toHaveLength(1);
    expect(md(blocks)).toBe(
      "Lehman's publicly reported net leverage ratio for May 31, 2008 (second quarter 2008) was 16.1x, 15.4x and 12.1x, respectively."
    );
  });

  it("escapes a year-like start that cannot be joined", () => {
    const blocks = [p("A finished paragraph."), p("2008) was 16.1x, 15.4x and 12.1x, respectively.")];
    expect(md(blocks)).toContain("2008\\) was");
    expect(html(blocks)).not.toContain("<ol");
  });

  it("escapes a single long numbered prose paragraph but not a single short heading-like item", () => {
    expect(md([p(prose(1) + " " + prose(1).slice(3))])).toContain("1\\. The disclosed");
    expect(md([p("1. History")])).toBe("1. History");
  });

  it("leaves text without a printed number alone, and blocks untouched when nothing moves", () => {
    const blocks = [p("No numbers here."), { kind: "heading", level: 2, text: "Heading" } as Block];
    expect(markPrintedNumbers(blocks)).toBe(blocks);
  });
});
