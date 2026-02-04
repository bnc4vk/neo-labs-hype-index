import { describe, expect, it } from "vitest";
import { parseSeedList } from "../src/lib/seed";

describe("seed list parsing", () => {
  it("ignores comments and blank lines", () => {
    const input = `# header\n\nPeriodic Labs\n# note\nWorld Labs\n`;
    expect(parseSeedList(input)).toEqual(["Periodic Labs", "World Labs"]);
  });
});
