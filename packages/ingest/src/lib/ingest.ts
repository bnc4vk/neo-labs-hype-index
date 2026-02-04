import * as cheerio from "cheerio";
import {
  ALLOWED_DOMAINS,
  DENYLIST_DOMAINS,
  DISCOVERY_PAGES,
  DIRECTORY_DOMAINS,
  RSS_FEEDS,
  SEARCH_QUERIES,
} from "../config/sources";
import { extractCompanyName } from "./extract";
import { resolveCompanyName } from "./entity-resolution";
import { fetchHtml } from "./fetcher";
import { normalizeName } from "./normalize";
import { isLikelyCompanyName, scoreNeolabRelevance } from "./neolab";
import { fetchRssItems } from "./rss";
import { searchTavily } from "./tavily";
import {
  getAllowlistFollowupEnabled,
  getKnownCompanyLimit,
  getKnownQueryLimit,
  getLookbackDays,
  getSearchSettings,
  getSeedLimit,
  getSeedQueryLimit,
  shouldForceSearch,
} from "./settings";
import type {
  IngestCandidate,
  IngestSource,
  IngestSummary,
  SourceOrigin,
  SourcePipeline,
} from "./types";
import { getHostname, isAllowedDomain, isDeniedDomain, isFetchAllowed, normalizeUrl } from "./url";
import type { IngestRepository, KnownCompany } from "../repo/types";

const MIN_CANDIDATES = 6;
const MIN_SOURCE_SCORE = 2;
const MIN_CANDIDATE_SCORE = 2;
const MIN_PORTFOLIO_SCORE = 1;
const MAX_SOURCES_TO_PARSE = 400;
const MAX_DISCOVERY_LINKS_PER_PAGE = 120;
const MAX_ALLOWLIST_FOLLOWUPS = 3;
const MAX_FOLLOWUP_RESULTS = 4;

const isRecent = (date?: Date | null) => {
  if (!date) {
    return true;
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - getLookbackDays());
  return date >= cutoff;
};

const mergeSources = (base: IngestSource, incoming: IngestSource): IngestSource => ({
  url: base.url,
  title: base.title ?? incoming.title ?? null,
  publisher: base.publisher ?? incoming.publisher ?? null,
  publishedAt: base.publishedAt ?? incoming.publishedAt ?? null,
  snippet: base.snippet ?? incoming.snippet ?? null,
  sourceKind: base.sourceKind ?? incoming.sourceKind,
  origin: base.origin ?? incoming.origin,
  pipeline: base.pipeline ?? incoming.pipeline,
});

const dedupeSources = (sources: IngestSource[]) => {
  const seen = new Map<string, IngestSource>();

  for (const source of sources) {
    const normalized = normalizeUrl(source.url) ?? source.url;
    const existing = seen.get(normalized);
    if (existing) {
      seen.set(normalized, mergeSources(existing, { ...source, url: normalized }));
    } else {
      seen.set(normalized, { ...source, url: normalized });
    }
  }

  return Array.from(seen.values());
};

const collectFromRss = async (pipeline: SourcePipeline): Promise<IngestSource[]> => {
  const items = await fetchRssItems(RSS_FEEDS);
  const sources: IngestSource[] = [];

  for (const item of items) {
    if (!item.link || !item.title) {
      continue;
    }

    if (!isRecent(item.publishedAt)) {
      continue;
    }

    const relevance = scoreNeolabRelevance({ title: item.title, snippet: item.snippet });
    if (relevance.score < MIN_SOURCE_SCORE) {
      continue;
    }

    sources.push({
      url: item.link,
      title: item.title,
      publisher: item.feedTitle ?? getHostname(item.link) ?? null,
      publishedAt: item.publishedAt ?? undefined,
      snippet: item.snippet ?? undefined,
      sourceKind: "overview",
      origin: "rss",
      pipeline,
    });
  }

  return sources;
};

