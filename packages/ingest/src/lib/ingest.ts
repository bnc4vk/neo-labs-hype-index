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
import { fetchHtml } from "./fetcher";
import { normalizeName } from "./normalize";
import { isLikelyCompanyName, scoreNeolabRelevance } from "./neolab";
import { fetchRssItems } from "./rss";
import { searchTavily } from "./tavily";
import type { IngestCandidate, IngestSource, IngestSummary } from "./types";
import { getHostname, isAllowedDomain, isDeniedDomain, isFetchAllowed, normalizeUrl } from "./url";
import type { IngestRepository } from "../repo/types";

const DISCOVERY_WINDOW_DAYS = (() => {
  const raw = Number(process.env.INGEST_LOOKBACK_DAYS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 14;
})();
const MIN_CANDIDATES = 6;
const MIN_SOURCE_SCORE = 2;
const MIN_CANDIDATE_SCORE = 2;
const MIN_PORTFOLIO_SCORE = 1;
const MAX_SOURCES_TO_PARSE = 400;
const MAX_DISCOVERY_LINKS_PER_PAGE = 120;

const isRecent = (date?: Date | null) => {
  if (!date) {
    return true;
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DISCOVERY_WINDOW_DAYS);
  return date >= cutoff;
};

const dedupeSources = (sources: IngestSource[]) => {
  const seen = new Set<string>();
  const deduped: IngestSource[] = [];

  for (const source of sources) {
    const normalized = normalizeUrl(source.url) ?? source.url;
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push({ ...source, url: normalized });
  }

  return deduped;
};

const collectFromRss = async (): Promise<IngestSource[]> => {
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
    });
  }

  return sources;
};

const collectFromDiscoveryPages = async (): Promise<IngestSource[]> => {
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
        });
        added += 1;
      });
    } catch (error) {
      console.warn(`Discovery fetch failed for ${pageUrl}:`, error instanceof Error ? error.message : error);
    }
  }

  return sources;
};

const collectFromSearch = async (): Promise<IngestSource[]> => {
  const provider = process.env.SEARCH_PROVIDER?.toLowerCase();
  const apiKey = process.env.SEARCH_API_KEY;

  if (provider !== "tavily" || !apiKey) {
    return [];
  }

  const sources: IngestSource[] = [];
  const topic = process.env.INGEST_TAVILY_TOPIC === "general" ? "general" : "news";
  const depth = process.env.INGEST_TAVILY_DEPTH === "advanced" ? "advanced" : "basic";
  const maxResults = Number(process.env.INGEST_TAVILY_MAX_RESULTS ?? "5");
  const resolvedMaxResults = Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 5;

  for (const query of SEARCH_QUERIES) {
    try {
      const results = await searchTavily(query, apiKey, {
        days: DISCOVERY_WINDOW_DAYS,
        topic,
        maxResults: resolvedMaxResults,
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
        });
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
  let extractedCompanyNames: string[] = [];
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

      extractedCompanyNames = extractCompanyNamesFromJsonLd(html);
      websiteUrl = extractExternalWebsite(html, normalizedSourceUrl);
      if (extractedCompanyNames.length === 0 && source.title) {
        const fallback = extractCompanyName(source.title);
        if (fallback) {
          extractedCompanyNames = [fallback];
        }
      }
    } catch (error) {
      console.warn(`[ingest] fetch failed for ${normalizedSourceUrl}:`, error instanceof Error ? error.message : error);
    }
  } else {
    // For non-fetchable sources, fall back to the title itself.
    if (source.title) {
      const fallback = extractCompanyName(source.title) ?? source.title;
      extractedCompanyNames = [fallback];
    }
  }

  if (extractedCompanyNames.length === 0) {
    const derived = extractNameFromUrl(normalizedSourceUrl);
    if (derived) {
      extractedCompanyNames = [derived];
    }
  }

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

export const ingestFromSources = async (
  repository: IngestRepository,
): Promise<IngestSummary> => {
  const candidates = await collectCandidatesFromSources();
  return ingestCandidates(repository, candidates);
};

export const collectCandidatesFromSources = async (): Promise<IngestCandidate[]> => {
  console.log("[ingest] fetching RSS feeds");
  const rssSources = await collectFromRss();
  console.log(`[ingest] RSS items collected: ${rssSources.length}`);
  let sources = dedupeSources(rssSources);

  console.log("[ingest] fetching discovery pages");
  const discoverySources = await collectFromDiscoveryPages();
  sources = dedupeSources([...sources, ...discoverySources]);
  console.log(`[ingest] discovery items collected: ${discoverySources.length}`);

  const forceSearch = process.env.INGEST_FORCE_SEARCH === "1";
  if (forceSearch || sources.length < MIN_CANDIDATES) {
    console.log("[ingest] running Tavily fallback");
    const searchSources = await collectFromSearch();
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

  console.log(`[ingest] parsing sources for company candidates: ${sourcesToParse.length}/${sources.length}`);
  const candidatesNested = await mapWithConcurrency(sourcesToParse, 4, async (source, index) => {
    const host = getHostname(source.url) ?? "unknown";
    console.log(`[ingest] parse ${index + 1}/${sourcesToParse.length}: ${host}`);
    return buildCandidatesFromSource(source);
  });
  const candidates = candidatesNested.flat();
  console.log(`[ingest] candidates prepared: ${candidates.length}`);
  return candidates;
};
