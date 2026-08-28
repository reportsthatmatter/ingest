import { describe, expect, it } from "vitest";
import { popplerVersion, EXPECTED_POPPLER } from "../src/poppler";

describe("popplerVersion", () => {
  it("reads the version from a real install", () => {
    // `pdftotext -v` writes to stderr. Reading only stdout returned "unknown"
    // for a healthy install, which silently disabled drift detection and put
    // "poppler": "unknown" into every committed baseline.
    expect(popplerVersion()).toMatch(/^\d+\.\d+/);
  });

  it("pins a concrete version rather than a range", () => {
    expect(EXPECTED_POPPLER).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
