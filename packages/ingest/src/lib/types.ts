export type SeedCompany = {
  name: string;
  alias?: string | null;
};

export type SourceInput = {
  url: string;
  title?: string | null;
  publisher?: string | null;
  publishedAt?: Date | null;
};

export type FundingRoundInput = {
  roundType?: string | null;
  amountUsd?: number | null;
  valuationUsd?: number | null;
  announcedAt?: Date | null;
  investors?: string[] | null;
  sourceUrl?: string | null;
  sourceId?: string | null;
};

export type RefreshUpdate = {
  websiteUrl?: string | null;
  canonicalDomain?: string | null;
  description?: string | null;
  focus?: string | null;
  employeeCount?: number | null;
  knownRevenue?: string | null;
  status?: "active" | "stealth" | "inactive" | "unknown" | null;
  foundedYear?: number | null;
  hqLocation?: string | null;
  lastVerifiedAt?: Date | null;
};

export type ParallelSource = {
  url: string;
  title?: string | null;
  publisher?: string | null;
  published_at?: string | null;
};

export type ParallelFundingRound = {
  round_type?: string | null;
  amount_usd?: number | null;
  valuation_usd?: number | null;
  announced_at?: string | null;
  investors?: string[] | null;
  source_url?: string | null;
};

export type ParallelCitation = {
  url?: string | null;
  title?: string | null;
  publisher?: string | null;
  excerpt?: string | null;
  quote?: string | null;
  snippet?: string | null;
  text?: string | null;
};

export type ParallelFieldBasis = {
  field?: string | null;
  citations?: ParallelCitation[] | null;
  confidence?: string | null;
  reasoning?: string | null;
};

export type ParallelCompanyOutput = {
  company_id?: string | null;
  company_name?: string | null;
  website_url?: string | null;
  canonical_domain?: string | null;
  description?: string | null;
  focus?: string | null;
  employee_count?: number | null;
  known_revenue?: string | null;
  valuation_usd?: number | null;
  valuation_as_of?: string | null;
  valuation_source_url?: string | null;
  status?: string | null;
  founded_year?: number | null;
  hq_location?: string | null;
  sources?: ParallelSource[] | null;
  funding_rounds?: ParallelFundingRound[] | null;
};

export type ParallelTaskResult = {
  content: ParallelCompanyOutput | null;
  basis?: ParallelFieldBasis[] | null;
};
