import { prisma } from "@neolabs/db";
import { mergeAliases, normalizeName, pickDefined } from "../lib/normalize";
import { normalizeUrl } from "../lib/url";
import type { FundingRoundInput, RefreshUpdate, SeedCompany, SourceInput } from "../lib/types";
import type { IngestRepository, KnownCompany, UpsertCompanyResult, UpsertSourceResult } from "./types";

const withUpdatedAt = <T extends Record<string, unknown>>(data: T) =>
  ({ ...data, updated_at: new Date() }) as T & { updated_at: Date };

const stripNullBytes = (value: string) => value.replace(/\u0000/g, "");

const sanitizeText = (value?: string | null) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const cleaned = stripNullBytes(value);
  const trimmed = cleaned.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeAliases = (company: SeedCompany) => {
  const aliases = company.alias ? [company.alias] : [];
  const normalizedName = normalizeName(company.name);
  return mergeAliases(aliases, normalizedName ? [normalizedName] : []);
};

export class PrismaRepository implements IngestRepository {
  async listCompanies(): Promise<KnownCompany[]> {
    return prisma.company.findMany({
      select: {
        id: true,
        name: true,
        canonical_domain: true,
        website_url: true,
        description: true,
        focus: true,
        employee_count: true,
        known_revenue: true,
        status: true,
        founded_year: true,
        hq_location: true,
        aliases: true,
        last_verified_at: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async upsertSeedCompany(company: SeedCompany): Promise<UpsertCompanyResult> {
    const normalizedName = normalizeName(company.name);
    let existing = null;

    if (normalizedName) {
      existing = await prisma.company.findFirst({
        where: {
          OR: [
            { aliases: { has: normalizedName } },
            { name: { equals: company.name, mode: "insensitive" } },
          ],
        },
      });
    } else {
      existing = await prisma.company.findFirst({
        where: { name: { equals: company.name, mode: "insensitive" } },
      });
    }

    const aliases = normalizeAliases(company);

    if (existing) {
      await prisma.company.update({
        where: { id: existing.id },
        data: withUpdatedAt({
          aliases: mergeAliases(existing.aliases, aliases),
        }),
      });
      return { record: { id: existing.id }, created: false };
    }

    const record = await prisma.company.create({
      data: withUpdatedAt({
        name: company.name,
        aliases,
      }),
    });

    return { record: { id: record.id }, created: true };
  }

  async updateCompanyFromRefresh(companyId: string, update: RefreshUpdate): Promise<void> {
    const data = pickDefined({
      canonical_domain: sanitizeText(update.canonicalDomain ?? undefined),
      website_url: sanitizeText(update.websiteUrl ?? undefined),
      description: sanitizeText(update.description ?? undefined),
      focus: sanitizeText(update.focus ?? undefined),
      employee_count: update.employeeCount ?? undefined,
      known_revenue: sanitizeText(update.knownRevenue ?? undefined),
      status: sanitizeText(update.status ?? undefined),
      founded_year: update.foundedYear ?? undefined,
      hq_location: sanitizeText(update.hqLocation ?? undefined),
      last_verified_at: update.lastVerifiedAt ?? undefined,
    });

    if (Object.keys(data).length === 0) {
      return;
    }

    await prisma.company.update({
      where: { id: companyId },
      data: withUpdatedAt(data),
    });
  }

  async upsertSource(source: SourceInput): Promise<UpsertSourceResult> {
    const normalizedUrl = normalizeUrl(source.url) ?? source.url;
    const existing = await prisma.source.findUnique({ where: { url: normalizedUrl } });
    const createData = {
      url: normalizedUrl,
      title: sanitizeText(source.title ?? undefined),
      publisher: sanitizeText(source.publisher ?? undefined),
      published_at: source.publishedAt ?? undefined,
    };
    const updateData = pickDefined({
      title: sanitizeText(source.title ?? undefined),
      publisher: sanitizeText(source.publisher ?? undefined),
      published_at: source.publishedAt ?? undefined,
    });

    if (existing) {
      const record = await prisma.source.update({
        where: { id: existing.id },
        data: withUpdatedAt(updateData),
      });
      return { record: { id: record.id, url: record.url }, created: false };
    }

    const record = await prisma.source.create({
      data: withUpdatedAt(createData),
    });

    return { record: { id: record.id, url: record.url }, created: true };
  }

  async linkCompanySource(companyId: string, sourceId: string, sourceKind: string): Promise<void> {
    await prisma.companySource.upsert({
      where: {
        company_id_source_id_source_kind: {
          company_id: companyId,
          source_id: sourceId,
          source_kind: sourceKind,
        },
      },
      create: withUpdatedAt({
        company_id: companyId,
        source_id: sourceId,
        source_kind: sourceKind,
      }),
      update: withUpdatedAt({}),
    });
  }

  async upsertFundingRound(companyId: string, input: FundingRoundInput): Promise<void> {
    const announcedAt = input.announcedAt ?? null;
    const roundType = sanitizeText(input.roundType ?? undefined) ?? null;
    const amountUsd = input.amountUsd !== null && input.amountUsd !== undefined
      ? BigInt(Math.round(input.amountUsd))
      : null;
    const valuationUsd = input.valuationUsd !== null && input.valuationUsd !== undefined
      ? BigInt(Math.round(input.valuationUsd))
      : null;
    const investors = input.investors ?? [];
    const sourceId = input.sourceId ?? null;

    let existing = null;
    if (announcedAt) {
      existing = await prisma.fundingRound.findFirst({
        where: {
          company_id: companyId,
          round_type: roundType,
          announced_at: announcedAt,
        },
      });
    }

    if (!existing) {
      existing = await prisma.fundingRound.findFirst({
        where: {
          company_id: companyId,
          round_type: roundType,
          amount_usd: amountUsd,
          valuation_usd: valuationUsd,
        },
      });
    }

    if (existing) {
      await prisma.fundingRound.update({
        where: { id: existing.id },
        data: withUpdatedAt({
          investors: investors.length ? investors : existing.investors,
          source_id: sourceId ?? existing.source_id,
        }),
      });
      return;
    }

    await prisma.fundingRound.create({
      data: withUpdatedAt({
        company_id: companyId,
        round_type: roundType,
        amount_usd: amountUsd ?? undefined,
        valuation_usd: valuationUsd ?? undefined,
        announced_at: announcedAt ?? undefined,
        investors,
        source_id: sourceId ?? undefined,
      }),
    });
  }
}
