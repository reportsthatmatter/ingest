import { describe, expect, it } from "vitest";
import { linkFlushMarkers } from "../src/footnotes";

const notes = (...ns: number[]) => new Set(ns);

describe("linkFlushMarkers", () => {
  it("links a marker fused to the word before it", () => {
    expect(linkFlushMarkers("severe diarrhoea112 followed", notes(112))).toBe(
      "severe diarrhoea[^112] followed"
    );
  });

  it("keeps the punctuation a marker follows", () => {
    expect(linkFlushMarkers("since childhood.1 He then", notes(1))).toBe(
      "since childhood.[^1] He then"
    );
  });

  it("leaves a number alone when no note near this page has it", () => {
    // The guard that makes this safe: a lookup, not a typographic guess.
    expect(linkFlushMarkers("severe diarrhoea112 followed", notes(9))).toBe(
      "severe diarrhoea112 followed"
    );
  });

  it("does not touch a citation like Section V.D.2", () => {
    // This exact corruption is why the first attempt at #103 was reverted.
    expect(linkFlushMarkers("see Section V.D.2 above", notes(2))).toBe(
      "see Section V.D.2 above"
    );
  });

  it("does not touch a bare year", () => {
    expect(linkFlushMarkers("in 1998 he left", notes(199, 1998))).toBe(
      "in 1998 he left"
    );
  });

  it("leaves an existing reference alone", () => {
    expect(linkFlushMarkers("evidence[^12] showed", notes(12))).toBe(
      "evidence[^12] showed"
    );
  });

  it("does nothing when no notes were collected", () => {
    expect(linkFlushMarkers("diarrhoea112", new Set())).toBe("diarrhoea112");
  });
});
