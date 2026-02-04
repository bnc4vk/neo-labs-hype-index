import { randomUUID } from "crypto";
import { maxDate, mergeAliases, normalizeName } from "../lib/normalize";
import { normalizeUrl } from "../lib/url";
import type {
  IngestCompany,
  IngestFundingRound,
  IngestPerson,
  IngestSource,
} from "../lib/types";
import type {
  IngestRepository,
  KnownCompany,
  UpsertCompanyResult,
  UpsertSourceResult,
} from "./types";

export type MemoryCompany = {
  id: string;
  name: string;
  canonical_domain?: string | null;
  website_url?: string | null;
  description?: string | null;
  focus?: string | null;
  employee_count?: number | null;
  known_revenue?: string | null;
  status: string;
  founded_year?: number | null;
  hq_location?: string | null;
  aliases: string[];
  last_verified_at?: Date | null;
  updated_at: Date;
};

export type MemorySource = {
  id: string;
  url: string;
  title?: string | null;
  publisher?: string | null;
  published_at?: Date | null;
  updated_at: Date;
};

export type MemoryPerson = {
  id: string;
  company_id: string;
  name: string;
  role?: string | null;
  is_founder: boolean;
  profile_url?: string | null;
  primary_source_id?: string | null;
  updated_at: Date;
};

export type MemoryFundingRound = {
  id: string;
  company_id: string;
  round_type?: string | null;
  amount_usd?: bigint | null;
  valuation_usd?: bigint | null;
  announced_at?: Date | null;
  investors: string[];
  source_id?: string | null;
  updated_at: Date;
};

export type MemoryCompanySource = {
  id: string;
  company_id: string;
  source_id: string;
  source_kind: string;
  updated_at: Date;
};

export class MemoryRepository implements IngestRepository {
  companies: MemoryCompany[] = [];
  sources: MemorySource[] = [];
  people: MemoryPerson[] = [];
  fundingRounds: MemoryFundingRound[] = [];
  companySources: MemoryCompanySource[] = [];

  async listCompanies(): Promise<KnownCompany[]> {
    return [...this.companies]
      .sort((a, b) => {
        const aTime = a.last_verified_at?.getTime() ?? 0;
        const bTime = b.last_verified_at?.getTime() ?? 0;
        return aTime - bTime;
      })
      .map((company) => ({
        id: company.id,
        name: company.name,
        canonical_domain: company.canonical_domain ?? null,
        website_url: company.website_url ?? null,
        aliases: company.aliases,
        last_verified_at: company.last_verified_at ?? null,
      }));
  }

  async upsertSource(source: IngestSource): Promise<UpsertSourceResult> {
    const normalizedUrl = normalizeUrl(source.url) ?? source.url;
    const existing = this.sources.find((item) => item.url === normalizedUrl);
    const now = new Date();

    if (existing) {
      existing.title = existing.title ?? source.title ?? null;
      existing.publisher = existing.publisher ?? source.publisher ?? null;
      existing.published_at = existing.published_at ?? source.publishedAt ?? null;
      existing.updated_at = now;
      return { record: { id: existing.id, url: existing.url }, created: false };
    }

    const record: MemorySource = {
      id: randomUUID(),
      url: normalizedUrl,
      title: source.title ?? null,
      publisher: source.publisher ?? null,
      published_at: source.publishedAt ?? null,
      updated_at: now,
    };

    this.sources.push(record);
    return { record: { id: record.id, url: record.url }, created: true };
  }

  async upsertCompany(company: IngestCompany): Promise<UpsertCompanyResult> {
    const normalizedName = normalizeName(company.name);
    const now = new Date();
    const aliases = mergeAliases(company.aliases ?? [], normalizedName ? [normalizedName] : []);

    let existing = company.canonicalDomain
      ? this.companies.find((item) => item.canonical_domain === company.canonicalDomain)
      : undefined;

    if (!existing && normalizedName) {
      existing = this.companies.find((item) => item.aliases.includes(normalizedName));
    }

    if (existing) {
      existing.website_url = existing.website_url ?? company.websiteUrl ?? null;
      existing.description = existing.description ?? company.description ?? null;
      existing.focus = existing.focus ?? company.focus ?? null;
      existing.employee_count = existing.employee_count ?? company.employeeCount ?? null;
      existing.known_revenue = existing.known_revenue ?? company.knownRevenue ?? null;
      existing.status = existing.status ?? company.status ?? "active";
      existing.founded_year = existing.founded_year ?? company.foundedYear ?? null;
      existing.hq_location = existing.hq_location ?? company.hqLocation ?? null;
      existing.aliases = mergeAliases(existing.aliases, aliases);
      existing.last_verified_at = maxDate(existing.last_verified_at ?? null, company.lastVerifiedAt ?? null);
      existing.updated_at = now;

      return {
        record: {
          id: existing.id,
          canonical_domain: existing.canonical_domain ?? null,
          last_verified_at: existing.last_verified_at ?? null,
          aliases: existing.aliases,
        },
        created: false,
      };
    }

    const record: MemoryCompany = {
      id: randomUUID(),
      name: company.name,
      canonical_domain: company.canonicalDomain ?? null,
      website_url: company.websiteUrl ?? null,
      description: company.description ?? null,
      focus: company.focus ?? null,
      employee_count: company.employeeCount ?? null,
      known_revenue: company.knownRevenue ?? null,
      status: company.status ?? "active",
      founded_year: company.foundedYear ?? null,
      hq_location: company.hqLocation ?? null,
      aliases,
      last_verified_at: company.lastVerifiedAt ?? null,
      updated_at: now,
    };

    this.companies.push(record);
    return {
      record: {
        id: record.id,
        canonical_domain: record.canonical_domain ?? null,
        last_verified_at: record.last_verified_at ?? null,
        aliases: record.aliases,
      },
      created: true,
    };
  }

