import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLayout, parseLayoutXml } from "../src/layout";
import { decidePageBreak, findPageBreakLines, layoutJoins, pageBreakKey, type PageBreakCase } from "../src/pagebreaks";
import { mergeAcrossPages, type Block } from "../src/paragraphs";
import { pipeline, resolvePasses } from "../src/define";
import { layoutPageJoins } from "../src/passes";
import {
  describeCase,
  isCachedReferee,
  pageBreakCache,
  parseRefereeAnswers,
  readPageBreakCache,
  recordingTransport,
  refereeCost,
  refereeEntry,
  refereePageBreaks,
  refereeRequests,
  replayTransport,
  requestHash,
  writePageBreakCache,
  REFEREE_PROMPT_ID,
  type RefereeTransport,
} from "../src/referee";
import { REFEREE_EXAMPLES } from "../src/referee-examples";

const dir = new URL("./fixtures/pagebreaks/", import.meta.url);
const fixture = (name: string) => {
  const f = JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) as {
    at: { volume: number; pdfIndex: number };
    prev: string;
    next: string;
  };
  const layout = buildLayout([parseLayoutXml(readFileSync(new URL(`${name}.xml`, dir), "utf8"))]);
  return { ...f, layout };
};
const caseOf = (name: string): PageBreakCase => {
  const f = fixture(name);
  const lines = findPageBreakLines(f.layout, f.prev, f.next, f.at)!;
  return { key: pageBreakKey(lines.prev.text, lines.next.text), prevText: f.prev, nextText: f.next, lines, decision: decidePageBreak(lines, f.prev, f.next) };
};
const tmp = () => mkdtempSync(join(tmpdir(), "rtm-referee-"));

