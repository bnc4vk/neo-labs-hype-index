import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../src/lib/url";
import { normalizeName } from "../src/lib/normalize";

describe("normalizeUrl", () => {
  it("strips tracking params and fragments", () => {
    const input = "https://www.example.com/path/?utm_source=foo&gclid=bar#section";
    expect(normalizeUrl(input)).toBe("https://example.com/path");
  });

  it("preserves non-tracking params", () => {
    const input = "https://example.com/path/?ref=twitter&query=neolab";
    expect(normalizeUrl(input)).toBe("https://example.com/path?query=neolab");
  });
});

describe("normalizeName", () => {
  it("normalizes casing and punctuation", () => {
    expect(normalizeName("Neo-Lab AI, Inc.")).toBe("neo-lab ai inc");
  });
});
