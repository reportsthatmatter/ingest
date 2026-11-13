import { describe, expect, it } from "vitest";
import { renderArtifacts, paragraphFingerprint, type ReservedId, type RenderedArtifacts } from "../src/render";
import { extractPassages } from "../src/passages";

// reportsthatmatter-efso: a published id keeps the paragraph it named; a new paragraph whose text asks for it is suffixed.

const filler = (tag: string) =>
  Array.from({ length: 30 }, (_, i) => `Paragraph ${i} of ${tag} carries enough distinct words about ${tag} to make a section of its own, number ${i}.`).join("\n\n");
const chapter = (n: number, body: string) => `## Chapter ${n}\n\n${body}\n\n${filler(`chapter${n}`)}`;
const doc = (...chapters: string[]) => chapters.join("\n\n") + "\n";

/** What publishing `r` records: every passage's id, section and fingerprint, in reading order. */
const record = (r: RenderedArtifacts): ReservedId[] => {
  const out = r.meta.sections.flatMap((s) => extractPassages(r.fragments[s.slug]).map((p) => ({ id: p.paragraphId, section: s.slug, fingerprint: paragraphFingerprint(p.text), next: "" })));
  out.forEach((e, i) => (e.next = out[i + 1]?.fingerprint ?? ""));
  return out;
};

/** id -> [section, text] */
const where = (r: RenderedArtifacts) =>
  Object.fromEntries(r.meta.sections.flatMap((s) => extractPassages(r.fragments[s.slug]).map((p) => [p.paragraphId, [s.slug, p.text]])));

describe("reserved ids (efso)", () => {
  const before = doc(chapter(2, "Key Messages"), chapter(6, "Key Messages"));
  const published = renderArtifacts(before);

  it("checks the setup: two sections, key-messages in chapter 2, key-messages-2 in chapter 6", () => {
    expect(where(published)["key-messages"][0]).toBe("chapter-2");
    expect(where(published)["key-messages-2"][0]).toBe("chapter-6");
  });

  it("changes nothing when the reservations agree with the plain pass", () => {
    expect(renderArtifacts(before, { reserved: record(published) })).toEqual(published);
  });

  it("without reservations, an earlier new chapter takes the published id (the defect)", () => {
    const after = renderArtifacts(doc(chapter(1, "Key Messages"), chapter(2, "Key Messages"), chapter(6, "Key Messages")));
    expect(where(after)["key-messages"][0]).toBe("chapter-1");
  });

  it("keeps each published id in its chapter and suffixes the new paragraph", () => {
    const after = renderArtifacts(doc(chapter(1, "Key Messages"), chapter(2, "Key Messages"), chapter(6, "Key Messages")), { reserved: record(published) });
    const w = where(after);
    expect(w["key-messages"][0]).toBe("chapter-2");
    expect(w["key-messages-2"][0]).toBe("chapter-6");
    expect(w["key-messages-3"][0]).toBe("chapter-1");
    // Nothing else moved: the filler ids are the same as without reservations.
    const plain = where(renderArtifacts(doc(chapter(1, "Key Messages"), chapter(2, "Key Messages"), chapter(6, "Key Messages"))));
    for (const id of Object.keys(plain).filter((x) => !x.startsWith("key-messages"))) expect(w[id]).toEqual(plain[id]);
    // The routing index agrees with the html.
    expect(after.meta.paragraphToSection["key-messages"]).toBe("chapter-2");
  });

  it("tells same-opening references apart by their text, and a unique id keeps its paragraph too", () => {
    const old = renderArtifacts(doc(chapter(6, "Tol, R.S.J. (2002). Estimates of the damage costs of climate change, part II: dynamic estimates.")));
    expect(Object.keys(where(old))).toContain("tol-r-s-j-2002");
    const next = doc(chapter(3, "Tol, R.S.J. (2002). Estimates of the damage costs of climate change, Part I: Benchmark estimates."), chapter(6, "Tol, R.S.J. (2002). Estimates of the damage costs of climate change, part II: dynamic estimates."));
    const w = where(renderArtifacts(next, { reserved: record(old) }));
    expect(w["tol-r-s-j-2002"]).toEqual(["chapter-6", expect.stringContaining("part II")]);
    expect(w["tol-r-s-j-2002-2"]).toEqual(["chapter-3", expect.stringContaining("Part I")]);
  });

  it("picks the paragraph with the published text when several in one section ask for the id", () => {
    const old = renderArtifacts(doc(chapter(6, "Smith, Jones, Brown and Green (2001). Second work.")));
    const next = doc(chapter(6, "Smith, Jones, Brown and Green (2001). First work.\n\nSmith, Jones, Brown and Green (2001). Second work."));
    const w = where(renderArtifacts(next, { reserved: record(old) }));
    expect(w["smith-jones-brown-green-2001"][1]).toContain("Second work");
    expect(w["smith-jones-brown-green-2001-2"][1]).toContain("First work");
  });

  it("keeps an id on its paragraph after a correction (same section, text changed)", () => {
    const km = (end: string) => `Key messages climate change costs: ${end}`;
    const old = renderArtifacts(doc(chapter(2, km("adaptation")), chapter(6, km("the costs"))));
    expect(where(old)["key-messages-climate-change-costs-2"][0]).toBe("chapter-6");
    const next = doc(chapter(1, km("new")), chapter(2, km("adaptation")), chapter(6, km("the costs of action")));
    const w = where(renderArtifacts(next, { reserved: record(old) }));
    expect(w["key-messages-climate-change-costs"][0]).toBe("chapter-2");
    expect(w["key-messages-climate-change-costs-2"][0]).toBe("chapter-6");
    expect(w["key-messages-climate-change-costs-3"][0]).toBe("chapter-1");
  });

  it("gives a contested paragraph to the first reservation and retires the later one", () => {
    // key-messages-2 was published (later) for the chapter 2 paragraph that key-messages first named: it is not reused.
    const next = doc(chapter(1, "Key Messages"), chapter(2, "Key Messages"));
    const fp = paragraphFingerprint("Key Messages");
    const reserved = [
      { id: "key-messages", section: "chapter-2", fingerprint: fp },
      { id: "key-messages-2", section: "chapter-2", fingerprint: fp },
    ];
    const w = where(renderArtifacts(next, { reserved }));
    expect(w["key-messages"][0]).toBe("chapter-2");
    expect(w["key-messages-2"]).toBeUndefined();
    expect(w["key-messages-3"][0]).toBe("chapter-1");
  });

  it("does not retire an id whose own paragraph was merely corrected or removed", () => {
    const next = doc(chapter(1, "Key Messages"), chapter(2, "Key Messages"));
    const reserved = [{ id: "key-messages-2", section: "chapter-9", fingerprint: paragraphFingerprint("Key Messages: gone") }];
    expect(renderArtifacts(next, { reserved })).toEqual(renderArtifacts(next));
  });

  it("finds a paragraph whose section was re-split, by its text and the passage after it", () => {
    // As if chapter 6 had been served inside a Part section that no longer holds it (reportsthatmatter-owre).
    const moved = record(published).map((e) => (e.section === "chapter-6" ? { ...e, section: "part-ii" } : e));
    const w = where(renderArtifacts(doc(chapter(1, "Key Messages"), chapter(2, "Key Messages"), chapter(6, "Key Messages")), { reserved: moved }));
    expect(w["key-messages"][0]).toBe("chapter-2");
    expect(w["key-messages-2"][0]).toBe("chapter-6");
    expect(w["key-messages-3"][0]).toBe("chapter-1");
  });

  it("does not use the text-and-next match when the old id's own section still has its paragraph", () => {
    // Identical openings and identical following text in two chapters: the section decides.
    const same = "Key Messages\n\nThe same boilerplate follows.";
    const old = renderArtifacts(doc(chapter(2, same)));
    const w = where(renderArtifacts(doc(chapter(1, same), chapter(2, same)), { reserved: record(old) }));
    expect(w["key-messages"][0]).toBe("chapter-2");
    expect(w["key-messages-2"][0]).toBe("chapter-1");
  });

  it("ignores a reservation whose section is gone or whose family has no paragraph left", () => {
    const next = doc(chapter(1, "Key Messages"), chapter(2, "Key Messages"));
    const plain = renderArtifacts(next);
    expect(renderArtifacts(next, { reserved: [{ id: "key-messages", section: "chapter-9" }, { id: "nothing-like-it", section: "chapter-1" }] })).toEqual(plain);
  });

  it("reserves list ids the same way", () => {
    const old = renderArtifacts(doc(chapter(2, "- Key point one\n- two")));
    const next = doc(chapter(1, "- Key point one\n- other"), chapter(2, "- Key point one\n- two"));
    const w = where(renderArtifacts(next, { reserved: record(old) }));
    expect(w["key-point-one"][0]).toBe("chapter-2");
    expect(w["key-point-one-2"][0]).toBe("chapter-1");
  });
});