describe("the committed cache (38s.11)", () => {
  it("a missing file is an empty cache: the rules stand, and the case is recorded as asked", () => {
    const referee = pageBreakCache(join(tmp(), "referee/pagebreaks.json"));
    expect(isCachedReferee(referee)).toBe(true);
    const f = fixture("911-p58"); // R2: ambiguous, the rules join
    expect(layoutJoins(f.layout, f.prev, f.next, f.at, { referee })).toBe(true);
    expect([...referee.asked.values()].map((c) => c.decision.rule)).toEqual(["R2"]);
  });

  it("an entry overrules the rules; writing and reading round-trips, keys sorted", () => {
    const path = join(tmp(), "referee/pagebreaks.json");
    const c = caseOf("911-p58");
    writePageBreakCache(path, new Map([
      ["ffff000000000000", { ...refereeEntry(c, true, "human"), page: 1 }],
      [c.key, refereeEntry(c, false, "claude-haiku-4-5")],
    ]));
    const text = readFileSync(path, "utf8");
    expect(text.indexOf(c.key)).toBeLessThan(text.indexOf("ffff000000000000"));
    expect(readPageBreakCache(path).get(c.key)).toMatchObject({ join: false, by: "claude-haiku-4-5", rules: "join", page: 58, prompt: REFEREE_PROMPT_ID });
    const referee = pageBreakCache(path);
    const f = fixture("911-p58");
    expect(layoutJoins(f.layout, f.prev, f.next, f.at, { referee })).toBe(false);
  });

  it("is never asked about a clear call, so a cache cannot move one", () => {
    const path = join(tmp(), "p.json");
    const c = caseOf("saville-p122"); // a label: split, not ambiguous
    writePageBreakCache(path, new Map([[c.key, refereeEntry(c, true, "human")]]));
    const referee = pageBreakCache(path);
    const f = fixture("saville-p122");
    expect(layoutJoins(f.layout, f.prev, f.next, f.at, { referee })).toBe(false);
    expect(referee.asked.size).toBe(0);
  });

  it("asks about medium-confidence calls only with refer: medium (Deepwater p.20: a finished sentence, a flush first line)", () => {
    const f = fixture("deepwater-p20");
    expect(caseOf("deepwater-p20").decision).toMatchObject({ join: false, confidence: "medium", ambiguous: false });
    const low = pageBreakCache(join(tmp(), "a.json"));
    layoutJoins(f.layout, f.prev, f.next, f.at, { referee: low });
    expect(low.asked.size).toBe(0);
    const medium = pageBreakCache(join(tmp(), "b.json"));
    expect(layoutJoins(f.layout, f.prev, f.next, f.at, { referee: medium, refer: "medium" })).toBe(false);
    expect(medium.asked.size).toBe(1);
    const def = pipeline({ id: "x", title: "X", repo: ".", volumes: [{ path: "a.pdf" }], passes: [layoutPageJoins({ referee: medium, refer: "medium" })] });
    expect(resolvePasses(def).layoutPageJoins).toEqual({ referee: medium, refer: "medium" });
  });

  it("rates the clear calls high and the threshold calls low", () => {
    expect(caseOf("pm-p1050").decision.confidence).toBe("high"); // R1, flush, the line under continues
    expect(caseOf("911-p58").decision.confidence).toBe("low"); // R2
    expect(caseOf("911-p22").decision.confidence).toBe("high"); // finished, indented
    expect(caseOf("saville-p122").decision.confidence).toBe("high"); // "7.44"
  });

  it("rejects a file that is not a cache", () => {
    const path = join(tmp(), "bad.json");
    writeFileSync(path, "{}");
    expect(() => pageBreakCache(path)).toThrow(/not a page-break referee cache/);
  });

  it("is declared like any referee and carried through the pass, and merges blocks deterministically", () => {
    const path = join(tmp(), "p.json");
    const c = caseOf("911-p58");
    writePageBreakCache(path, new Map([[c.key, refereeEntry(c, false, "claude-haiku-4-5")]]));
    const referee = pageBreakCache(new URL(`file://${path}`));
    const def = pipeline({ id: "x", title: "X", repo: ".", volumes: [{ path: "a.pdf" }], passes: [layoutPageJoins({ referee })] });
    const options = resolvePasses(def).layoutPageJoins!;
    expect(options.referee).toBe(referee);
    const f = fixture("911-p58");
    const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
    const blocks = (): Block[] => [
      { kind: "paragraph", text: f.prev, at: at(f.at.pdfIndex - 1) },
      { kind: "page", number: f.at.pdfIndex, at: at(f.at.pdfIndex) },
      { kind: "paragraph", text: f.next, at: at(f.at.pdfIndex) },
    ];
    expect(mergeAcrossPages(blocks(), { layout: f.layout, layoutJoins: {} })).toHaveLength(2); // rules: R2 joins
    expect(mergeAcrossPages(blocks(), { layout: f.layout, layoutJoins: options })).toHaveLength(3); // the referee splits
  });
});

