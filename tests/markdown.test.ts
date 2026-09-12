import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  splitFrontMatter,
  slugify,
  paragraphId,
  collectNotes,
  withSidenotes,
} from "../src/markdown";

describe("markdown", () => {
  it("derives paragraph ids from the text", () => {
    const html = renderMarkdown("The rioters at the Capitol.\n\nMr. Pence declined.");
    expect(html).toContain('id="rioters-capitol"');
    expect(html).toContain('id="pence-declined"');
  });

  it("adds a permalink anchor to each paragraph", () => {
    const html = renderMarkdown("The rioters at the Capitol.");
    expect(html).toContain('<a class="permalink" href="#rioters-capitol"');
  });

  it("does not render front matter as body text", () => {
    const html = renderMarkdown('---\ntitle: "A Report"\n---\n\nBody text.');
    expect(html).not.toContain("title:");
    expect(html).not.toContain("A Report");
    expect(html).toContain("Body text.");
  });

  it("takes ids from the body, not the front matter", () => {
    const html = renderMarkdown('---\ntitle: "Unrelated Title Here"\n---\n\nFirst body sentence.');
    expect(html).toContain('id="first-body-sentence"');
    expect(html).not.toContain("Unrelated");
  });
});

describe("linkify", () => {
  it("does not link an OCR-garbled fragment with an uppercase TLD (reportsthatmatter-yhb)", () => {
    // Confirmed on production before this fix: a mis-scanned fragment like
    // this reads as a domain under markdown-it's default fuzzy matching,
    // purely by TLD-shaped coincidence, and renders as a live, wrong
    // <a href>. A real TLD is never written uppercase.
    expect(renderMarkdown("See Z.TZ for details.")).not.toContain("<a href");
  });

  it("does not link a dropped-space sentence boundary that lands on a real two-letter ccTLD", () => {
    // The dominant real-world case, not a contrived one: a missing space
    // after a sentence-ending period, immediately before a short
    // capitalised word that happens to be a real ccTLD. Confirmed on
    // production before this fix — 156 instances in us-911-commission
    // alone ("people.To the extent", "flight.At 8:46", "Omari.As the
    // investigation" read as links to .to/.at/.as).
    for (const text of ["people.To the extent possible.", "flight.At 8:46 it happened."]) {
      expect(renderMarkdown(text)).not.toContain("<a href");
    }
  });

  it("still links a genuine www.-prefixed citation", () => {
    const html = renderMarkdown("See www.hsgac.senate.gov for the record.");
    expect(html).toContain('<a href="http://www.hsgac.senate.gov">');
  });

  it("still links an explicit http(s) URL", () => {
    const html = renderMarkdown("See http://example.com/path for the record.");
    expect(html).toContain('<a href="http://example.com/path">');
  });

  it("still links a genuine schemeless bare domain with a lowercase TLD", () => {
    // A capitalised *label* right before the TLD is an ordinary brand name
    // ("FT.com", "GroupSystems.com" — Columbia's own investigation board
    // used GroupSystems software, cited by that bare domain, live on
    // production) — nothing about it resembles the dropped-space or
    // OCR-garble patterns this fix targets, both of which are given away
    // by the *TLD* itself, not the label before it.
    for (const [text, href] of [
      ["cited GroupSystems.com in the report.", "http://GroupSystems.com"],
      ["published in the FT.com archive.", "http://FT.com"],
      [
        "visit nationalarchives.gov.uk/doc/open-government-licence/version/3 for terms.",
        "http://nationalarchives.gov.uk/doc/open-government-licence/version/3",
      ],
    ] as const) {
      expect(renderMarkdown(text)).toContain(`<a href="${href}">`);
    }
  });

  it("does not link a www. domain an OCR line-wrap broke before its real TLD arrives", () => {
    // "www.oilspillcommission.\ngov)" (Deepwater Horizon) rejoins as
    // "www.oilspillcommission. gov)" — the domain never actually
    // completes with a TLD, so this must stay unlinked, not resolve to
    // the nonexistent domain "www.oilspillcommission".
    const html = renderMarkdown("found at www.oilspillcommission. gov) for more.");
    expect(html).not.toContain("<a href");
  });

  it("still links a short, all-lowercase-TLD OCR fragment (an accepted residual)", () => {
    // Not every false positive is chased: telling a short garbled
    // fragment ("a.cz") apart from a short real domain ("FT.com") by
    // shape alone, once both have a lowercase TLD, risks losing the real
    // ones. This documents the accepted gap rather than leaving it an
    // undocumented surprise.
    expect(renderMarkdown("Visit a.cz today.")).toContain("<a href");
  });
});

