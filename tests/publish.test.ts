import { describe, expect, it } from "vitest";
import {
  contentHash,
  manifestFor,
  manifestProblems,
  tokenFor,
  authorises,
  isPublishablePath,
  isReportId,
} from "../src/publish";

const SECRET = "a-test-secret";

const FILES = [
  { path: "meta.json", body: '{"words":2,"sections":[{"slug":"s","title":"S"}],"paragraphToSection":{}}' },
  { path: "full-body.html", body: '<p id="a">Alpha.</p>' },
  { path: "fragments/s.html", body: '<p id="a">Alpha.</p>' },
];

describe("content hashing", () => {
  it("is the same for the same content and different for different content", async () => {
    const a = await contentHash(await manifestFor(FILES));
    const b = await contentHash(await manifestFor([...FILES].reverse()));
    const c = await contentHash(
      await manifestFor([...FILES.slice(1), { path: "meta.json", body: "{} " }])
    );

    expect(a).toBe(b); // order of the files is not part of the version
    expect(a).not.toBe(c);
  });

  it("cannot be collided by shifting a boundary between fields", async () => {
    const one = await contentHash([{ path: "a", hash: "x".repeat(64) }, { path: "b", hash: "y".repeat(64) }]);
    const two = await contentHash([{ path: "ab", hash: "x".repeat(64) }, { path: "", hash: "y".repeat(64) }]);
    expect(one).not.toBe(two);
  });
});

describe("what may be published", () => {
  it("accepts the paths the reader actually asks for", () => {
    expect(isPublishablePath("meta.json")).toBe(true);
    expect(isPublishablePath("full-body.html")).toBe(true);
    expect(isPublishablePath("fragments/board-statement.html")).toBe(true);
  });

  it("refuses anything that could climb out of the version prefix", () => {
    for (const path of [
      "../../etc/passwd",
      "fragments/../../x.html",
      "/meta.json",
      "fragments/x.html/../../y",
      "search-index.sql",
      "fragments/nested/x.html",
    ]) {
      expect(isPublishablePath(path), path).toBe(false);
    }
  });

  it("refuses a report id that is not one", () => {
    for (const id of ["../x", "A", "", "x/y", "-leading"]) expect(isReportId(id), id).toBe(false);
    expect(isReportId("uk-leveson-inquiry")).toBe(true);
  });

  it("refuses a version missing anything the reader needs", async () => {
    expect(manifestProblems(await manifestFor(FILES))).toEqual([]);
    expect(manifestProblems(await manifestFor(FILES.slice(1)))).toContain("no meta.json");
    expect(manifestProblems(await manifestFor([FILES[0], FILES[1]]))).toContain("no fragments");
  });
});

describe("a report's publish token", () => {
  it("publishes that report and no other", async () => {
    const token = await tokenFor(SECRET, "report-a");
    expect(await authorises(SECRET, "report-a", token)).toBe(true);
    expect(await authorises(SECRET, "report-b", token)).toBe(false);
  });

  it("is worthless without the secret, and publishing is off without one", async () => {
    expect(await authorises(SECRET, "report-a", await tokenFor("other-secret", "report-a"))).toBe(false);
    expect(await authorises(undefined, "report-a", "anything")).toBe(false);
  });
});
