import { randomUUID } from "crypto";
import { mergeAliases, normalizeName } from "../lib/normalize";
import { normalizeUrl } from "../lib/url";
import type { RefreshUpdate, SeedCompany, SourceInput } from "../lib/types";
import type { IngestRepository, KnownCompany, UpsertCompanyResult, UpsertSourceResult } from "./types";

export type MemoryCompany = {
  id: string;
  name: string;
  canonical_domain?: string | null;
  website_url?: string | null;
  description?: string | null;
  focus?: string | null;
  employee_count?: number | null;
  known_revenue?: string | null;
  status?: string | null;
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
  companySources: MemoryCompanySource[] = [];

  async listCompanies(): Promise<KnownCompany[]> {
    return [...this.companies]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((company) => ({
        id: company.id,
        name: company.name,
        canonical_domain: company.canonical_domain ?? null,
        website_url: company.website_url ?? null,
        description: company.description ?? null,
        focus: company.focus ?? null,
        employee_count: company.employee_count ?? null,
        known_revenue: company.known_revenue ?? null,
        status: company.status ?? null,
        founded_year: company.founded_year ?? null,
        hq_location: company.hq_location ?? null,
        aliases: company.aliases,
        last_verified_at: company.last_verified_at ?? null,
      }));
  }

  async upsertSeedCompany(company: SeedCompany): Promise<UpsertCompanyResult> {
    const normalizedName = normalizeName(company.name);
    const aliasList = mergeAliases(company.alias ? [company.alias] : [], normalizedName ? [normalizedName] : []);
    const existing = normalizedName
      ? this.companies.find(
        (item) => item.aliases.includes(normalizedName) || item.name.toLowerCase() === company.name.toLowerCase(),
      )
      : this.companies.find((item) => item.name.toLowerCase() === company.name.toLowerCase());

    if (existing) {
      existing.aliases = mergeAliases(existing.aliases, aliasList);
      existing.updated_at = new Date();
      return { record: { id: existing.id }, created: false };
    }

    const record: MemoryCompany = {
      id: randomUUID(),
      name: company.name,
      aliases: aliasList,
      status: "active",
      updated_at: new Date(),
    };
    this.companies.push(record);
    return { record: { id: record.id }, created: true };
  }

  async updateCompanyFromRefresh(companyId: string, update: RefreshUpdate): Promise<void> {
    const company = this.companies.find((item) => item.id === companyId);
    if (!company) {
      return;
    }

    if (update.websiteUrl !== undefined) {
      company.website_url = update.websiteUrl ?? null;
    }
    if (update.canonicalDomain !== undefined) {
      company.canonical_domain = update.canonicalDomain ?? null;
    }
    if (update.description !== undefined) {
      company.description = update.description ?? null;
    }
    if (update.focus !== undefined) {
      company.focus = update.focus ?? null;
    }
    if (update.employeeCount !== undefined) {
      company.employee_count = update.employeeCount ?? null;
    }
    if (update.knownRevenue !== undefined) {
      company.known_revenue = update.knownRevenue ?? null;
    }
    if (update.status !== undefined) {
      company.status = update.status ?? null;
    }
    if (update.foundedYear !== undefined) {
      company.founded_year = update.foundedYear ?? null;
    }
    if (update.hqLocation !== undefined) {
      company.hq_location = update.hqLocation ?? null;
    }
    if (update.lastVerifiedAt !== undefined) {
      company.last_verified_at = update.lastVerifiedAt ?? null;
    }

    company.updated_at = new Date();
  }

  async upsertSource(source: SourceInput): Promise<UpsertSourceResult> {
    const normalizedUrl = normalizeUrl(source.url) ?? source.url;
    const existing = this.sources.find((item) => item.url === normalizedUrl);
    if (existing) {
      existing.title = existing.title ?? source.title ?? null;
      existing.publisher = existing.publisher ?? source.publisher ?? null;
      existing.published_at = existing.published_at ?? source.publishedAt ?? null;
      existing.updated_at = new Date();
      return { record: { id: existing.id, url: existing.url }, created: false };
    }

    const record: MemorySource = {
      id: randomUUID(),
      url: normalizedUrl,
      title: source.title ?? null,
      publisher: source.publisher ?? null,
      published_at: source.publishedAt ?? null,
      updated_at: new Date(),
    };
    this.sources.push(record);
    return { record: { id: record.id, url: record.url }, created: true };
  }

  async linkCompanySource(companyId: string, sourceId: string, sourceKind: string): Promise<void> {
    const existing = this.companySources.find(
      (item) =>
        item.company_id === companyId &&
        item.source_id === sourceId &&
        item.source_kind === sourceKind,
    );

    if (existing) {
      existing.updated_at = new Date();
      return;
    }

    this.companySources.push({
      id: randomUUID(),
      company_id: companyId,
      source_id: sourceId,
      source_kind: sourceKind,
      updated_at: new Date(),
    });
  }
}