describe("paragraphFingerprint", () => {
  it("ignores case, punctuation and spacing, not words", () => {
    expect(paragraphFingerprint("Key  Messages.")).toBe(paragraphFingerprint("key messages"));
    expect(paragraphFingerprint("Key Messages")).not.toBe(paragraphFingerprint("Key Message"));
    expect(paragraphFingerprint("x")).toMatch(/^[0-9a-f]{8}$/);
  });
  it("never hands a retired id to a different paragraph in its section (tier 3 skips an id that lost its paragraph)", () => {
    const P2 = "Tol, R.S.J. (2002): Estimates part II: dynamic estimates.";
    const P1 = "Tol, R.S.J. (2002): Estimates part I: benchmark estimates.";
    const Z = "Zed, Z. (2001): Something.";
    // tol-r-s-j-2002-2 was served on P2 after tol-r-s-j-2002 (older): it lost P2 and is retired.
    const reserved: ReservedId[] = ["tol-r-s-j-2002", "tol-r-s-j-2002-2"].map((id) => ({ id, section: "ch-a", fingerprint: paragraphFingerprint(P2), next: paragraphFingerprint(Z) }));
    const after = renderArtifacts(`## Ch A\n\nIntro text here.\n\n${P1}\n\n${P2}\n\n${Z}\n`, { reserved });
    const ids = where(after);
    expect(ids["tol-r-s-j-2002"][1]).toBe(P2);
    expect(ids["tol-r-s-j-2002-2"]).toBeUndefined();
    expect(ids["tol-r-s-j-2002-3"][1]).toBe(P1);
  });
});
