import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLayout, indentVersus, layoutXml, openLayout, parseLayoutXml } from "../src/layout";
import { ingestPageGroups } from "../src/pipeline";
import { resolvePasses } from "../src/define";
import type { PipelineContext } from "../src/context";

/** A `pdftohtml -xml` document: fontspecs are global (page 2 reuses ids declared on page 1). */
const xml = (pages: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<pdf2xml producer="poppler" version="26.08.0">\n${pages.join("\n")}\n</pdf2xml>`;
const text = (top: number, left: number, width: number, height: number, font: number, body: string) =>
  `<text top="${top}" left="${left}" width="${width}" height="${height}" font="${font}">${body}</text>`;

const FONTS = `<fontspec id="0" size="18" family="ABCDEF+Times" color="#000000"/>
<fontspec id="1" size="11" family="GHIJKL+Times" color="#000000"/>
<fontspec id="2" size="30" family="MNOPQR+Times-Bold" color="#780030"/>`;

describe("parseLayoutXml", () => {
  const raw = parseLayoutXml(
    xml([
      `<page number="1" position="absolute" top="0" left="0" height="1000" width="800">\n${FONTS}\n` +
        [
          text(100, 100, 600, 16, 0, "Body text that carries a marker at the end of the line"),
          // a raised digit 5 above the baseline, touching the line's end
          text(95, 700, 8, 11, 1, "12"),
          // a paragraph label standing off from its text by an indent's width
          text(140, 60, 25, 16, 0, "2.4 "),
          text(140, 140, 500, 16, 0, "The paragraph that follows the label"),
          // one fragment per word, no space between
          text(180, 100, 50, 16, 0, "words"),
          text(180, 160, 40, 16, 0, "apart"),
        ].join("\n") +
        `\n</page>`,
      `<page number="2" position="absolute" top="0" left="0" height="1000" width="800">\n` +
        [text(50, 100, 300, 36, 2, "<b>A Heading</b>")].join("\n") +
        `\n</page>`,
    ])
  );

  it("reuses font ids declared on an earlier page and drops subset prefixes", () => {
    const heading = raw.find((l) => l.text === "A Heading")!;
    expect(heading.page).toBe(2);
    expect(heading.family).toBe("Times-Bold");
    expect(heading.size).toBe(30);
    expect(heading.color).toBe("#780030");
    expect(heading.bold).toBe(true);
    expect(heading.font).toBe("Times-Bold|30|#780030|b");
  });

  it("records a touching raised digit run, not as text of its own line", () => {
    const line = raw.find((l) => l.text.startsWith("Body text"))!;
    expect(line.raised).toEqual([{ text: "12", size: 11, left: 700 }]);
    expect(raw.filter((l) => l.page === 1)).toHaveLength(3);
  });

  it("joins a paragraph label to its text across the indent", () => {
    const line = raw.find((l) => l.text.startsWith("2.4"))!;
    expect(line.text).toBe("2.4 The paragraph that follows the label");
    expect(line.left).toBe(60);
  });

  it("puts a space between fragments that are words apart", () => {
    expect(raw.some((l) => l.text === "words apart")).toBe(true);
  });
});

describe("buildLayout", () => {
  const body = (top: number, left: number, right: number, t: string, font = 0) =>
    text(top, left, right - left, 16, font, t);
  const long = "x".repeat(60);
  const page1 = [
    // a footnote-heavy page: the document's font still sets it
    ...[100, 121, 142, 163].map((t) => body(t, 100, 700, long)),
    body(184, 100, 400, "last line of the paragraph"),
    body(226, 140, 700, long), // first line indented 2.2 ems
    body(247, 100, 700, long),
    body(268, 100, 700, long),
    body(290, 100, 700, long),
    body(311, 100, 700, long),
  ];
  const footnotes = Array.from({ length: 40 }, (_, i) => body(700 + i * 5, 100, 700, long, 1));
  const layout = buildLayout([
    parseLayoutXml(
      xml([`<page number="1" position="absolute" top="0" left="0" height="1000" width="800">\n${FONTS}\n${[...page1, ...footnotes].join("\n")}\n</page>`])
    ),
  ]);

  it("takes the body font from the pages, not from the footnotes that outweigh them", () => {
    expect(layout.bodyFont.family).toBe("Times");
    expect(layout.bodyFont.size).toBe(18);
  });

  it("gives each line an em-normalised indent against the page margin and a right-margin flag", () => {
    const lines = layout.lines(1, 1);
    const indented = lines.find((l) => l.left === 140)!;
    expect(indented.indentEm).toBeCloseTo(2.22, 1); // 40 units past the page margin, over an 18pt line
    const flush = lines.find((l) => l.left === 100 && l.right === 700)!;
    expect(flush.indentEm).toBe(0);
    expect(flush.reachesRight).toBe(true);
    const last = lines.find((l) => l.text.startsWith("last line"))!;
    expect(last.reachesRight).toBe(false);
    expect(last.rightGapEm).toBeGreaterThan(10);
  });

  it("measures a first line against the line under it", () => {
    const lines = layout.lines(1, 1);
    const indented = lines.find((l) => l.left === 140)!;
    const next = lines[lines.indexOf(indented) + 1];
    expect(indentVersus(indented, next)).toBeCloseTo(2.22, 1);
    expect(indentVersus(next, indented)).toBeCloseTo(-2.22 * (18 / 18), 1);
  });

  it("reports the line pitch and volumes", () => {
    expect(layout.page(1, 1)!.pitch).toBe(21);
    expect(layout.volumes).toBe(1);
    expect(layout.pages(1)).toEqual([1]);
    expect(layout.lines(1, 99)).toEqual([]);
  });

  it("flags lines that open on a label", () => {
    const labelled = buildLayout([
      parseLayoutXml(
        xml([
          `<page number="1" position="absolute" top="0" left="0" height="1000" width="800">\n${FONTS}\n` +
            [body(100, 100, 700, "57. A numbered paragraph"), body(121, 100, 700, "continues here"), body(142, 100, 700, "(b) an item")].join("\n") +
            `\n</page>`,
        ])
      ),
    ]).lines(1, 1);
    expect(labelled.map((l) => l.label)).toEqual([true, false, true]);
  });
});

const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 72 700 Td (Hello layout) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;

const havePoppler = spawnSync("pdftohtml", ["-v"]).error === undefined;

describe.skipIf(!havePoppler)("the per-PDF cache", () => {
  it("is keyed by the PDF's SHA-256, ignored by git inside itself, and not rebuilt when warm", () => {
    const dir = mkdtempSync(join(tmpdir(), "rtm-layout-"));
    const pdf = join(dir, "a.pdf");
    writeFileSync(pdf, PDF);
    const sha = createHash("sha256").update(readFileSync(pdf)).digest("hex");
    const cache = join(dir, ".cache");

    const first = layoutXml(pdf, cache);
    expect(first).toContain("Hello layout");
    const file = join(cache, `layout-${sha}.xml`);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(join(cache, ".gitignore"), "utf8")).toBe("*\n");

    const written = statSync(file).mtimeMs;
    expect(layoutXml(pdf, cache)).toBe(first);
    expect(statSync(file).mtimeMs).toBe(written);

    const layout = openLayout([pdf], cache);
    expect(layout.checksums).toEqual([sha]);
    expect(layout.lines(1, 1)[0].text).toBe("Hello layout");
  });

  it("numbers volumes in the order given", () => {
    const dir = mkdtempSync(join(tmpdir(), "rtm-layout-"));
    const a = join(dir, "a.pdf");
    const b = join(dir, "b.pdf");
    writeFileSync(a, PDF);
    writeFileSync(b, PDF.replace("Hello layout", "Second volume"));
    const layout = openLayout([a, b], join(dir, ".cache"));
    expect(layout.volumes).toBe(2);
    expect(layout.lines(1, 1)[0].text).toBe("Hello layout");
    expect(layout.lines(2, 1)[0].text).toBe("Second volume");
  });
});

describe("the pipeline context", () => {
  const pages = [{ index: 1, volume: 1, pdfIndex: 1, lines: ["   A paragraph of text that goes on and on."] }];
  const resolved = resolvePasses({ id: "x", title: "x", repo: "x", volumes: [{ path: "a.pdf" }] });

  it("reaches body and volume passes with the page's provenance, and changes no output", () => {
    const seen: Array<{ context?: PipelineContext; at?: unknown }> = [];
    const layout = buildLayout([[]]);
    const withPasses = {
      ...resolved,
      bodyPasses: [{ name: "spy", stage: "body" as const, run: (lines: string[], context?: PipelineContext, at?: unknown) => (seen.push({ context, at }), lines) }],
      volumePasses: [{ name: "spyv", stage: "volume" as const, run: (p: any, context?: PipelineContext) => (seen.push({ context }), p) }],
    };
    const meta = { title: "t" };
    const without = ingestPageGroups([pages], meta, withPasses);
    seen.length = 0;
    const withContext = ingestPageGroups([pages], meta, withPasses, [], { layout });
    expect(withContext.markdown).toBe(without.markdown);
    expect(seen).toHaveLength(2);
    expect(seen[0].context?.layout).toBe(layout);
    expect(seen[0].at).toEqual({ volume: 1, pdfIndex: 1, printed: null });
    expect(seen[1].context?.layout).toBe(layout);
  });

  it("exposes the final blocks", () => {
    const result = ingestPageGroups([pages], { title: "t" });
    expect(result.blocks?.some((b) => b.kind === "paragraph" && b.at?.pdfIndex === 1)).toBe(true);
  });
});
