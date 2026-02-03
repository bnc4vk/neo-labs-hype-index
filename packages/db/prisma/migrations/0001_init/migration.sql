CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "canonical_domain" text,
  "website_url" text,
  "description" text,
  "focus" text,
  "employee_count" integer,
  "known_revenue" text,
  "status" text NOT NULL DEFAULT 'active',
  "founded_year" smallint,
  "hq_location" text,
  "aliases" text[] NOT NULL DEFAULT '{}',
  "last_verified_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "companies_canonical_domain_key" ON "companies" ("canonical_domain");
CREATE INDEX "companies_status_idx" ON "companies" ("status");
CREATE INDEX "companies_employee_count_idx" ON "companies" ("employee_count");
CREATE INDEX "companies_founded_year_idx" ON "companies" ("founded_year");
CREATE INDEX "companies_last_verified_at_idx" ON "companies" ("last_verified_at");

CREATE TABLE "sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "url" text NOT NULL,
  "title" text,
  "publisher" text,
  "published_at" date,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "sources_url_key" ON "sources" ("url");

CREATE TABLE "people" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "role" text,
  "is_founder" boolean NOT NULL DEFAULT false,
  "profile_url" text,
  "primary_source_id" uuid,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "funding_rounds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "round_type" text,
  "amount_usd" bigint,
  "valuation_usd" bigint,
  "announced_at" date,
  "investors" text[] NOT NULL DEFAULT '{}',
  "source_id" uuid,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "company_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "source_id" uuid NOT NULL,
  "source_kind" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "people"
  ADD CONSTRAINT "people_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE;

ALTER TABLE "people"
  ADD CONSTRAINT "people_primary_source_id_fkey" FOREIGN KEY ("primary_source_id") REFERENCES "sources" ("id");

ALTER TABLE "funding_rounds"
  ADD CONSTRAINT "funding_rounds_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE;

ALTER TABLE "funding_rounds"
  ADD CONSTRAINT "funding_rounds_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources" ("id");

ALTER TABLE "company_sources"
  ADD CONSTRAINT "company_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE;

ALTER TABLE "company_sources"
  ADD CONSTRAINT "company_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources" ("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "company_sources_company_id_source_id_source_kind_key" ON "company_sources" ("company_id", "source_id", "source_kind");
CREATE INDEX "company_sources_company_id_idx" ON "company_sources" ("company_id");
CREATE INDEX "company_sources_company_id_source_kind_idx" ON "company_sources" ("company_id", "source_kind");
CREATE INDEX "company_sources_source_id_idx" ON "company_sources" ("source_id");