  async linkCompanySource(
    companyId: string,
    sourceId: string,
    sourceKind: string,
  ): Promise<boolean> {
    const existing = this.companySources.find(
      (item) =>
        item.company_id === companyId &&
        item.source_id === sourceId &&
        item.source_kind === sourceKind,
    );

    if (existing) {
      existing.updated_at = new Date();
      return true;
    }

    this.companySources.push({
      id: randomUUID(),
      company_id: companyId,
      source_id: sourceId,
      source_kind: sourceKind,
      updated_at: new Date(),
    });

    return true;
  }

  async upsertPeople(
    companyId: string,
    people: IngestPerson[],
    sourceMap: Map<string, string>,
  ): Promise<number> {
    let upserted = 0;

    for (const person of people) {
      const normalizedName = normalizeName(person.name);
      if (!normalizedName) {
        continue;
      }

      const primarySourceId = person.primarySourceUrl
        ? sourceMap.get(normalizeUrl(person.primarySourceUrl) ?? person.primarySourceUrl) ?? null
        : null;

      const existing = this.people.find(
        (item) => item.company_id === companyId && normalizeName(item.name) === normalizedName,
      );

      if (existing) {
        existing.role = existing.role ?? person.role ?? null;
        existing.is_founder = existing.is_founder ?? person.isFounder ?? false;
        existing.profile_url = existing.profile_url ?? person.profileUrl ?? null;
        existing.primary_source_id = existing.primary_source_id ?? primarySourceId ?? null;
        existing.updated_at = new Date();
      } else {
        this.people.push({
          id: randomUUID(),
          company_id: companyId,
          name: person.name,
          role: person.role ?? null,
          is_founder: person.isFounder ?? false,
          profile_url: person.profileUrl ?? null,
          primary_source_id: primarySourceId ?? null,
          updated_at: new Date(),
        });
      }

      upserted += 1;
    }

    return upserted;
  }

  async upsertFundingRounds(
    companyId: string,
    rounds: IngestFundingRound[],
    sourceMap: Map<string, string>,
  ): Promise<number> {
    let upserted = 0;

    for (const round of rounds) {
      const announcedAt = round.announcedAt ?? null;
      const roundType = round.roundType ?? null;
      const amountUsd = round.amountUsd !== null && round.amountUsd !== undefined
        ? BigInt(round.amountUsd)
        : null;
      const valuationUsd = round.valuationUsd !== null && round.valuationUsd !== undefined
        ? BigInt(round.valuationUsd)
        : null;

      const existing = this.fundingRounds.find((item) => {
        if (announcedAt && item.announced_at) {
          return (
            item.company_id === companyId &&
            item.round_type === roundType &&
            item.announced_at.toDateString() === announcedAt.toDateString()
          );
        }

        return (
          item.company_id === companyId &&
          item.round_type === roundType &&
          item.amount_usd === amountUsd &&
          item.valuation_usd === valuationUsd
        );
      });

      const sourceId = round.sourceUrl
        ? sourceMap.get(normalizeUrl(round.sourceUrl) ?? round.sourceUrl) ?? null
        : null;

      if (existing) {
        existing.amount_usd = existing.amount_usd ?? amountUsd ?? null;
        existing.valuation_usd = existing.valuation_usd ?? valuationUsd ?? null;
        existing.investors = existing.investors.length ? existing.investors : round.investors ?? [];
        existing.source_id = existing.source_id ?? sourceId ?? null;
        existing.updated_at = new Date();
      } else {
        this.fundingRounds.push({
          id: randomUUID(),
          company_id: companyId,
          round_type: roundType,
          amount_usd: amountUsd,
          valuation_usd: valuationUsd,
          announced_at: announcedAt,
          investors: round.investors ?? [],
          source_id: sourceId ?? null,
          updated_at: new Date(),
        });
      }

      upserted += 1;
    }

    return upserted;
  }
}
