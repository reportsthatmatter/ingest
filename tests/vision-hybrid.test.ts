import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseDoctags } from "../src/vision/doctags";
import { rejoinLineHyphens, verifyPage } from "../src/vision/verify";
import { headingLike, noteOpening, readPack, visionPage, visionStructure, type VisionOptions } from "../src/vision/hybrid";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { pageBreakContinuations } from "../src/passes";
import { cleanEdition } from "../src/edition";
import { tokens } from "../src/tokens";
import type { Block } from "../src/paragraphs";
import type { Page } from "../src/extract";

const dt = (body: string) => `<doctag>${body}</doctag>`;
const loc = "<loc_1><loc_2><loc_3><loc_4>";
const text = (t: string) => `<text>${loc}${t}</text>`;
const note = (t: string) => `<footnote>${loc}${t}</footnote>`;
const head = (t: string) => `<section_header_level_1>${loc}${t}</section_header_level_1>`;
const words = (s: string) => tokens(s).map((t) => t.word);
const OPTIONS: VisionOptions = { minAccepted: 0.8, strict: false, keepStarts: false, quotesFromPipeline: true };
const at = { volume: 1, pdfIndex: 7, printed: 5 };

const P1 = "The committee found that the joint design was flawed in several important respects and said so plainly";
const P2 = "Its recommendations follow in the order the hearings took them up over the summer months of that year";

/** One page through the hybrid, with the pipeline's reading given as one paragraph of the same lines. */
function page(doctags: string, body: string[], foot: string[] = [], pipeline?: Block[], extra: Partial<Parameters<typeof visionPage>[0]> = {}) {
  return visionPage({
    doctags,
    body,
    footLines: foot,
    pipeline: pipeline ?? [{ kind: "paragraph", text: body.join(" "), at }],
    pipelineNotes: [],
    at,
    vocab: new Set(),
    options: OPTIONS,
    ...extra,
  });
}