describe("the prompt", () => {
  it("describes a case from our blocks and the layout's lines, not raw page text", () => {
    const text = describeCase(caseOf("911-p58"));
    expect(text).toContain("Text before the break (end of a paragraph): We believe this call");
    expect(text).toContain("Old page (p.57), set justified");
    expect(text).toMatch(/\[indent \+0\.0 em, right gap 0\.0 em\] Among the sources/);
    expect(text).toContain("+0.0 em from the line under it");
  });

  it("batches cases, shares and caches the examples, and asks for JSON by schema", () => {
    const cases = ["911-p58", "pm-p1050", "deepwater-p387"].map(caseOf);
    const requests = refereeRequests(cases, { model: "claude-haiku-4-5", batch: 2 });
    expect(requests.map((r) => [...r.ids.keys()])).toEqual([["c1", "c2"], ["c1"]]);
    const [first] = requests;
    expect(first.request.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(first.request.system[1].text).toContain(REFEREE_EXAMPLES[0].text);
    expect(first.request.output_config.format.type).toBe("json_schema");
    expect(first.request.messages[0].content.filter((c) => c.type === "text" && c.text.startsWith("Case c")).length).toBe(2);
  });

  it("names the pilot's bias: a bullet, a numbered paragraph, a contents entry or a heading is a split", async () => {
    const { REFEREE_SYSTEM } = await import("../src/referee");
    for (const word of ["bullet", "numbered", "contents", "heading"]) expect(REFEREE_SYSTEM).toContain(word);
  });

  it("examples come from development and PDF-only reports, never the held-out set", () => {
    const heldOut = ["columbia-accident", "uk-hillsborough-panel", "uk-chilcot-inquiry", "us-duelfer-report"];
    for (const x of REFEREE_EXAMPLES) expect(heldOut.some((id) => x.source.startsWith(id))).toBe(false);
    // and each example's key is the key its case has today, so an evaluation can leave it out
    expect(REFEREE_EXAMPLES.find((x) => x.source.includes("pages 57-58"))!.key).toBe(caseOf("911-p58").key);
  });
});

describe("asking, with a fake and with a recording", () => {
  it("parses answers, tolerating prose around the JSON, and drops what is not JOIN or SPLIT", () => {
    const a = parseRefereeAnswers('Here: {"answers":[{"id":"c1","answer":"JOIN"},{"id":"c2","answer":"SPLIT"},{"id":"c3","answer":"maybe"}]}');
    expect([...a]).toEqual([["c1", true], ["c2", false]]);
    expect(parseRefereeAnswers("no json").size).toBe(0);
    expect(parseRefereeAnswers("{not json}").size).toBe(0);
  });

  it("returns cache entries, usage and the unanswered keys", async () => {
    const cases = ["911-p58", "pm-p1050", "deepwater-p387"].map(caseOf);
    const fake: RefereeTransport = async (request) => {
      const ids = request.messages[0].content.flatMap((c) => (c.type === "text" ? [...c.text.matchAll(/^Case (c\d+):/gm)].map((m) => m[1]) : []));
      // answers SPLIT to everything but leaves the last id out
      return {
        text: JSON.stringify({ answers: ids.slice(0, -1).map((id) => ({ id, answer: "SPLIT" })) }),
        usage: { input_tokens: 1000, output_tokens: 20, cache_read_input_tokens: 3000 },
      };
    };
    const run = await refereePageBreaks(cases, fake, { model: "claude-haiku-4-5", batch: 20 });
    expect(run.calls).toBe(1);
    expect(run.entries.size).toBe(2);
    expect(run.unanswered).toEqual([cases[2].key]);
    expect(run.entries.get(cases[0].key)).toMatchObject({ join: false, by: "claude-haiku-4-5", rules: "join", rule: expect.stringMatching(/^R2/) });
    expect(run.usage).toEqual({ input_tokens: 1000, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000 });
    expect(refereeCost("claude-haiku-4-5", run.usage)).toBeCloseTo((1000 * 1 + 20 * 5 + 3000 * 0.1) / 1e6, 10);
    expect(refereeCost("no-such-model", run.usage)).toBeUndefined();
  });

  it("records responses against the exact request and replays them offline; a changed request throws", async () => {
    const file = join(tmp(), "recording.json");
    const cases = ["911-p58", "pm-p1050"].map(caseOf);
    let live = 0;
    const inner: RefereeTransport = async () => {
      live += 1;
      return { text: '{"answers":[{"id":"c1","answer":"JOIN"},{"id":"c2","answer":"JOIN"}]}', usage: { input_tokens: 10, output_tokens: 5 } };
    };
    const recorded = await refereePageBreaks(cases, recordingTransport(inner, file), { model: "claude-haiku-4-5" });
    const replayed = await refereePageBreaks(cases, replayTransport(file), { model: "claude-haiku-4-5" });
    expect(live).toBe(1);
    expect([...replayed.entries]).toEqual([...recorded.entries]);
    const [{ request }] = refereeRequests(cases, { model: "claude-haiku-4-5" });
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8")).exchanges)).toEqual([requestHash(request)]);
    await expect(refereePageBreaks(cases, replayTransport(file), { model: "claude-sonnet-5-5" })).rejects.toThrow(/re-record/);
  });
});
