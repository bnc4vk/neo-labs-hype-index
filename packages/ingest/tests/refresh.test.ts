import { describe, expect, it } from "vitest";
import { applyRefreshUpdate } from "../src/lib/refresh";
import type { KnownCompany } from "../src/repo/types";

const baseCompany: KnownCompany = {
  id: "1",
  name: "Acme Labs",
  canonical_domain: "acme.ai",
  website_url: "https://acme.ai",
  description: "Existing description",
  focus: "Robotics",
  employee_count: 10,
  known_revenue: "low",
  status: "active",
  founded_year: 2020,
  hq_location: "SF",
  aliases: ["acme labs"],
  last_verified_at: null,
};

describe("applyRefreshUpdate", () => {
  it("overwrites dynamic fields and preserves static fields", () => {
    const { update, fundingRounds } = applyRefreshUpdate(baseCompany, {
      website_url: "https://new-acme.ai",
      canonical_domain: "new-acme.ai",
      description: "New description",
      focus: "AI",
      employee_count: 25,
      known_revenue: "medium",
      status: "stealth",
      founded_year: 2022,
      hq_location: "NYC",
      sources: [{ url: "https://example.com" }],
      funding_rounds: [
        {
          round_type: "seed",
          amount_usd: 1200000,
          valuation_usd: 8000000,
          announced_at: "2024-01-15",
          investors: ["A", "B"],
          source_url: "https://example.com/seed",
        },
      ],
    });

    expect(update?.websiteUrl).toBe("https://new-acme.ai");
    expect(update?.canonicalDomain).toBe("new-acme.ai");
    expect(update?.employeeCount).toBe(25);
    expect(update?.knownRevenue).toBe("medium");
    expect(update?.status).toBe("stealth");

    expect(update?.description).toBeUndefined();
    expect(update?.focus).toBeUndefined();
    expect(update?.foundedYear).toBeUndefined();
    expect(update?.hqLocation).toBeUndefined();
    expect(update?.lastVerifiedAt).toBeInstanceOf(Date);

    expect(fundingRounds.length).toBe(1);
    expect(fundingRounds[0].roundType).toBe("seed");
  });
});