const collectFromDiscoveryPages = async (pipeline: SourcePipeline): Promise<IngestSource[]> => {
  const sources: IngestSource[] = [];

  for (const pageUrl of DISCOVERY_PAGES) {
    if (!isFetchAllowed(pageUrl, ALLOWED_DOMAINS, DENYLIST_DOMAINS)) {
      continue;
    }

    try {
      // Include the discovery page itself as a source (useful for portfolio directories).
      sources.push({
        url: pageUrl,
        title: null,
        publisher: getHostname(pageUrl) ?? null,
        sourceKind: "overview",
        origin: "discovery",
        pipeline,
      });

      const html = await fetchHtml(pageUrl);
      const $ = cheerio.load(html);
      const host = getHostname(pageUrl);
      const title = $("title").first().text().trim() || null;

      let added = 0;
      $("a[href]").each((_, element) => {
        if (added >= MAX_DISCOVERY_LINKS_PER_PAGE) {
          return;
        }
        const href = $(element).attr("href");
        const text = $(element).text().trim();
        if (!href) {
          return;
        }
        if (href.startsWith("mailto:")) {
          return;
        }

        let absolute: string;
        try {
          absolute = new URL(href, pageUrl).toString();
        } catch {
          return;
        }

        if (!isFetchAllowed(absolute, ALLOWED_DOMAINS, DENYLIST_DOMAINS)) {
          return;
        }

        sources.push({
          url: absolute,
          title: text || title || null,
          publisher: host ?? null,
          sourceKind: "overview",
          origin: "discovery",
          pipeline,
        });
        added += 1;
      });
    } catch (error) {
      console.warn(`Discovery fetch failed for ${pageUrl}:`, error instanceof Error ? error.message : error);
    }
  }

  return sources;
};

type SearchCollectionOptions = {
  queries: string[];
  origin: SourceOrigin;
  pipeline: SourcePipeline;
};

