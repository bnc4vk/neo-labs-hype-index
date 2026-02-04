import { describe, expect, it } from "vitest";
import { parseSeedList } from "../src/lib/seed";

describe("parseSeedList", () => {
  it("filters comments and empty lines", () => {
    const input = "# Comment\n\nAcme Labs\n  \n# Another\nBeta AI\n";
    expect(parseSeedList(input)).toEqual(["Acme Labs", "Beta AI"]);
  });
});
