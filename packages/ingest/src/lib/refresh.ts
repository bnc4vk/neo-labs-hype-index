import type { KnownCompany } from "../repo/types";
import type { ParallelCompanyOutput, RefreshUpdate, SourceInput } from "./types";
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

export const applyRefreshUpdate = (
  existing: KnownCompany,
  output: ParallelCompanyOutput | null,
): { update: RefreshUpdate | null; sources: SourceInput[] } => {
  if (!output) {
    return { update: null, sources: [] };
  }

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

  return { update, sources: Array.from(sourcesByUrl.values()).slice(0, 10) };
};