const collectFromSearch = async (options: SearchCollectionOptions): Promise<IngestSource[]> => {
  const provider = process.env.SEARCH_PROVIDER?.toLowerCase();
  const apiKey = process.env.SEARCH_API_KEY;

  if (provider !== "tavily" || !apiKey) {
    return [];
  }

  const sources: IngestSource[] = [];
  const { topic, depth, maxResults } = getSearchSettings();
  const followupEnabled = getAllowlistFollowupEnabled();
  const followupQueries = new Set<string>();
  let followupCount = 0;

  for (const query of options.queries) {
    try {
      const results = await searchTavily(query, apiKey, {
        days: getLookbackDays(),
        topic,
        maxResults,
        searchDepth: depth,
      });
      if (process.env.INGEST_DEBUG_SEARCH === "1") {
        for (const result of results) {
          console.log("[ingest][search]", query, result.title ?? "", result.url ?? "");
        }
      }
      for (const result of results) {
        if (!result.url) {
          continue;
        }

        const relevance = scoreNeolabRelevance({ title: result.title, snippet: null });
        if (relevance.score < MIN_SOURCE_SCORE) {
          continue;
        }

        sources.push({
          url: result.url,
          title: result.title ?? null,
          publisher: result.publisher ?? getHostname(result.url) ?? null,
          publishedAt: result.publishedAt ?? undefined,
          sourceKind: "overview",
          origin: options.origin,
          pipeline: options.pipeline,
          query,
        });

        if (
          followupEnabled &&
          followupCount < MAX_ALLOWLIST_FOLLOWUPS &&
          !isFetchAllowed(result.url, ALLOWED_DOMAINS, DENYLIST_DOMAINS)
        ) {
          const nameHint = result.title ? extractCompanyName(result.title) : null;
          const followupQuery = nameHint ? `\"${nameHint}\"` : query;
          if (!followupQueries.has(followupQuery)) {
            followupQueries.add(followupQuery);
            followupCount += 1;
            try {
              const followupResults = await searchTavily(followupQuery, apiKey, {
                days: getLookbackDays(),
                topic,
                maxResults: MAX_FOLLOWUP_RESULTS,
                searchDepth: depth,
              });
              for (const followup of followupResults) {
                if (!followup.url) {
                  continue;
                }
                if (!isFetchAllowed(followup.url, ALLOWED_DOMAINS, DENYLIST_DOMAINS)) {
                  continue;
                }
                const followupRelevance = scoreNeolabRelevance({
                  title: followup.title,
                  snippet: null,
                });
                if (followupRelevance.score < MIN_SOURCE_SCORE) {
                  continue;
                }
                sources.push({
                  url: followup.url,
                  title: followup.title ?? null,
                  publisher: followup.publisher ?? getHostname(followup.url) ?? null,
                  publishedAt: followup.publishedAt ?? undefined,
                  sourceKind: "overview",
                  origin: "allowlist_followup",
                  pipeline: options.pipeline,
                  query,
                });
              }
            } catch (error) {
              console.warn(
                `Tavily allowlist followup failed for query \"${followupQuery}\":`,
                error instanceof Error ? error.message : error,
              );
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Tavily search failed for query "${query}":`, error instanceof Error ? error.message : error);
    }
  }

  return sources;
};

const PUBLISHER_NAME_DENYLIST = new Set([
  "techcrunch",
  "venturebeat",
  "wired",
  "axios",
  "a16z",
  "andreessen horowitz",
  "index ventures",
  "sequoia capital",
  "wikipedia",
]);

const mapWithConcurrency = async <TInput, TOutput>(
  inputs: TInput[],
  concurrency: number,
  fn: (input: TInput, index: number) => Promise<TOutput>,
) => {
  const results: TOutput[] = new Array(inputs.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= inputs.length) {
        return;
      }
      results[current] = await fn(inputs[current], current);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, worker);
  await Promise.all(workers);
  return results;
};

const extractExternalWebsite = (html: string, pageUrl: string) => {
  const $ = cheerio.load(html);
  const pageHost = getHostname(pageUrl);
  if (!pageHost) {
    return null;
  }

  const allowlist = ALLOWED_DOMAINS;
  const denylist = DENYLIST_DOMAINS;

  const candidates: Array<{ url: string; score: number }> = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }
    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    const host = getHostname(absolute);
    if (!host) {
      return;
    }
    if (host === pageHost) {
      return;
    }
    if (isDeniedDomain(host, denylist)) {
      return;
    }
    if (isAllowedDomain(host, allowlist)) {
      return;
    }

    const text = $(element).text().trim().toLowerCase();
    let score = 0;
    if (text.includes("website") || text.includes("home") || text.includes("visit")) {
      score += 2;
    }
    if (text.length > 0 && text.length <= 40) {
      score += 1;
    }
    candidates.push({ url: absolute, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url ?? null;
};

const extractNameFromUrl = (url: string) => {
  const host = getHostname(url);
  if (!host) {
    return null;
  }

  const parts = host.split(".");
  if (parts.length < 2) {
    return null;
  }

  let domain = parts[parts.length - 2] ?? "";
  if (!domain) {
    return null;
  }

  const suffixes = ["labs", "lab", "ai", "research", "intelligence", "math"];
  for (const suffix of suffixes) {
    if (domain.endsWith(suffix) && domain.length > suffix.length + 1) {
      domain = `${domain.slice(0, -suffix.length)} ${suffix}`;
      break;
    }
  }

  const cleaned = domain.replace(/[-_]+/g, " ").replace(/\d+/g, " ").trim();
  if (!cleaned) {
    return null;
  }

  const stopWords = new Set(["www", "home", "homepage", "index", "blog", "news", "app", "site", "official"]);
  const tokens = cleaned.split(/\s+/g).filter((token) => token && !stopWords.has(token));
  if (!tokens.length) {
    return null;
  }

  return tokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(" ");
};

const extractCompanyNamesFromJsonLd = (html: string) => {
  const $ = cheerio.load(html);
  const names = new Set<string>();

  const addName = (value: unknown) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (PUBLISHER_NAME_DENYLIST.has(trimmed.toLowerCase())) {
      return;
    }
    names.add(trimmed);
  };

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    const types = Array.isArray(type) ? type : type ? [type] : [];

    if (types.some((t) => typeof t === "string" && t.toLowerCase() === "organization")) {
      addName(record["name"]);
    }

    const fieldsToSearch = ["mentions", "about", "mainEntityOfPage", "mainEntity"];
    for (const field of fieldsToSearch) {
      const value = record[field];
      if (Array.isArray(value)) {
        for (const entry of value) {
          visit(entry);
        }
      } else if (value) {
        visit(value);
      }
    }

    // Some JSON-LD nests graph nodes
    const graph = record["@graph"];
    if (Array.isArray(graph)) {
      for (const entry of graph) {
        visit(entry);
      }
    }
  };

  $("script[type=\"application/ld+json\"]").each((_, element) => {
    const raw = $(element).text();
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        parsed.forEach(visit);
      } else {
        visit(parsed);
      }
    } catch {
      // ignore invalid JSON-LD blobs
    }
  });

  return Array.from(names);
};

const extractPortfolioCompanies = (html: string, pageUrl: string) => {
  const $ = cheerio.load(html);
  const pageHost = getHostname(pageUrl);
  if (!pageHost) {
    return [];
  }

  const stopText = new Set([
    "learn more",
    "read more",
    "portfolio",
    "careers",
    "about",
    "contact",
    "privacy",
    "terms",
  ]);

  const companies: Array<{ name: string; websiteUrl?: string | null; score: number }> = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).toString();
    } catch {
      return;
    }

    const host = getHostname(absolute);
    if (!host) {
      return;
    }

    // We want external company websites, but never fetch them.
    if (host === pageHost) {
      return;
    }
    if (isDeniedDomain(host, DENYLIST_DOMAINS)) {
      return;
    }
    if (isAllowedDomain(host, ALLOWED_DOMAINS)) {
      return;
    }

    const rawText =
      $(element).attr("aria-label") ??
      $(element).attr("title") ??
      $(element).find("img[alt]").attr("alt") ??
      $(element).text();
    const name = (rawText ?? "").trim();
    const lowered = name.toLowerCase();
    if (!name || stopText.has(lowered)) {
      return;
    }
    if (!isLikelyCompanyName(name)) {
      return;
    }

    // Use surrounding card text as a proxy for category/description.
    const context = $(element)
      .closest("article, li, section, div")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const relevance = scoreNeolabRelevance({ title: name, snippet: context });

    companies.push({ name, websiteUrl: absolute, score: relevance.score });
  });

  companies.sort((a, b) => b.score - a.score);

  // Keep the most relevant companies first and cap to avoid accidental explosions.
  return companies.filter((company) => company.score >= MIN_PORTFOLIO_SCORE).slice(0, 60);
};

const DIRECTORY_PATH_HINTS = [
  "/startup",
  "/startups",
  "/company",
  "/companies",
  "/organization",
  "/org",
  "/profile",
];

const DIRECTORY_STOP_TEXT = new Set([
  "startups",
  "startup",
  "companies",
  "company",
  "directory",
  "view",
  "see more",
  "learn more",
  "read more",
]);

const extractDirectoryCompanies = (html: string, pageUrl: string) => {
  const $ = cheerio.load(html);
  const pageHost = getHostname(pageUrl);
  if (!pageHost) {
    return [];
  }

  const companies: Array<{ name: string; websiteUrl?: string | null; score: number }> = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).toString();
    } catch {
      return;
    }

    const host = getHostname(absolute);
    const path = (() => {
      try {
        return new URL(absolute).pathname.toLowerCase();
      } catch {
        return "";
      }
    })();

    if (!DIRECTORY_PATH_HINTS.some((hint) => path.includes(hint))) {
      return;
    }

    const rawText =
      $(element).attr("aria-label") ??
      $(element).attr("title") ??
      $(element).find("img[alt]").attr("alt") ??
      $(element).text();
    const name = (rawText ?? "").trim();
    const lowered = name.toLowerCase();
    if (!name || DIRECTORY_STOP_TEXT.has(lowered)) {
      return;
    }
    if (!isLikelyCompanyName(name)) {
      return;
    }

    const normalized = normalizeName(name);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    const context = $(element)
      .closest("article, li, section, div")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const relevance = scoreNeolabRelevance({ title: name, snippet: context });
    if (relevance.score < MIN_PORTFOLIO_SCORE) {
      return;
    }

    seen.add(normalized);
    companies.push({
      name,
      websiteUrl: host && host !== pageHost ? absolute : undefined,
      score: relevance.score,
    });
  });

  companies.sort((a, b) => b.score - a.score);
  return companies.slice(0, 80);
};

const buildCandidatesFromSource = async (source: IngestSource): Promise<IngestCandidate[]> => {
  const normalizedSourceUrl = normalizeUrl(source.url) ?? source.url;
  const sourceWithNormalizedUrl: IngestSource = { ...source, url: normalizedSourceUrl };
  const host = getHostname(normalizedSourceUrl) ?? "";
  const isA16zPortfolio = host.endsWith("a16z.com") && normalizedSourceUrl.includes("/portfolio");
  const isDirectory = isAllowedDomain(host, DIRECTORY_DOMAINS);

  const canFetch = isFetchAllowed(normalizedSourceUrl, ALLOWED_DOMAINS, DENYLIST_DOMAINS);
  let jsonLdCompanyNames: string[] = [];
  const fallbackNames: string[] = [];
  let websiteUrl: string | null = null;
  let metaSnippet: string | null = null;

  if (canFetch) {
    try {
      const html = await fetchHtml(normalizedSourceUrl, 10000);
      if (isA16zPortfolio) {
        const portfolioCompanies = extractPortfolioCompanies(html, normalizedSourceUrl);
        return portfolioCompanies.map((company) => ({
          company: {
            name: company.name,
            websiteUrl: company.websiteUrl ?? undefined,
            aliases: [normalizeName(company.name)],
            lastVerifiedAt: source.publishedAt ?? null,
          },
          sources: [sourceWithNormalizedUrl],
        })).filter((candidate) => Boolean(candidate.company.aliases?.[0]));
      }

      if (isDirectory) {
        const directoryCompanies = extractDirectoryCompanies(html, normalizedSourceUrl);
        return directoryCompanies.map((company) => ({
          company: {
            name: company.name,
            websiteUrl: company.websiteUrl ?? undefined,
            aliases: [normalizeName(company.name)],
            lastVerifiedAt: source.publishedAt ?? null,
          },
          sources: [sourceWithNormalizedUrl],
        })).filter((candidate) => Boolean(candidate.company.aliases?.[0]));
      }

      const $ = cheerio.load(html);
      metaSnippet =
        $("meta[name=\"description\"]").attr("content") ??
        $("meta[property=\"og:description\"]").attr("content") ??
        null;

      jsonLdCompanyNames = extractCompanyNamesFromJsonLd(html);
      websiteUrl = extractExternalWebsite(html, normalizedSourceUrl);
      if (source.title) {
        const fallback = extractCompanyName(source.title) ?? source.title;
        if (fallback) {
          fallbackNames.push(fallback);
        }
      }
    } catch (error) {
      console.warn(`[ingest] fetch failed for ${normalizedSourceUrl}:`, error instanceof Error ? error.message : error);
    }
  } else {
    // For non-fetchable sources, fall back to the title itself.
    if (source.title) {
      const fallback = extractCompanyName(source.title) ?? source.title;
      fallbackNames.push(fallback);
    }
  }

  if (jsonLdCompanyNames.length === 0 && fallbackNames.length === 0) {
    const derived = extractNameFromUrl(normalizedSourceUrl);
    if (derived) {
      fallbackNames.push(derived);
    }
  }

  const resolution = await resolveCompanyName({
    url: normalizedSourceUrl,
    title: source.title,
    snippet: source.snippet ?? null,
    metaSnippet,
    jsonLdNames: jsonLdCompanyNames,
    fallbackNames,
  });

  const extractedCompanyNames = resolution.companyNames.length
    ? resolution.companyNames
    : fallbackNames;

  const candidates: IngestCandidate[] = [];
  const seenNames = new Set<string>();

  for (const name of extractedCompanyNames) {
    if (!isLikelyCompanyName(name)) {
      continue;
    }

    const candidateRelevance = scoreNeolabRelevance({
      title: source.title ?? name,
      snippet: [source.snippet, metaSnippet].filter(Boolean).join(" "),
    });
    if (candidateRelevance.score < MIN_CANDIDATE_SCORE) {
      continue;
    }

    const normalized = normalizeName(name);
    if (!normalized || seenNames.has(normalized)) {
      continue;
    }
    seenNames.add(normalized);

    candidates.push({
      company: {
        name,
        websiteUrl: websiteUrl ?? undefined,
        aliases: [normalized],
        lastVerifiedAt: source.publishedAt ?? null,
      },
      sources: [sourceWithNormalizedUrl],
    });
  }

  return candidates;
};

export const ingestCandidates = async (
  repository: IngestRepository,
  candidates: IngestCandidate[],
): Promise<IngestSummary> => {
  const summary: IngestSummary = {
    companiesCreated: 0,
    companiesUpdated: 0,
    sourcesUpserted: 0,
    companySourcesLinked: 0,
    peopleUpserted: 0,
    fundingRoundsUpserted: 0,
  };

  const sourceMap = new Map<string, string>();
  const uniqueSources = new Map<string, IngestSource>();
  for (const candidate of candidates) {
    for (const source of candidate.sources) {
      const normalized = normalizeUrl(source.url) ?? source.url;
      if (!uniqueSources.has(normalized)) {
        uniqueSources.set(normalized, { ...source, url: normalized });
      }
    }
  }

  console.log(`[ingest] upserting ${uniqueSources.size} sources`);
  for (const [url, source] of uniqueSources.entries()) {
    const result = await repository.upsertSource(source);
    summary.sourcesUpserted += 1;
    sourceMap.set(url, result.record.id);
  }

  let index = 0;
  for (const candidate of candidates) {
    index += 1;
    console.log(`[ingest] processing ${index}/${candidates.length}: ${candidate.company.name}`);

    const companyResult = await repository.upsertCompany(candidate.company);
    if (companyResult.created) {
      summary.companiesCreated += 1;
    } else {
      summary.companiesUpdated += 1;
    }

    for (const source of candidate.sources) {
      const normalizedUrl = normalizeUrl(source.url) ?? source.url;
      const sourceId = sourceMap.get(normalizedUrl);
      if (!sourceId) {
        continue;
      }
      const linked = await repository.linkCompanySource(
        companyResult.record.id,
        sourceId,
        source.sourceKind ?? "overview",
      );
      if (linked) {
        summary.companySourcesLinked += 1;
      }
    }

    if (candidate.people?.length) {
      summary.peopleUpserted += await repository.upsertPeople(
        companyResult.record.id,
        candidate.people,
        sourceMap,
      );
    }

    if (candidate.fundingRounds?.length) {
      summary.fundingRoundsUpserted += await repository.upsertFundingRounds(
        companyResult.record.id,
        candidate.fundingRounds,
        sourceMap,
      );
    }
  }

  return summary;
};

export type CandidateCollection = {
  candidates: IngestCandidate[];
  sources: IngestSource[];
};

const parseSourcesToCandidates = async (
  sources: IngestSource[],
  label: string,
): Promise<CandidateCollection> => {
  const deduped = dedupeSources(sources);
  const sourcesToParse = deduped.slice(0, MAX_SOURCES_TO_PARSE);
  console.log(
    `[ingest] parsing ${label} sources for company candidates: ${sourcesToParse.length}/${deduped.length}`,
  );
  const candidatesNested = await mapWithConcurrency(sourcesToParse, 4, async (source, index) => {
    const host = getHostname(source.url) ?? "unknown";
    console.log(`[ingest] parse ${index + 1}/${sourcesToParse.length}: ${host}`);
    return buildCandidatesFromSource(source);
  });
  const candidates = candidatesNested.flat();
  console.log(`[ingest] candidates prepared (${label}): ${candidates.length}`);
  return { candidates, sources: sourcesToParse };
};

const collectSourcesForNewDiscoveries = async (): Promise<IngestSource[]> => {
  console.log("[ingest] fetching RSS feeds");
  const rssSources = await collectFromRss("new_discovery");
  console.log(`[ingest] RSS items collected: ${rssSources.length}`);
  let sources = dedupeSources(rssSources);

  console.log("[ingest] fetching discovery pages");
  const discoverySources = await collectFromDiscoveryPages("new_discovery");
  sources = dedupeSources([...sources, ...discoverySources]);
  console.log(`[ingest] discovery items collected: ${discoverySources.length}`);

  const forceSearch = shouldForceSearch();
  if (forceSearch || sources.length < MIN_CANDIDATES) {
    console.log("[ingest] running Tavily fallback");
    const searchSources = await collectFromSearch({
      queries: SEARCH_QUERIES,
      origin: "search",
      pipeline: "new_discovery",
    });
    sources = dedupeSources([...sources, ...searchSources]);
    console.log(`[ingest] Tavily items collected: ${searchSources.length}`);
  }

  const ranked = sources
    .map((source) => {
      const score = scoreNeolabRelevance({
        title: source.title ?? null,
        snippet: source.snippet ?? null,
      }).score;
      const publishedAt = source.publishedAt?.getTime() ?? 0;
      return { source, score, publishedAt };
    })
    .sort((a, b) => (b.score - a.score) || (b.publishedAt - a.publishedAt));

  const mustInclude = new Map<string, IngestSource>();
  for (const pageUrl of DISCOVERY_PAGES) {
    const normalized = normalizeUrl(pageUrl) ?? pageUrl;
    const found = sources.find((source) => (normalizeUrl(source.url) ?? source.url) === normalized);
    if (found) {
      mustInclude.set(normalized, { ...found, url: normalized });
    } else {
      mustInclude.set(normalized, {
        url: normalized,
        title: null,
        publisher: getHostname(normalized) ?? null,
        sourceKind: "overview",
        origin: "discovery",
        pipeline: "new_discovery",
      });
    }
  }

  const sourcesToParse: IngestSource[] = [];
  for (const source of mustInclude.values()) {
    sourcesToParse.push(source);
  }
  for (const entry of ranked) {
    const normalized = normalizeUrl(entry.source.url) ?? entry.source.url;
    if (mustInclude.has(normalized)) {
      continue;
    }
    sourcesToParse.push(entry.source);
    if (sourcesToParse.length >= MAX_SOURCES_TO_PARSE) {
      break;
    }
  }

  return sourcesToParse;
};

const buildKnownQueries = (company: KnownCompany) => {
  const queries: string[] = [];
  const name = company.name.trim();
  if (!name) {
    return queries;
  }

  const domainHint = company.canonical_domain
    ?? (company.website_url ? getHostname(company.website_url) : null);
  const base = domainHint ? `\"${name}\" ${domainHint}` : `\"${name}\"`;
  queries.push(base);

  if (getKnownQueryLimit() > 1) {
    queries.push(`\"${name}\" funding`);
  }

  return queries.slice(0, getKnownQueryLimit());
};

const collectSourcesForKnownUpdates = async (
  knownCompanies: KnownCompany[],
): Promise<IngestSource[]> => {
  if (!knownCompanies.length) {
    return [];
  }

  const limit = getKnownCompanyLimit();
  const selected = limit ? knownCompanies.slice(0, limit) : knownCompanies;
  const queries = new Set<string>();
  for (const company of selected) {
    for (const query of buildKnownQueries(company)) {
      queries.add(query);
    }
  }
  if (!queries.size) {
    return [];
  }

  console.log(`[ingest] running known-company searches: ${queries.size}`);
  return collectFromSearch({
    queries: Array.from(queries),
    origin: "search",
    pipeline: "known_updates",
  });
};

const buildSeedQueries = (seed: string) => {
  const trimmed = seed.trim();
  if (!trimmed) {
    return [];
  }
  const base = `\"${trimmed}\"`;
  const queries = [base];
  if (getSeedQueryLimit() > 1) {
    queries.push(`\"${trimmed}\" AI lab`);
  }
  return queries.slice(0, getSeedQueryLimit());
};

const collectSourcesForSeedUniverse = async (
  seeds: string[],
): Promise<IngestSource[]> => {
  if (!seeds.length) {
    return [];
  }
  const limit = getSeedLimit();
  const selected = limit ? seeds.slice(0, limit) : seeds;
  const queries = new Set<string>();
  for (const seed of selected) {
    for (const query of buildSeedQueries(seed)) {
      queries.add(query);
    }
  }
  if (!queries.size) {
    return [];
  }
  console.log(`[ingest] running seed-universe searches: ${queries.size}`);
  return collectFromSearch({
    queries: Array.from(queries),
    origin: "seed_search",
    pipeline: "seed_bootstrap",
  });
};

export const collectCandidatesForNewDiscoveries = async (): Promise<CandidateCollection> => {
  const sourcesToParse = await collectSourcesForNewDiscoveries();
  return parseSourcesToCandidates(sourcesToParse, "new discovery");
};

export const collectCandidatesForKnownUpdates = async (
  knownCompanies: KnownCompany[],
): Promise<CandidateCollection> => {
  const sources = await collectSourcesForKnownUpdates(knownCompanies);
  if (!sources.length) {
    return { candidates: [], sources: [] };
  }

  const queryToCompany = new Map<string, KnownCompany>();
  for (const company of knownCompanies) {
    for (const query of buildKnownQueries(company)) {
      queryToCompany.set(query, company);
    }
  }

  const byCompanyId = new Map<string, { company: KnownCompany; sources: IngestSource[] }>();
  for (const source of sources) {
    const query = source.query ?? null;
    if (!query) {
      continue;
    }
    const company = queryToCompany.get(query);
    if (!company) {
      continue;
    }
    const existing = byCompanyId.get(company.id);
    if (existing) {
      existing.sources.push(source);
    } else {
      byCompanyId.set(company.id, { company, sources: [source] });
    }
  }

  const candidates: IngestCandidate[] = [];
  for (const entry of byCompanyId.values()) {
    const lastVerifiedAt = entry.sources.reduce<Date | null>((acc, source) => {
      const published = source.publishedAt ?? null;
      if (!published) {
        return acc;
      }
      if (!acc) {
        return published;
      }
      return published > acc ? published : acc;
    }, null);

    candidates.push({
      company: {
        name: entry.company.name,
        canonicalDomain: entry.company.canonical_domain ?? null,
        websiteUrl: entry.company.website_url ?? null,
        aliases: entry.company.aliases ?? [],
        lastVerifiedAt,
      },
      sources: dedupeSources(entry.sources),
    });
  }

  return { candidates, sources: dedupeSources(sources) };
};

export const collectCandidatesForSeedBootstrap = async (
  seeds: string[],
): Promise<CandidateCollection> => {
  const sources = await collectSourcesForSeedUniverse(seeds);
  const queryToSeed = new Map<string, string>();
  for (const seed of seeds) {
    for (const query of buildSeedQueries(seed)) {
      queryToSeed.set(query, seed);
    }
  }

  const bySeed = new Map<string, IngestSource[]>();
  for (const source of sources) {
    const query = source.query ?? null;
    if (!query) {
      continue;
    }
    const seed = queryToSeed.get(query);
    if (!seed) {
      continue;
    }
    const existing = bySeed.get(seed);
    if (existing) {
      existing.push(source);
    } else {
      bySeed.set(seed, [source]);
    }
  }

  const candidates: IngestCandidate[] = [];
  for (const seed of seeds) {
    const seedSources = bySeed.get(seed) ?? [];
    const lastVerifiedAt = seedSources.reduce<Date | null>((acc, source) => {
      const published = source.publishedAt ?? null;
      if (!published) {
        return acc;
      }
      if (!acc) {
        return published;
      }
      return published > acc ? published : acc;
    }, null);

    const normalized = normalizeName(seed);
    candidates.push({
      company: {
        name: seed,
        aliases: normalized ? [normalized] : [],
        lastVerifiedAt,
      },
      sources: dedupeSources(seedSources),
    });
  }

  return { candidates, sources: dedupeSources(sources) };
};

export const collectCandidatesForSeedUniverse = async (
  seeds: string[],
): Promise<CandidateCollection> => {
  const sources = await collectSourcesForSeedUniverse(seeds);
  return parseSourcesToCandidates(sources, "seed universe");
};

export const ingestFromSources = async (
  repository: IngestRepository,
  candidates: IngestCandidate[],
): Promise<IngestSummary> => ingestCandidates(repository, candidates);
