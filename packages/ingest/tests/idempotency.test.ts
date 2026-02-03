import { describe, expect, it } from "vitest";
import { ingestCandidates } from "../src/lib/ingest";
import { MemoryRepository } from "../src/repo/memory";

const buildCandidate = () => {
  const publishedAt = new Date("2025-01-15T00:00:00Z");
  return {
    company: {
      name: "AlphaLab",
      aliases: ["alpha lab"],
      lastVerifiedAt: publishedAt,
    },
    sources: [
      {
        url: "https://techcrunch.com/2025/01/15/alphalab-raises-seed",
        title: "AlphaLab raises seed funding",
        publisher: "TechCrunch",
        publishedAt,
        sourceKind: "overview" as const,
      },
    ],
    people: [
      {
        name: "Jane Doe",
        isFounder: true,
        role: "CEO",
      },
    ],
    fundingRounds: [
      {
        roundType: "seed",
        amountUsd: 10000000,
        announcedAt: publishedAt,
        investors: ["Index Ventures"],
        sourceUrl: "https://techcrunch.com/2025/01/15/alphalab-raises-seed",
      },
    ],
  };
};

describe("ingestCandidates", () => {
  it("is idempotent when run twice", async () => {
    const repo = new MemoryRepository();
    const candidate = buildCandidate();

    await ingestCandidates(repo, [candidate]);
    await ingestCandidates(repo, [candidate]);

    expect(repo.companies).toHaveLength(1);
    expect(repo.sources).toHaveLength(1);
    expect(repo.companySources).toHaveLength(1);
    expect(repo.people).toHaveLength(1);
    expect(repo.fundingRounds).toHaveLength(1);
  });
});
