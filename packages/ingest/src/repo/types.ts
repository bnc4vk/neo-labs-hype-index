import type { FundingRoundInput, RefreshUpdate, SeedCompany, SourceInput } from "../lib/types";

export type KnownCompany = {
  id: string;
  name: string;
  canonical_domain?: string | null;
  website_url?: string | null;
  description?: string | null;
  focus?: string | null;
  employee_count?: number | null;
  known_revenue?: string | null;
  status?: string | null;
  founded_year?: number | null;
  hq_location?: string | null;
  aliases?: string[];
  last_verified_at?: Date | null;
};

export type SourceRecord = {
  id: string;
  url: string;
};

export type UpsertSourceResult = {
  record: SourceRecord;
  created: boolean;
};

export type UpsertCompanyResult = {
  record: { id: string };
  created: boolean;
};

export interface IngestRepository {
  listCompanies(): Promise<KnownCompany[]>;
  upsertSeedCompany(company: SeedCompany): Promise<UpsertCompanyResult>;
  updateCompanyFromRefresh(companyId: string, update: RefreshUpdate): Promise<void>;
  upsertSource(source: SourceInput): Promise<UpsertSourceResult>;
  linkCompanySource(companyId: string, sourceId: string, sourceKind: string): Promise<void>;
  upsertFundingRound(companyId: string, input: FundingRoundInput): Promise<void>;
}
