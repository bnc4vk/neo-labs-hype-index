import { describe, expect, it } from "vitest";
import { compareCandidates, parseBenchmarkList } from "../src/lib/benchmark";

describe("benchmark list parsing", () => {
  it("preserves order and ignores comments", () => {
    const input = `# header\nPeriodic Labs\n\n# note\nWorld Labs\nSafe Superintelligence\n`;
    expect(parseBenchmarkList(input)).toEqual([
      "Periodic Labs",
      "World Labs",
      "Safe Superintelligence",
    ]);
  });
});

describe("recency-weighted comparison", () => {
  it("weights newer matches higher than older ones", () => {
    const known = ["Old Lab", "New Lab"];
    const comparison = compareCandidates(["New Lab"], known);

    expect(comparison.matchRate).toBeCloseTo(0.5);
    expect(comparison.weightedMatchRate).toBeCloseTo(2 / 3);
    expect(comparison.matchedWeight).toBe(2);
    expect(comparison.totalWeight).toBe(3);
  });
});
