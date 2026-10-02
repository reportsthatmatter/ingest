import { describe, expect, it } from "vitest";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import {
  listedHeadings,
  unmarkedHeadings,
  recoverListedHeadings,
  numberedParagraphs,
  type Pass,
} from "../src/passes";

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };
const dots = ".".repeat(60);

// A contents in the shape of the Iraq Inquiry's: spaced leaders, a title that
// wraps (the leaders sit on its last line), and one whose leaders squeeze to
// a single dot (reportsthatmatter-ixe).
const contents = [
  "Contents",
  "",
  `Opening remarks ${dots} 3`,
  `The gap between the Permanent Members of the Security Council widens ${dots} 4`,
  `Negotiation of resolution 1441 ${dots} 5`,
  `The predicted increase in the threat to the UK as a result of military action in Iraq . 6`,
  "",
  `The UK's relationship with the US ${dots} 7`,
  "Development of UK strategy and options, January to April 2002 –",
  `\u201Caxis of evil\u201D to Crawford ${dots} 8`,
  `UK INFLUENCE ON POST‑INVASION STRATEGY: RESOLUTION 1483 ${dots} 9`,
];

const body = [
  "Opening remarks",
  "1. We begin here.",
  "",
  "2. The Inquiry notes the decision.”142",
  "",
  "The UK's relationship with the US",
  "3. The relationship was a determining factor.",
  "",
  "Development of UK strategy and options, January to April 2002 –",
  "“axis of evil” to Crawford",
  "4. The following findings are from Section 3.2:",
  "",
  "UK INFLUENCE ON POST‑INVASION STRATEGY: RESOLUTION 1483",
  "5. On 21 March the day after the invasion began.",
];
const pageTop = ["Negotiation of resolution 1441", "6. There were differences between the US and UK."];
const wrappedAtTop = [
  "The gap between the Permanent Members of the Security Council",
  "widens",
  "7. In their reports to the Security Council.",
];
const sentenceTail = ["Negotiation of resolution 1441.", "8. Not a heading."];

const pagesOf = (...bodies: string[][]) =>
  [contents, ...bodies].map((lines, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines }));

const run = (passes: Pass[], ...bodies: string[][]) =>
  ingestPageGroups([pagesOf(...bodies)], { title: "T" }, resolvePasses(pipeline({ ...base, passes }))).markdown;

const headings = (md: string) => md.split("\n").filter((l) => /^#{2,4} /.test(l) && l !== "## Notes");

const old = [numberedParagraphs(), listedHeadings(), unmarkedHeadings()];
const recovering = [...old, recoverListedHeadings()];

describe("recoverListedHeadings (reportsthatmatter-ixe)", () => {
  it("opens a heading at the top of a page, which unmarkedHeadings leaves in the text", () => {
    expect(run(old, pageTop)).toContain("Negotiation of resolution 1441 6. There");
    const md = run(recovering, pageTop);
    expect(headings(md)).toContain("### Negotiation of resolution 1441");
    expect(md).toMatch(/^6\. There were differences/m);
  });

  it("still refuses a page-opening line that is the tail of a sentence", () => {
    const md = run(recovering, sentenceTail);
    expect(headings(md)).not.toContain("### Negotiation of resolution 1441");
    expect(headings(md)).not.toContain("### Negotiation of resolution 1441.");
  });

  it("reads a heading after a line that ends on a footnote marker, and a caps title ending in a number", () => {
    const md = run(recovering, body);
    expect(headings(md)).toContain("### The UK's relationship with the US");
    expect(headings(md)).toContain("## UK INFLUENCE ON POST‑INVASION STRATEGY: RESOLUTION 1483");
    expect(run(old, body)).not.toContain("### The UK's relationship with the US");
  });

  it("joins a title the body sets over two lines, mid-page and at the top of a page", () => {
    const md = run(recovering, body, wrappedAtTop);
    expect(headings(md)).toContain(
      '### Development of UK strategy and options, January to April 2002 – "axis of evil" to Crawford'
    );
    expect(headings(md)).toContain("### The gap between the Permanent Members of the Security Council widens");
  });

  it("reads a contents entry with a single-dot leader as its own entry, not part of the next", () => {
    const md = run(recovering, body);
    expect(md).toContain("The predicted increase in the threat to the UK as a result of military action in Iraq — 6");
    expect(md).toContain("The UK's relationship with the US — 7");
    expect(md).not.toContain("[^6]");
  });

  it("changes nothing without it", () => {
    expect(run([numberedParagraphs(), recoverListedHeadings()], body)).toBe(run([numberedParagraphs()], body));
  });
});