describe("visionPage", () => {
  it("takes the model's blocks and the layer's words, never the model's", () => {
    const r = page(dt(head("Findings") + text(P1.replace("flawed", "flowed")) + text(P2)), ["Findings", P1, P2]);
    expect(r.record.source).toBe("vision");
    expect(r.blocks!.map((b) => b.kind)).toEqual(["heading", "paragraph", "paragraph"]);
    expect((r.blocks![1] as { text: string }).text).toContain("flawed");
    expect((r.blocks![1] as { text: string }).text).not.toContain("flowed");
    // a heading the pipeline did not read is a subhead: no section moves
    expect((r.blocks![0] as { level: number }).level).toBe(4);
    expect(r.blocks!.every((b) => b.source === "vision" && b.at?.pdfIndex === 7)).toBe(true);
  });

  it("serves every layer word exactly once, including words the model dropped", () => {
    const more = [1, 2, 3, 4].map((n) => `${P2} and then paragraph ${n} carries on with its own words`);
    const lines = [P1, "and a line the model never read at all on this page", P2, ...more];
    const r = page(dt(text(P1) + text(P2) + more.map(text).join("")), lines);
    expect(r.record).toMatchObject({ source: "vision", blocks: 7, accepted: 6 });
    const served = r.blocks!.map((b) => (b as { text: string }).text).join(" ");
    expect(words(served)).toEqual(words(lines.join(" ")));
  });

  it("keeps the pipeline's blocks when too few of the model's are accepted", () => {
    const r = page(dt(text("an invented paragraph that the scan never printed in any form whatsoever") + text(P2)), [P1, P2]);
    expect(r.record.source).toBe("pipeline");
    expect(r.blocks).toBeUndefined();
    expect(r.record.reason).toMatch(/blocks accepted/);
  });

  it("keeps the pipeline's blocks rather than lose a section heading", () => {
    const pipeline: Block[] = [{ kind: "heading", level: 2, text: "EXTERNAL TANK", at }, { kind: "paragraph", text: `${P1} ${P2}`, at }];
    const r = page(dt(text(`EXTERNAL TANK ${P1}`) + text(P2)), ["EXTERNAL TANK", P1, P2], [], pipeline);
    expect(r.record.source).toBe("pipeline");
    expect(r.record.reason).toMatch(/section heading/);
    // the same heading read by the model keeps the pipeline's level
    const ok = page(dt(head("EXTERNAL TANK") + text(P1) + text(P2)), ["EXTERNAL TANK", P1, P2], [], pipeline);
    expect(ok.blocks![0]).toMatchObject({ kind: "heading", level: 2 });
  });

  it("keeps the pipeline's blocks where a correction would no longer find its text", () => {
    const r = page(dt(text(P1) + text(P2)), [P1, P2], [], undefined, { corrections: [`plainly ${P2.slice(0, 3)}`] });
    expect(r.record.source).toBe("pipeline");
    expect(r.record.reason).toMatch(/correction/);
  });

  it("moves page-foot notes out of the body, with markers where the layer shows them", () => {
    const body = [`${P1}.12`, `${P2} in 1985.`];
    const foot = ["12 Rogers Commission Report, Volume I, p. 40."];
    const r = page(dt(text(`${P1}.12`) + text(`${P2} in 1985.`) + note("12 Rogers Commission Report, Volume I, p. 40.")), body, foot);
    expect(r.notes).toEqual([{ label: "12", number: 12, text: "Rogers Commission Report, Volume I, p. 40." }]);
    expect((r.blocks![0] as { text: string }).text.endsWith("plainly.[^12]")).toBe(true);
  });

  it("never takes a number in the text for a marker, whatever the model says", () => {
    const line = "Damage was found in 13 of the 23 missions flown and on STS-3 as well";
    const r = page(dt(text(line) + text(P2) + note("23 Ibid.") + note("3 Ibid.")), [line, P2], ["23 Ibid.", "3 Ibid."]);
    expect((r.blocks![0] as { text: string }).text).toBe(line);
  });

  it("does not take a short line the model calls a heading for one when it reads as a lead-in", () => {
    expect(headingLike("Mr. Mulloy testified:")).toBe(false);
    expect(headingLike("(See appendix V-H.)")).toBe(false);
    expect(headingLike("2")).toBe(false);
    expect(headingLike("b. Pressures on Shuttle Operations")).toBe(true);
    expect(headingLike("Recommendations")).toBe(true);
  });
});

describe("noteOpening", () => {
  it("takes the model's label and strips the layer's digits only where they are that label", () => {
    expect(noteOpening("4 1 Ibid., Volume II, p. F-2.", "41")).toEqual({ label: "41", text: " Ibid., Volume II, p. F-2." });
    expect(noteOpening("12 Rogers", "12")).toEqual({ label: "12", text: " Rogers" });
    // a misread label is the layer's word: it stays
    expect(noteOpening("g Ibid.", "9")).toEqual({ label: "9", text: "g Ibid." });
  });
});

describe("the verifier, as the hybrid uses it", () => {
  it("rejoins a word broken at a line end with what is glued to it", () => {
    const out = rejoinLineHyphens([{ text: "understood the joint prior to the acci-" }, { text: "dent. Further, the joint" }], new Set(["accident"]));
    expect(out.map((l) => l.text)).toEqual(["understood the joint prior to the accident.", " Further, the joint"]);
  });

  it("does not stretch a block over the next block's first word for words the layer lacks", () => {
    const layer = `${P1} during the entire SRM\nThe letter requested an assessment of the possibility of lift-off`;
    const v = verifyPage(parseDoctags(dt(text(`${P1} during the entire SRM burn.27`) + text("The letter requested an assessment of the possibility of lift-off"))), layer);
    const lt = tokens(layer);
    expect(lt[v.blocks[1].span[0]].word).toBe("the");
    expect(layer.slice(lt[v.blocks[1].span[0]].start)).toMatch(/^The letter/);
  });
});

