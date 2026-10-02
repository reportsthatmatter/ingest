import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { hangingIndents, letteredItems, numberedParagraphs, quoteInset, type Pass } from "../src/passes";

// The Litvinenko Inquiry (reportsthatmatter-56s): lettered sub-items whose
// wrapped lines sit at the quotation inset, and numbered paragraphs whose text
// hangs one tab-stop in from their number.
const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures/pages", `${name}.txt`), "utf8").split("\n");

const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };
const run = (names: string[], passes: Pass[]) =>
  ingestPageGroups(
    [names.map((name, i) => ({ index: i + 1, volume: 1, pdfIndex: i + 1, lines: fixture(name) }))],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  ).markdown;

const declared = [quoteInset(3), numberedParagraphs()];
const pages = ["litvinenko-lettered-items", "litvinenko-lettered-items-next"];

describe("letteredItems", () => {
  it("reads each lettered item and its wrapped lines as one paragraph", () => {
    const md = run(pages, [...declared, letteredItems()]);
    expect(md).not.toMatch(/^> /m);
    expect(md).toMatch(/^a\. Mr Litvinenko had been suffering from abdominal pain, profuse diarrhoea and vomiting for two days/m);
    expect(md).toMatch(/^b\. On 4 November Mr Litvinenko was started on a course of Ciprofloxacin/m);
    // b. ends without a full stop and c. opens in lower case on the next page:
    // neither is the rest of a sentence.
    expect(md).toMatch(/^c\. On or around 9 November/m);
    expect(md).not.toMatch(/concern\S* c\. On or around/);
  });

  it("leaves an item inside a quotation alone", () => {
    const quoted = ["  3.1    The Act provides:", "", "                 a.   the first thing that the", "                      Chairman may do, and", "                 b.   the second thing."];
    const md = ingestPageGroups(
      [[{ index: 1, volume: 1, pdfIndex: 1, lines: ["      body line one of the paragraph that is here", "      body line two of the paragraph that is here", ...quoted] }]],
      { title: "T" },
      resolvePasses(pipeline({ ...base, passes: [...declared, letteredItems()] }))
    ).markdown;
    expect(md).toMatch(/^> .*a\. the first thing/m);
  });
});

describe("hangingIndents on numbered paragraphs", () => {
  it("keeps a paragraph whose text hangs from its number out of the quotations", () => {
    const md = run(["litvinenko-hanging-paragraphs"], [...declared, hangingIndents()]);
    expect(md).not.toMatch(/^> /m);
    expect(md).toMatch(/^4\.57 Ever since Mr Litvinenko died, there has been speculation that he may have worked for the UK intelligence agencies/m);
  });
});
