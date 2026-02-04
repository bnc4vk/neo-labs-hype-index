import { prisma } from "@neolabs/db";
import type { Company } from "@neolabs/db";
import { maxDate, mergeAliases, normalizeName, pickDefined } from "../lib/normalize";
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

const normalizeAliases = (company: IngestCompany) => {
  const aliases = company.aliases ?? [];
  const normalizedName = normalizeName(company.name);
  return mergeAliases(aliases, normalizedName ? [normalizedName] : []);
};

const coerceBigInt = (value?: bigint | number | null) => {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "bigint" ? value : BigInt(value);
};

const withUpdatedAt = <T extends Record<string, unknown>>(data: T) =>
  ({ ...data, updated_at: new Date() }) as T & { updated_at: Date };

export class PrismaRepository implements IngestRepository {
  async listCompanies(): Promise<KnownCompany[]> {
    const records = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        canonical_domain: true,
        website_url: true,
        aliases: true,
        last_verified_at: true,
      },
      orderBy: { last_verified_at: "asc" },
    });

    return records;
  }

  async upsertSource(source: IngestSource): Promise<UpsertSourceResult> {
    const normalizedUrl = normalizeUrl(source.url) ?? source.url;
    const existing = await prisma.source.findUnique({ where: { url: normalizedUrl } });
    const createData = {
      url: normalizedUrl,
      title: source.title ?? undefined,
      publisher: source.publisher ?? undefined,
      published_at: source.publishedAt ?? undefined,
    };
    const updateData = pickDefined({
      title: source.title ?? undefined,
      publisher: source.publisher ?? undefined,
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

  async upsertCompany(company: IngestCompany): Promise<UpsertCompanyResult> {
    const aliases = normalizeAliases(company);
    const canonicalDomain = company.canonicalDomain ?? undefined;

    let existing: Company | null = null;
    if (canonicalDomain) {
      existing = await prisma.company.findUnique({ where: { canonical_domain: canonicalDomain } });
    }

    if (!existing) {
      const normalizedName = normalizeName(company.name);
      if (normalizedName) {
        existing = await prisma.company.findFirst({
          where: {
            OR: [
              { aliases: { has: normalizedName } },
              { name: { equals: company.name, mode: "insensitive" } },
            ],
          },
        });
      }
    }

    const lastVerifiedAt = maxDate(existing?.last_verified_at, company.lastVerifiedAt ?? null);

    if (existing) {
      const record = await prisma.company.update({
        where: { id: existing.id },
        data: withUpdatedAt({
          name: existing.name,
          canonical_domain: existing.canonical_domain ?? canonicalDomain,
          website_url: existing.website_url ?? company.websiteUrl ?? undefined,
          description: existing.description ?? company.description ?? undefined,
          focus: existing.focus ?? company.focus ?? undefined,
          employee_count: existing.employee_count ?? company.employeeCount ?? undefined,
          known_revenue: existing.known_revenue ?? company.knownRevenue ?? undefined,
          status: existing.status ?? company.status ?? undefined,
          founded_year: existing.founded_year ?? company.foundedYear ?? undefined,
          hq_location: existing.hq_location ?? company.hqLocation ?? undefined,
          aliases: mergeAliases(existing.aliases, aliases),
          last_verified_at: lastVerifiedAt ?? undefined,
        }),
      });

      return { record: { id: record.id, canonical_domain: record.canonical_domain }, created: false };
    }

    const record = await prisma.company.create({
      data: withUpdatedAt({
        name: company.name,
        canonical_domain: canonicalDomain,
        website_url: company.websiteUrl ?? undefined,
        description: company.description ?? undefined,
        focus: company.focus ?? undefined,
        employee_count: company.employeeCount ?? undefined,
        known_revenue: company.knownRevenue ?? undefined,
        status: company.status ?? "active",
        founded_year: company.foundedYear ?? undefined,
        hq_location: company.hqLocation ?? undefined,
        aliases,
        last_verified_at: company.lastVerifiedAt ?? undefined,
      }),
    });

    return { record: { id: record.id, canonical_domain: record.canonical_domain }, created: true };
  }

  async linkCompanySource(
    companyId: string,
    sourceId: string,
    sourceKind: string,
  ): Promise<boolean> {
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

    return true;
  }

  async upsertPeople(
    companyId: string,
    people: IngestPerson[],
    sourceMap: Map<string, string>,
  ): Promise<number> {
    if (!people.length) {
      return 0;
    }

    const existing = await prisma.person.findMany({ where: { company_id: companyId } });
    const existingByName = new Map(
      existing.map((person) => [normalizeName(person.name), person]),
    );

    let upserted = 0;

    for (const person of people) {
      const normalizedName = normalizeName(person.name);
      if (!normalizedName) {
        continue;
      }

      const primarySourceId = person.primarySourceUrl
        ? sourceMap.get(normalizeUrl(person.primarySourceUrl) ?? person.primarySourceUrl) ?? null
        : null;

      const existingPerson = existingByName.get(normalizedName);
      if (existingPerson) {
        await prisma.person.update({
          where: { id: existingPerson.id },
          data: withUpdatedAt({
            role: existingPerson.role ?? person.role ?? undefined,
            is_founder: existingPerson.is_founder ?? person.isFounder ?? false,
            profile_url: existingPerson.profile_url ?? person.profileUrl ?? undefined,
            primary_source_id: existingPerson.primary_source_id ?? primarySourceId ?? undefined,
          }),
        });
        upserted += 1;
      } else {
        await prisma.person.create({
          data: withUpdatedAt({
            company_id: companyId,
            name: person.name,
            role: person.role ?? undefined,
            is_founder: person.isFounder ?? false,
            profile_url: person.profileUrl ?? undefined,
            primary_source_id: primarySourceId ?? undefined,
          }),
        });
        upserted += 1;
      }
    }

    return upserted;
  }

  async upsertFundingRounds(
    companyId: string,
    rounds: IngestFundingRound[],
    sourceMap: Map<string, string>,
  ): Promise<number> {
    if (!rounds.length) {
      return 0;
    }

    const existing = await prisma.fundingRound.findMany({ where: { company_id: companyId } });

    let upserted = 0;

    for (const round of rounds) {
      const announcedAt = round.announcedAt ?? null;
      const roundType = round.roundType ?? null;

      const match = existing.find((item) => {
        if (announcedAt && item.announced_at) {
          return (
            item.round_type === roundType &&
            item.announced_at?.toDateString() === announcedAt.toDateString()
          );
        }

        return (
          item.round_type === roundType &&
          item.amount_usd === coerceBigInt(round.amountUsd) &&
          item.valuation_usd === coerceBigInt(round.valuationUsd)
        );
      });

      const sourceId = round.sourceUrl
        ? sourceMap.get(normalizeUrl(round.sourceUrl) ?? round.sourceUrl) ?? null
        : null;

      if (match) {
        await prisma.fundingRound.update({
          where: { id: match.id },
          data: withUpdatedAt({
            amount_usd: match.amount_usd ?? coerceBigInt(round.amountUsd) ?? undefined,
            valuation_usd: match.valuation_usd ?? coerceBigInt(round.valuationUsd) ?? undefined,
            investors: match.investors.length ? match.investors : round.investors ?? undefined,
            source_id: match.source_id ?? sourceId ?? undefined,
          }),
        });
        upserted += 1;
      } else {
        await prisma.fundingRound.create({
          data: withUpdatedAt({
            company_id: companyId,
            round_type: round.roundType ?? undefined,
            amount_usd: coerceBigInt(round.amountUsd) ?? undefined,
            valuation_usd: coerceBigInt(round.valuationUsd) ?? undefined,
            announced_at: announcedAt ?? undefined,
            investors: round.investors ?? [],
            source_id: sourceId ?? undefined,
          }),
        });
        upserted += 1;
      }
    }

    return upserted;
  }
}
