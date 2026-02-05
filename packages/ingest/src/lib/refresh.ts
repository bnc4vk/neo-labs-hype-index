import type { KnownCompany } from "../repo/types";
import type { FundingRoundInput, ParallelCompanyOutput, ParallelFieldBasis, ParallelTaskResult, RefreshUpdate, SourceInput } from "./types";
import { getHostname, normalizeUrl } from "./url";

const normalizeOptional = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const coerceStatus = (value?: string | null) => {
  const normalized = normalizeOptional(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "active" || normalized === "stealth" || normalized === "inactive" || normalized === "unknown") {
    return normalized;
  }
  return null;
};

const coercePositiveInt = (value?: number | null) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
};

const coercePositiveMoney = (value?: number | null) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
};

const normalizeInvestors = (investors?: string[] | null) => {
  if (!Array.isArray(investors)) {
    return [];
  }
  const normalized = investors
    .map((entry) => (entry ?? "").trim())
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(normalized)).slice(0, 12);
};

const getBasisForFields = (basis: ParallelFieldBasis[] | null | undefined, fields: string[]) => {
  if (!basis?.length) {
    return null;
  }
  return basis.find((entry) => {
    const field = entry.field ?? "";
    return fields.includes(field);
  }) ?? null;
};

const getCitationUrl = (basis: ParallelFieldBasis | null) => {
  const citations = basis?.citations ?? [];
  const entry = citations.find((item) => item?.url);
  return entry?.url ?? null;
};

const hasCitation = (basis: ParallelFieldBasis | null) => {
  const citations = basis?.citations ?? [];
  return citations.some((item) => item?.url);
};

const extractCitationText = (citation: { [key: string]: unknown }) => {
  const candidates = [
    citation.excerpt,
    citation.quote,
    citation.snippet,
    citation.text,
  ];
  const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof match === "string" ? match : null;
};

const parseMoneyFromText = (text: string) => {
  const lowered = text.toLowerCase();
  if (!/(valuation|valued|post-money|pre-money|worth)/.test(lowered)) {
    return null;
  }
  const regex = /\$?\s*(\d+(?:\.\d+)?)\s*(billion|million|thousand|bn|m|b|k)?/gi;
  let best: number | null = null;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(text)) !== null) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      continue;
    }
    const unit = match[2]?.toLowerCase();
    let value = amount;
    if (unit === "b" || unit === "bn" || unit === "billion") value = amount * 1e9;
    if (unit === "m" || unit === "million") value = amount * 1e6;
    if (unit === "k" || unit === "thousand") value = amount * 1e3;
    if (!best || value > best) {
      best = value;
    }
  }
  return best;
};

const extractValuationFromBasis = (basis: ParallelFieldBasis[] | null | undefined) => {
  if (!basis?.length) {
    return null;
  }
  let best: { value: number; sourceUrl: string } | null = null;
  for (const entry of basis) {
    const citations = entry.citations ?? [];
    for (const citation of citations) {
      if (!citation?.url) continue;
      const text = extractCitationText(citation as Record<string, unknown>);
      if (!text) continue;
      const value = parseMoneyFromText(text);
      if (!value) continue;
      if (!best || value > best.value) {
        best = { value, sourceUrl: citation.url };
      }
    }
  }
  return best;
};

