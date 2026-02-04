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

export type ParallelCompanyOutput = {
  company_id?: string | null;
  company_name?: string | null;
  website_url?: string | null;
  canonical_domain?: string | null;
  description?: string | null;
  focus?: string | null;
  employee_count?: number | null;
  known_revenue?: string | null;
  status?: string | null;
  founded_year?: number | null;
  hq_location?: string | null;
  sources?: ParallelSource[] | null;
};
