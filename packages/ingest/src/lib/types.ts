export type SourceKind =
  | "overview"
  | "employee_count"
  | "founders"
  | "focus"
  | "revenue"
  | "funding_summary"
  | "other";

export type SourceOrigin =
  | "rss"
  | "discovery"
  | "search"
  | "seed_search"
  | "allowlist_followup";

export type SourcePipeline = "known_updates" | "new_discovery" | "seed_bootstrap";

export type IngestSource = {
  url: string;
  title?: string | null;
  publisher?: string | null;
  publishedAt?: Date | null;
  snippet?: string | null;
  sourceKind?: SourceKind;
  origin?: SourceOrigin;
  pipeline?: SourcePipeline;
  query?: string | null;
};

export type IngestCompany = {
  name: string;
  canonicalDomain?: string | null;
  websiteUrl?: string | null;
  description?: string | null;
  focus?: string | null;
  employeeCount?: number | null;
  knownRevenue?: string | null;
  status?: string | null;
  foundedYear?: number | null;
  hqLocation?: string | null;
  aliases?: string[];
  lastVerifiedAt?: Date | null;
};

export type IngestPerson = {
  name: string;
  role?: string | null;
  isFounder?: boolean | null;
  profileUrl?: string | null;
  primarySourceUrl?: string | null;
};

export type IngestFundingRound = {
  roundType?: string | null;
  amountUsd?: bigint | number | null;
  valuationUsd?: bigint | number | null;
  announcedAt?: Date | null;
  investors?: string[] | null;
  sourceUrl?: string | null;
};

export type IngestCandidate = {
  company: IngestCompany;
  sources: IngestSource[];
  people?: IngestPerson[];
  fundingRounds?: IngestFundingRound[];
};

export type IngestSummary = {
  companiesCreated: number;
  companiesUpdated: number;
  sourcesUpserted: number;
  companySourcesLinked: number;
  peopleUpserted: number;
  fundingRoundsUpserted: number;
};