export const applyRefreshUpdate = (
  existing: KnownCompany,
  result: ParallelTaskResult | null,
): { update: RefreshUpdate | null; sources: SourceInput[]; fundingRounds: FundingRoundInput[] } => {
  if (!result?.content) {
    return { update: null, sources: [], fundingRounds: [] };
  }

  const output: ParallelCompanyOutput = result.content;
  const basis = result.basis ?? null;

  const websiteUrl = normalizeOptional(output.website_url);
  const canonicalDomain = normalizeOptional(output.canonical_domain)
    ?? (websiteUrl ? getHostname(websiteUrl) : null);

  const description = normalizeOptional(output.description);
  const focus = normalizeOptional(output.focus);
  const knownRevenue = normalizeOptional(output.known_revenue);
  const hqLocation = normalizeOptional(output.hq_location);
  const status = coerceStatus(output.status);
  const employeeCount = coercePositiveInt(output.employee_count);
  const foundedYear = coercePositiveInt(output.founded_year);
  const valuationBasis = getBasisForFields(basis, ["valuation_usd", "valuation"]);
  const valuationBasisHasCitation = hasCitation(valuationBasis);
  let valuationUsd = coercePositiveMoney(output.valuation_usd);
  const valuationAsOf = output.valuation_as_of ? new Date(output.valuation_as_of) : null;
  const valuationAsOfValid = Number.isNaN(valuationAsOf?.getTime() ?? NaN) ? null : valuationAsOf;
  let valuationSourceUrl = normalizeOptional(output.valuation_source_url);

  if (valuationUsd && !valuationBasisHasCitation) {
    valuationUsd = null;
  }

  if (valuationBasisHasCitation && !valuationSourceUrl) {
    valuationSourceUrl = normalizeOptional(getCitationUrl(valuationBasis));
  }

  if (!valuationUsd) {
    const extracted = extractValuationFromBasis(basis);
    if (extracted?.value) {
      valuationUsd = extracted.value;
      if (!valuationSourceUrl) {
        valuationSourceUrl = extracted.sourceUrl;
      }
    }
  }

  const update: RefreshUpdate = {
    lastVerifiedAt: new Date(),
  };

  if (websiteUrl) {
    update.websiteUrl = websiteUrl;
  }
  if (canonicalDomain) {
    update.canonicalDomain = canonicalDomain;
  }
  if (employeeCount !== null) {
    update.employeeCount = employeeCount;
  }
  if (knownRevenue) {
    update.knownRevenue = knownRevenue;
  }
  if (status) {
    update.status = status;
  }

  if (!existing.description && description) {
    update.description = description;
  }
  if (!existing.focus && focus) {
    update.focus = focus;
  }
  if (!existing.hq_location && hqLocation) {
    update.hqLocation = hqLocation;
  }
  if (!existing.founded_year && foundedYear) {
    update.foundedYear = foundedYear;
  }

  const sourcesByUrl = new Map<string, SourceInput>();
  const rawSources = Array.isArray(output.sources) ? output.sources : [];
  for (const source of rawSources) {
    const normalizedUrl = normalizeUrl(source.url) ?? source.url;
    if (!normalizedUrl) {
      continue;
    }
    const publishedAt = source.published_at ? new Date(source.published_at) : null;
    if (sourcesByUrl.has(normalizedUrl)) {
      continue;
    }
    sourcesByUrl.set(normalizedUrl, {
      url: normalizedUrl,
      title: normalizeOptional(source.title),
      publisher: normalizeOptional(source.publisher),
      publishedAt: Number.isNaN(publishedAt?.getTime() ?? NaN) ? null : publishedAt,
    });
  }

  const roundsByKey = new Map<string, FundingRoundInput>();
  const rawRounds = Array.isArray(output.funding_rounds) ? output.funding_rounds : [];
  const fundingBasis = getBasisForFields(basis, ["funding_rounds"]);
  const fundingHasCitation = hasCitation(fundingBasis);
  for (const round of rawRounds) {
    const roundType = normalizeOptional(round.round_type);
    const amountUsd = coercePositiveMoney(round.amount_usd);
    const valuationUsd = fundingHasCitation ? coercePositiveMoney(round.valuation_usd) : null;
    const announcedAt = round.announced_at ? new Date(round.announced_at) : null;
    const validAnnouncedAt = Number.isNaN(announcedAt?.getTime() ?? NaN) ? null : announcedAt;
    const investors = normalizeInvestors(round.investors);
    const sourceUrl = normalizeOptional(round.source_url);

    if (!roundType && !amountUsd && !valuationUsd) {
      continue;
    }

    const key = [
      roundType ?? "",
      validAnnouncedAt ? validAnnouncedAt.toISOString().slice(0, 10) : "",
      amountUsd ?? "",
      valuationUsd ?? "",
    ].join("|");

    if (roundsByKey.has(key)) {
      continue;
    }

    roundsByKey.set(key, {
      roundType,
      amountUsd,
      valuationUsd,
      announcedAt: validAnnouncedAt,
      investors: investors.length ? investors : null,
      sourceUrl,
    });
  }

  if (valuationUsd) {
    const key = [
      "valuation",
      valuationAsOfValid ? valuationAsOfValid.toISOString().slice(0, 10) : "",
      valuationUsd,
    ].join("|");

    if (!roundsByKey.has(key)) {
      roundsByKey.set(key, {
        roundType: "valuation",
        amountUsd: null,
        valuationUsd,
        announcedAt: valuationAsOfValid,
        investors: null,
        sourceUrl: valuationSourceUrl,
      });
    }
  }

  return {
    update,
    sources: Array.from(sourcesByUrl.values()).slice(0, 10),
    fundingRounds: Array.from(roundsByKey.values()).slice(0, 5),
  };
};
