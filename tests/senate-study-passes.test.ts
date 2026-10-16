import { describe, expect, it } from "vitest";
import { ingestPageGroups } from "../src/pipeline";
import { pipeline, resolvePasses } from "../src/define";
import { mergeAcrossPages, type Block } from "../src/paragraphs";
import { hangingLabels, insetOpenings, type Pass } from "../src/passes";

// The Senate Intelligence Committee study (reportsthatmatter-jc46): the minority
// views' "Study Claim:" / "Fact:" items set under a hanging label, and paragraphs
// whose first lines a redaction box or a struck marking pushed in from the margin.
const base = { id: "t", title: "T", repo: ".", volumes: [{ path: "a.pdf" }] };
const run = (lines: string[], passes: Pass[]) =>
  ingestPageGroups(
    [[{ index: 1, volume: 1, pdfIndex: 1, lines }]],
    { title: "T" },
    resolvePasses(pipeline({ ...base, passes }))
  ).markdown;

// PDF p.618 (printed p.589), as the redaction pass leaves it.
const p589 = [
  "August 4, 2002. Given the breadth of the information provided by Abu Zubaydah after April 15,",
  "2002, and its attendant impact on subsequent intelligence efforts by the United States",
  "government and its allies, we conclude that this information supports the CIA's specific",
  "representations about the effectiveness of its Detention and Interrogation Program.",
  "",
  "Study Claim: [Redacted]                                   \"A review of CIA records found no connection",
  "                   between Abu Zubaydah's reporting on Ramzi bin al-Shibh and Ramzi bin al-",
  "                   Shibh's capture... While CIA records indicate that Abu Zubaydah",
  "                   provided information on Ramzi bin al-Shibh.\"142",
  "",
  "Fact:              f F [Redacted] 1 ^ CIA records demonstrate that Abu Zubaydah",
  "                   was subjected to enhanced interrogation techniques during two separate",
  "                   periods in April 2002 and August 2002.",
  "",
  "factually incorrect premise that Abu Zubaydah was not subjected to enhanced interrogation",
  "techniques until August 4, 2002. As previously demonstrated, Abu Zubaydah was first",
];

describe("hangingLabels", () => {
  it("reads a labelled item and its hanging lines as one paragraph (Senate study p.589)", () => {
    const before = run(p589, []);
    expect(before).toMatch(/^> between Abu Zubaydah's reporting/m);
    const md = run(p589, [hangingLabels()]);
    expect(md).not.toMatch(/^> /m);
    expect(md).toMatch(/^Study Claim: \[Redacted\] "A review of CIA records found no connection between Abu Zubaydah's reporting/m);
    expect(md).toMatch(/^Fact: f F \[Redacted\] 1 \^ CIA records demonstrate that Abu Zubaydah was subjected to enhanced/m);
  });

  it("opens a report's own label with no gap after it (p.581)", () => {
    const lines = [
      ...p589.slice(0, 5),
      "Study Claim: f [Redacted] ) \"On at least two prominent occasions, the CIA",
      "                   represented, inaccurately, that Abu Zubaydah provided information",
      "                   after the use of the CIA's enhanced interrogation techniques.\"99",
    ];
    expect(run(lines, [hangingLabels()])).toMatch(/^> represented/m);
    expect(run(lines, [hangingLabels({ labels: ["Study Claim", "Fact"] })])).toMatch(/^Study Claim: f \[Redacted\] \) "On at least two prominent occasions, the CIA represented, inaccurately/m);
  });

  it("leaves a label with no gap after it, over a quotation, alone", () => {
    const lines = [
      "The officer wrote to Headquarters as follows, in a cable of that day:",
      "Subject: the detainee's condition",
      "                   He has been cooperative throughout the session and has",
      "                   provided information on the plot.",
    ];
    expect(run(lines, [hangingLabels()])).toMatch(/^> He has been cooperative/m);
  });
});

const at = (pdfIndex: number) => ({ volume: 1, pdfIndex, printed: pdfIndex });
const quote = (text: string, page = 1): Block & { kind: "quote" } => ({ kind: "quote", text, at: at(page) });
const para = (text: string, page = 1): Block => ({ kind: "paragraph", text, at: at(page) });
const marker = (page: number): Block => ({ kind: "page", number: page, at: at(page) });
const on = { insetOpenings: true };

describe("insetOpenings", () => {
  it("joins a paragraph's pushed-in opening to the rest of it (Senate study p.54)", () => {
    const blocks = [
      quote("[Redacted] [combatant command] to alert the command of the risks prior to the U.S. military [Redacted] being involved in any aspect of the interrogation of al-Najjar.[^266] According to the CIA"),
      para('inspector general, the detention and interrogation of Ridha al-Najjar "became the model" for handling other CIA detainees.[^267]'),
    ];
    expect(mergeAcrossPages(blocks.map((b) => ({ ...b })))).toHaveLength(2);
    const merged = mergeAcrossPages(blocks, on);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ kind: "paragraph", text: expect.stringMatching(/According to the CIA inspector general, the detention/) });
  });

  it("leaves a quotation that opens on its quotation mark, a title, a long quotation, and a page break alone", () => {
    const rest = para("to provide inpatient care for detainees, and concluded that the facilities were not equipped.");
    for (const first of [
      quote('"only viable endgame for continued US Government custody of these detainees is to begin transferring them to third countries,'),
      quote("The Thwarting of the Second Wave Plots and Discovery of the Al-Ghuraba Group"),
      quote("the officer described the arrangement at length ".repeat(10) + "and"),
      quote("Less than two hours after the capture, anticipating his arrival at the site, the chief of", 1),
    ]) {
      const blocks = first.text.startsWith("Less") ? [first, marker(2), { ...rest, at: at(2) }] : [first, { ...rest }];
      expect(mergeAcrossPages(blocks, on).filter((b) => b.kind !== "page")).toHaveLength(2);
    }
  });

  it("leaves a quotation that ends its sentence, or a capitalised paragraph after it, alone", () => {
    expect(mergeAcrossPages([quote("The rooms were used for whoever was brought over."), para("detainees were moved later.")], on)).toHaveLength(2);
    expect(mergeAcrossPages([quote("Less than two hours after the capture the chief of"), para("The cable said so.")], on)).toHaveLength(2);
  });
});