describe("splitFrontMatter", () => {
  it("parses metadata and strips it from the content", () => {
    const { data, content } = splitFrontMatter('---\ntitle: "A"\npages: 12\n---\nBody.');
    expect(data).toEqual({ title: "A", pages: 12 });
    expect(content.trim()).toBe("Body.");
  });

  it("passes documents without front matter through untouched", () => {
    const { data, content } = splitFrontMatter("Just body.");
    expect(data).toEqual({});
    expect(content).toBe("Just body.");
  });

  it("survives malformed front matter without throwing", () => {
    const { data, content } = splitFrontMatter("---\n: : :\n---\nBody.");
    expect(data).toEqual({});
    expect(content.trim()).toBe("Body.");
  });

  it("does not treat a horizontal rule as front matter", () => {
    const { content } = splitFrontMatter("Intro.\n\n---\n\nMore.");
    expect(content).toContain("Intro.");
    expect(content).toContain("More.");
  });
});

describe("slugify", () => {
  it("makes url-safe heading ids", () => {
    expect(slugify("Section 1: The Findings!")).toBe("section-1-the-findings");
  });
});

describe("permalink placement", () => {
  const between = (html: string, open: string, close: string) =>
    html.slice(html.indexOf(open), html.indexOf(close) + close.length);

  it("does not put a permalink inside a list item", () => {
    const html = renderMarkdown("- One item\n\n- Two item\n\nA real paragraph.");
    expect(between(html, "<ul>", "</ul>")).not.toContain("permalink");
  });

  it("still gives ids to top-level paragraphs around a list", () => {
    const html = renderMarkdown("First paragraph here.\n\n- item\n\nSecond paragraph here.");
    expect(html).toContain('id="first-paragraph-here"');
    expect(html).toContain('id="second-paragraph-here"');
  });

  it("does not put a permalink inside a block quote", () => {
    const html = renderMarkdown("> Quoted text.\n\nBody.");
    expect(between(html, "<blockquote>", "</blockquote>")).not.toContain("permalink");
  });
});

describe("paragraphId", () => {
  it("is derived from the words, so it survives re-ingestion", () => {
    const before = paragraphId("The rioters at the Capitol had been motivated.", new Set());
    const after = paragraphId("The rioters at the Capitol had been motivated.", new Set());
    expect(after).toBe(before);
  });

  it("does not shift when an earlier paragraph is added or removed", () => {
    // The whole point: positional ids would renumber here, these do not.
    const first = renderMarkdown("Alpha content here.\n\nBeta content here.");
    const second = renderMarkdown("Inserted opening line.\n\nAlpha content here.\n\nBeta content here.");
    expect(first).toContain('id="alpha-content-here"');
    expect(second).toContain('id="alpha-content-here"');
    expect(second).toContain('id="beta-content-here"');
  });

  it("drops stopwords to stay distinctive", () => {
    expect(paragraphId("The rioters at the Capitol", new Set())).toBe("rioters-capitol");
  });

  it("keeps stopwords when almost nothing else is left", () => {
    expect(paragraphId("It was on the", new Set())).toBe("it-was-on-the");
  });

  it("disambiguates identical openings", () => {
    const taken = new Set<string>();
    expect(paragraphId("Same opening words here", taken)).toBe("same-opening-words-here");
    expect(paragraphId("Same opening words here", taken)).toBe("same-opening-words-here-2");
    expect(paragraphId("Same opening words here", taken)).toBe("same-opening-words-here-3");
  });

  it("ignores footnote markers when building the id", () => {
    expect(paragraphId("Trump replied[^127] so what", new Set())).toBe("trump-replied-so-what");
  });

  it("survives a paragraph with no usable words", () => {
    expect(paragraphId("!!! ???", new Set())).toBe("para");
  });
});

