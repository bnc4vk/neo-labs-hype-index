import type {
  IngestCompany,
  IngestFundingRound,
  IngestPerson,
  IngestSource,
  IngestSummary,
} from "../lib/types";

export type CompanyRecord = {
  id: string;
  canonical_domain?: string | null;
  last_verified_at?: Date | null;
  aliases?: string[];
};

export type KnownCompany = {
  id: string;
  name: string;
  canonical_domain?: string | null;
  website_url?: string | null;
  aliases?: string[];
  last_verified_at?: Date | null;
};

export type SourceRecord = {
  id: string;
  url: string;
};

export type UpsertCompanyResult = {
  record: CompanyRecord;
  created: boolean;
};

export type UpsertSourceResult = {
  record: SourceRecord;
  created: boolean;
};

export type RepositoryResult = {
  summary: IngestSummary;
};

export interface IngestRepository {
  upsertSource(source: IngestSource): Promise<UpsertSourceResult>;
  upsertCompany(company: IngestCompany): Promise<UpsertCompanyResult>;
  listCompanies(): Promise<KnownCompany[]>;
  linkCompanySource(
    companyId: string,
    sourceId: string,
    sourceKind: string,
  ): Promise<boolean>;
  upsertPeople(
    companyId: string,
    people: IngestPerson[],
    sourceMap: Map<string, string>,
  ): Promise<number>;
  upsertFundingRounds(
    companyId: string,
    rounds: IngestFundingRound[],
    sourceMap: Map<string, string>,
  ): Promise<number>;
}
