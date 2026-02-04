export type IngestProfile = "weekly" | "benchmark" | "custom";
export type SeedMode = "off" | "bootstrap" | "always";
export type EntityResolutionMode = "off" | "hybrid" | "llm";

const coercePositiveInt = (value: string | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
};

export const getIngestProfile = (): IngestProfile => {
  const raw = process.env.INGEST_PROFILE?.toLowerCase();
  if (raw === "weekly" || raw === "benchmark" || raw === "custom") {
    return raw;
  }
  return "weekly";
};

export const getLookbackDays = (): number => {
  const explicit = coercePositiveInt(process.env.INGEST_LOOKBACK_DAYS);
  if (explicit) {
    return explicit;
  }
  const profile = getIngestProfile();
  if (profile === "weekly") {
    return 7;
  }
  if (profile === "benchmark") {
    return 365;
  }
  return 14;
};

export const shouldForceSearch = (): boolean => process.env.INGEST_FORCE_SEARCH === "1";

export const getSearchSettings = () => {
  const profile = getIngestProfile();
  const defaults = profile === "weekly" || profile === "benchmark"
    ? { topic: "general" as const, depth: "advanced" as const, maxResults: 10 }
    : { topic: "news" as const, depth: "basic" as const, maxResults: 5 };

  const topic = process.env.INGEST_TAVILY_TOPIC === "general" ? "general" : defaults.topic;
  const depth = process.env.INGEST_TAVILY_DEPTH === "advanced" ? "advanced" : defaults.depth;
  const maxResults = coercePositiveInt(process.env.INGEST_TAVILY_MAX_RESULTS) ?? defaults.maxResults;

  return { topic, depth, maxResults };
};

export const getSeedMode = (): SeedMode => {
  const raw = process.env.INGEST_SEED_MODE?.toLowerCase();
  if (raw === "off" || raw === "bootstrap" || raw === "always") {
    return raw;
  }
  return "off";
};

export const getSeedLimit = (): number | null =>
  coercePositiveInt(process.env.INGEST_SEED_MAX_RESULTS);

export const getKnownCompanyLimit = (): number | null =>
  coercePositiveInt(process.env.INGEST_KNOWN_MAX);

export const getEntityResolutionMode = (): EntityResolutionMode => {
  const raw = process.env.ENTITY_RESOLUTION_MODE?.toLowerCase();
  if (raw === "off" || raw === "hybrid" || raw === "llm") {
    return raw;
  }
  return "off";
};

export const getAllowlistFollowupEnabled = (): boolean =>
  process.env.INGEST_ALLOWLIST_FOLLOWUP !== "0";

export const getReportPath = (): string =>
  process.env.INGEST_REPORT_PATH ?? "artifacts/ingest-report.json";

export const getKnownQueryLimit = (): number => {
  const parsed = coercePositiveInt(process.env.INGEST_KNOWN_QUERY_LIMIT);
  return parsed ?? 1;
};

export const getSeedQueryLimit = (): number => {
  const parsed = coercePositiveInt(process.env.INGEST_SEED_QUERY_LIMIT);
  return parsed ?? 1;
};