describe("page markers", () => {
  it("turns a page marker into an anchor", () => {
    const html = renderMarkdown("%%page 46%%\n\nBody text on that page.");
    expect(html).toContain('id="page-46"');
    expect(html).not.toContain("%%page");
  });

  it("tags following paragraphs with the printed page", () => {
    const html = renderMarkdown("%%page 46%%\n\nBody text on that page.");
    expect(html).toContain('data-page="46"');
  });

  it("updates the page as the document progresses", () => {
    const html = renderMarkdown("%%page 1%%\n\nFirst thing.\n\n%%page 2%%\n\nSecond thing.");
    expect(html).toMatch(/id="first-thing"[^>]*data-page="1"/);
    expect(html).toMatch(/id="second-thing"[^>]*data-page="2"/);
  });
});

describe("sidenotes", () => {
  it("places the note beside the sentence rather than at the end", () => {
    const html = renderMarkdown('Trump replied "So what?"[^127]\n\n## Notes\n\n[^127]: Interview transcript at 12.');
    expect(html).toContain("sidenote");
    expect(html).toContain("Interview transcript at 12.");
  });

  it("removes the collected notes section from the body", () => {
    const html = renderMarkdown('Body.[^1]\n\n## Notes\n\n[^1]: A note.');
    expect(html).not.toContain("<h2>Notes</h2>");
  });

  // reportsthatmatter-ooj: Leveson restarts footnote numbering per chapter,
  // so "[^20]" legitimately names two unrelated notes in one document.
  it("resolves a restarting numbering scheme end to end, chapter reference to chapter note", () => {
    const html = renderMarkdown(
      "## Chapter Two\n\nFirst chapter's point.[^20]\n\n## Chapter Five\n\n" +
        "Second chapter's point.[^20]\n\n## Notes\n\n[^20]: Chapter two's note." +
        "\n\n[^20]: Chapter five's note."
    );
    const firstSidenote = html.indexOf("Chapter two's note.");
    const secondSidenote = html.indexOf("Chapter five's note.");
    expect(firstSidenote).toBeGreaterThan(-1);
    expect(secondSidenote).toBeGreaterThan(firstSidenote);
    // Each note appears exactly once — not both texts glued under one marker.
    expect(html.match(/Chapter two's note\./g)).toHaveLength(1);
    expect(html.match(/Chapter five's note\./g)).toHaveLength(1);
  });

  it("orphans only the instance of a repeated number that was never referenced", () => {
    const html = renderMarkdown(
      "Only this chapter's point is cited.[^20]\n\n## Notes\n\n[^20]: Cited note." +
        "\n\n[^20]: Never-referenced note from elsewhere."
    );
    expect(html).toContain("Cited note.");
    expect(html).toContain("Notes not linked in the text");
    expect(html).toContain("Never-referenced note from elsewhere.");
    // The cited instance must not also appear in the orphan list.
    expect(html.match(/Cited note\./g)).toHaveLength(1);
  });

  it("lists notes it could not place instead of dropping them", () => {
    const html = renderMarkdown('Body with no reference.\n\n## Notes\n\n[^99]: An unplaced note.');
    expect(html).toContain("Notes not linked in the text");
    expect(html).toContain("An unplaced note.");
  });

  it("leaves a reference alone when there is no matching note", () => {
    const { html, used } = withSidenotes("<p>Body.[^5]</p>", new Map());
    expect(html).toContain("[^5]");
    expect(used.size).toBe(0);
  });

  it("escapes markup in note text", () => {
    const { html } = withSidenotes("<p>x[^1]</p>", new Map([["1", ["<script>bad</script>"]]]));
    expect(html).not.toContain("<script>bad</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("gives each reference its own toggle", () => {
    const notes = new Map([["1", ["note one"]]]);
    const { html } = withSidenotes("<p>a[^1] b[^1]</p>", notes);
    const ids = [...html.matchAll(/id="(sn-[^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks a note long once it is disproportionately taller than its paragraph would be", () => {
    // A note this long floating in the margin drifts out of alignment with
    // the text it supports over the rest of the page — see
    // docs/plans/2026-08-09-sidenote-design-research.md. Short notes (the
    // overwhelming majority, by measured distribution) are untouched.
    const short = new Map([["1", ["See ECF No. 252 at 15."]]]);
    const long = new Map([["1", ["See ECF No. 252 at 53 & n.283; ".repeat(20).trim()]]]);
    expect(withSidenotes("<p>x[^1]</p>", short).html).not.toContain('class="sidenote long"');
    expect(withSidenotes("<p>x[^1]</p>", long).html).toContain('class="sidenote long"');
  });

  it("gives a long note an in-place expand affordance using its own toggle", () => {
    const long = new Map([["1", ["citation ".repeat(60).trim()]]]);
    const { html } = withSidenotes("<p>x[^1]</p>", long);
    const toggleId = html.match(/id="(sn-[^"]+)"/)?.[1];
    expect(toggleId).toBeTruthy();
    expect(html).toContain(`<label class="sidenote-expand" for="${toggleId}">`);
  });

  // reportsthatmatter-ooj: a restarting numbering scheme (Leveson: per
  // chapter) writes several genuinely different notes under the same label.
  it("resolves repeated references to the same number positionally, not to one shared note", () => {
    const notes = new Map([["20", ["chapter two's note", "chapter five's note"]]]);
    const { html, used } = withSidenotes("<p>a[^20] ... b[^20]</p>", notes);
    const [first, second] = [...html.matchAll(/<span class="sidenote">.*?<\/span>/g)];
    expect(first[0]).toContain("chapter two's note");
    expect(second[0]).toContain("chapter five's note");
    expect(used.get("20")).toBe(2);
  });

  it("falls back to the last definition when a number is referenced more times than it has notes", () => {
    const notes = new Map([["1", ["only note"]]]);
    const { html } = withSidenotes("<p>a[^1] b[^1] c[^1]</p>", notes);
    const spans = [...html.matchAll(/<span class="sidenote">.*?<\/span>/g)];
    expect(spans).toHaveLength(3);
    for (const span of spans) expect(span[0]).toContain("only note");
  });
});

describe("collectNotes", () => {
  it("reads the note definitions", () => {
    const notes = collectNotes("[^1]: First note.\n\n[^2]: Second note.");
    expect(notes.get("1")).toEqual(["First note."]);
    expect(notes.get("2")).toEqual(["Second note."]);
  });

  it("keeps repeated definitions under the same number as separate instances", () => {
    const notes = collectNotes("[^20]: Chapter two's note.\n\n[^20]: Chapter five's note.");
    expect(notes.get("20")).toEqual(["Chapter two's note.", "Chapter five's note."]);
  });
});

describe("splitSections", () => {
  it("splits on top-level headings and keeps paragraph ids", async () => {
    const { splitSections } = await import("../src/sections");
    const html = renderMarkdown(
      "Opening paragraph here.\n\n## First Section\n\nBody of first.\n\n## Second Section\n\nBody of second."
    );
    const sections = splitSections(html, 0);
    expect(sections.map((s) => s.title)).toEqual([
      "Front matter",
      "First Section",
      "Second Section",
    ]);
    expect(sections[1].html).toContain('id="body-first"');
  });

  it("folds a sliver into the section before it", async () => {
    const { splitSections } = await import("../src/sections");
    const long = "word ".repeat(800);
    const html = renderMarkdown(`## Real Section\n\n${long}\n\n## SENATOR CARL LEVIN\n\nChairman.`);
    const sections = splitSections(html);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Real Section");
    // The sliver's heading survives in the body; it just is not its own page.
    expect(sections[0].html).toContain("SENATOR CARL LEVIN");
  });

  it("keeps a bodyless part divider in the contents, ahead of its chapters", async () => {
    const { splitSections } = await import("../src/sections");
    const long = "word ".repeat(800);
    const html = renderMarkdown(
      `## Part 2: Introduction\n\n${long}\n\n## Part 3: His Life\n\n### Chapter 1: In Russia\n\n${long}\n\n### Chapter 2: Leaving Russia\n\n${long}`
    );
    const sections = splitSections(html);
    // "Part 3: His Life" has no body of its own, but it must still head a
    // section — not vanish into "Part 2" — so the contents can list it.
    expect(sections.map((s) => [s.title, s.level])).toEqual([
      ["Part 2: Introduction", 2],
      ["Part 3: His Life", 2],
      ["Chapter 2: Leaving Russia", 3],
    ]);
    expect(sections[1].html).toContain("Chapter 1: In Russia");
  });

  it("finds which section holds a paragraph", async () => {
    const { splitSections, sectionFor } = await import("../src/sections");
    const html = renderMarkdown("## One\n\nAlpha text here.\n\n## Two\n\nBeta text here.");
    const sections = splitSections(html, 0);
    expect(sectionFor(sections, "beta-text-here")?.title).toBe("Two");
    expect(sectionFor(sections, "nope")).toBeNull();
  });

  it("decodes entities in section titles", async () => {
    const { splitSections } = await import("../src/sections");
    const html = renderMarkdown("## Moody's & Standard & Poor's\n\nBody.");
    const sections = splitSections(html, 0);
    expect(sections[0].title).toBe("Moody's & Standard & Poor's");
  });

  it("records the heading level a section split on, so the contents page can nest them", async () => {
    const { splitSections } = await import("../src/sections");
    const html = renderMarkdown(
      "Front matter here.\n\n## A Part\n\nBody.\n\n### A Subsection\n\nMore body."
    );
    const sections = splitSections(html, 0);
    expect(sections.map((s) => [s.title, s.level])).toEqual([
      ["Front matter", 2],
      ["A Part", 2],
      ["A Subsection", 3],
    ]);
  });
});

describe("paragraphIndex", () => {
  it("maps every paragraph id to the slug of the section holding it", async () => {
    const { splitSections, paragraphIndex } = await import("../src/sections");
    const html = renderMarkdown("## One\n\nAlpha text here.\n\n## Two\n\nBeta text here.");
    const sections = splitSections(html, 0);

    const index = paragraphIndex(sections);

    expect(index["alpha-text-here"]).toBe("one");
    expect(index["beta-text-here"]).toBe("two");
    expect(index["nope"]).toBeUndefined();
  });

  it("agrees with sectionFor for every paragraph, without needing section html at lookup time", async () => {
    const { splitSections, sectionFor, paragraphIndex } = await import("../src/sections");
    const html = renderMarkdown(
      "## One\n\nAlpha text here.\n\n## Two\n\nBeta text here.\n\nGamma follows beta."
    );
    const sections = splitSections(html, 0);
    const index = paragraphIndex(sections);

    for (const id of Object.keys(index)) {
      expect(sections.find((s) => s.slug === index[id])).toBe(sectionFor(sections, id));
    }
  });
});

describe("lists are citable", () => {
  it("gives a top-level list a text-derived id and a permalink", () => {
    const html = renderMarkdown(
      "---\ntitle: t\n---\n\n- after the adoption of resolution 1441;\n- before the decision to deploy troops;\n"
    );

    expect(html).toMatch(/<ul id="[a-z0-9-]+"/);
    expect(html).not.toMatch(/<ul id="(list|ul)-\d+"/); // never positional
    expect(html).toContain('class="permalink"');
    expect(html).toMatch(/id="[^"]*adoption[^"]*"/);
  });

  it("does not give ids to the items themselves", () => {
    const html = renderMarkdown("---\ntitle: t\n---\n\n- one item here\n- two items here\n");

    expect(html).not.toMatch(/<li id=/);
  });

  // reportsthatmatter-ru3: an empty first item (a bare "-", common in
  // OCR-garbled figure/diagram captions) has no inline token of its own, so
  // an unscoped search for "the first inline token" walks past the whole
  // list and grabs unrelated text further into the document — confirmed on
  // Challenger p.184, where a figure caption reduced to a lone "-"
  // immediately preceded a "## DOWNSTREAM SECONDARY" heading and the list's
  // id became "downstream-secondary".
  it("falls back to the paragraph default when the first item is empty, rather than borrow a later item in the same list", () => {
    const html = renderMarkdown(
      "---\ntitle: t\n---\n\n- \n- a real second item\n\n## DOWNSTREAM SECONDARY\n"
    );

    expect(html).toMatch(/<ul id="para[^"]*"/);
    expect(html).not.toMatch(/real-second-item/);
    expect(html).not.toMatch(/downstream-secondary/);
  });

  it("does not borrow a heading past the list's own close when the only item is empty", () => {
    const html = renderMarkdown("---\ntitle: t\n---\n\n- \n\n## DOWNSTREAM SECONDARY\n");

    expect(html).toMatch(/<ul id="para[^"]*"/);
    expect(html).not.toMatch(/downstream-secondary/);
  });
});

describe("repeated page anchors", () => {
  it("renders a suffixed marker as a distinct id", () => {
    const html = renderMarkdown("%%page 2%%\n\nFirst.\n\n%%page 2#2%%\n\nSecond.\n");
    expect(html).toContain('id="page-2"');
    expect(html).toContain('id="page-2-2"');
    // The label a reader sees is still the printed number.
    expect(html).toContain('aria-label="Printed page 2"');
  });
});
