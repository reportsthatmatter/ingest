import { describe, expect, it } from "vitest";
import { rejoinHyphenated, vocabulary } from "../src/hyphens";

const words = (source: string) => vocabulary(source);

describe("rejoinHyphenated", () => {
  it("rejoins a word the document writes whole elsewhere", () => {
    const v = words("the records were kept. maintenance records exist.");
    expect(rejoinHyphenated("reviewed the re- cords today", v)).toBe(
      "reviewed the records today"
    );
  });

  it("keeps a compound the document writes hyphenated elsewhere", () => {
    const v = words("this was a well-known problem, well-known indeed");
    expect(rejoinHyphenated("a well- known problem", v)).toBe("a well-known problem");
  });

  it("leaves a break alone when the document has never written either form", () => {
    // Inventing a word is worse than a visible break: one is honest about a
    // gap, the other reads as the document.
    const v = words("nothing relevant here at all");
    expect(rejoinHyphenated("some zzz- qqq thing", v)).toBe("some zzz- qqq thing");
  });

  it("prefers the joined form when the document uses both", () => {
    const v = words("the co-operation and the cooperation both appear");
    expect(rejoinHyphenated("full co- operation given", v)).toBe(
      "full cooperation given"
    );
  });

  it("does not touch a hyphen followed by a capital", () => {
    const v = words("Co-Conspirator 1 acted");
    expect(rejoinHyphenated("the Co- Conspirator acted", v)).toBe(
      "the Co- Conspirator acted"
    );
  });

  it("leaves ordinary dashes between words alone", () => {
    const v = words("a dash - separates clauses here");
    expect(rejoinHyphenated("a dash - separates clauses", v)).toBe(
      "a dash - separates clauses"
    );
  });
});

describe("vocabulary", () => {
  it("keeps hyphenated compounds as their own entry", () => {
    expect(vocabulary("a well-known fact").has("well-known")).toBe(true);
  });
});