describe("visionStructure", () => {
  it("checks the pack's checksum and each page's recorded hash", () => {
    const dir = mkdtempSync(join(tmpdir(), "vision-"));
    const doctags = dt(text(P1));
    const line = JSON.stringify({ page: 3, meta: { doctags_sha256: createHash("sha256").update(doctags).digest("hex") }, doctags });
    const gz = gzipSync(line + "\n");
    writeFileSync(join(dir, "pack.jsonl.gz"), gz);
    const sha256 = createHash("sha256").update(gz).digest("hex");
    expect(visionStructure({ dir, pack: { path: "pack.jsonl.gz", sha256 } }).read().get(3)).toBe(doctags);
    expect(() => visionStructure({ dir, pack: { path: "pack.jsonl.gz", sha256: "0".repeat(64) } }).read()).toThrow(/checksum mismatch/);
    expect(() => readPack(JSON.stringify({ page: 3, meta: { doctags_sha256: "f".repeat(64) }, doctags }))).toThrow(/recorded hash/);
  });

  it("does not combine with cleanEdition", () => {
    const vision = visionStructure({ dir: ".", pack: { path: "x", sha256: "x" } });
    const edition = cleanEdition({ dir: ".", files: [], read: () => ({ blocks: [], notes: [] }) });
    expect(() => pipeline({ id: "x", title: "X", repo: ".", volumes: [{ path: "a.pdf" }], passes: [vision, edition] })).toThrow(/do not combine/);
  });
});

describe("ingestPageGroups with visionStructure", () => {
  // Three pages: the middle one has no vision output (the pipeline's), the others do. The first page's last
  // paragraph runs on over the break into the pipeline page, and the pipeline page's into the third.
  const pages: Page[] = [
    { index: 1, volume: 1, pdfIndex: 1, lines: ["Findings", "", P1, "", "The committee then turned to the matter of", "", "1"] },
    { index: 2, volume: 1, pdfIndex: 2, lines: ["the schedule, which it found had been allowed to", "", "2"] },
    { index: 3, volume: 1, pdfIndex: 3, lines: ["drive the decision to launch on that cold morning.", "", P2, "", "3"] },
  ];
  const doctags = new Map([
    [1, dt(head("Findings") + text(P1) + text("The committee then turned to the matter of"))],
    [3, dt(text("drive the decision to launch on that cold morning.") + text(P2))],
  ]);
  const pass = { ...visionStructure({ dir: ".", pack: { path: "x", sha256: "x" } }), read: () => doctags };
  const def = pipeline({ id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }], passes: [pageBreakContinuations(), pass] });

  it("mixes the sources page by page, keeps every page marker and joins across the boundaries", () => {
    const r = ingestPageGroups([pages], { title: "T" }, resolvePasses(def));
    expect(r.vision!.pages.map((p) => p.source)).toEqual(["vision", "pipeline", "vision"]);
    expect(r.markdown).toContain("#### Findings");
    expect(r.markdown.match(/%%page \d+%%/g)).toEqual(["%%page 1%%", "%%page 2%%", "%%page 3%%"]);
    // one paragraph from the vision page through the pipeline page into the next vision page
    expect(r.markdown).toContain("turned to the matter of the schedule, which it found had been allowed to drive the decision to launch");
    expect(r.vision!.boundaries).toMatchObject({ total: 2, joined: 2 });
    const sources = (r.blocks ?? []).filter((b) => b.kind !== "page").map((b) => b.source ?? "pipeline");
    expect(sources).toEqual(["vision", "vision", "vision", "vision"]);
  });

  it("changes nothing without the pass", () => {
    const plain = ingestPageGroups([pages], { title: "T" }, resolvePasses(pipeline({ ...def, passes: [pageBreakContinuations()] })));
    expect(plain.vision).toBeUndefined();
    expect(plain.markdown).not.toContain("####");
  });
});
