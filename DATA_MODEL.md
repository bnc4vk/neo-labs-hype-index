# Data Model (Locked)

This schema is authoritative. Do not add fields unless required by the spec.

## Tables

### companies
- id (uuid, pk)
- name (text, required)
- canonical_domain (text, unique nullable)
- website_url (text nullable)
- description (text nullable)
- focus (text nullable)
- employee_count (int nullable)
- known_revenue (text nullable)
- status (text required; default 'active')  // active | stealth | inactive | unknown
- founded_year (smallint nullable)
- hq_location (text nullable)
- aliases (text[] required default '{}')
- last_verified_at (timestamptz nullable)
- updated_at (timestamptz required default now)

Indexes:
- unique partial index on canonical_domain where not null
- btree indexes on status, employee_count, founded_year, last_verified_at

### people
- id (uuid, pk)
- company_id (uuid fk -> companies.id on delete cascade)
- name (text required)
- role (text nullable)
- is_founder (bool required default false)
- profile_url (text nullable)
- primary_source_id (uuid fk -> sources.id nullable)
- updated_at (timestamptz required default now)

Dedupe:
- enforce uniqueness per company by normalized name in ingestion logic (recommended), or optional functional unique index.

### funding_rounds
- id (uuid, pk)
- company_id (uuid fk -> companies.id on delete cascade)
- round_type (text nullable)
- amount_usd (bigint nullable)
- valuation_usd (bigint nullable)
- announced_at (date nullable)
- investors (text[] required default '{}')
- source_id (uuid fk -> sources.id nullable)
- updated_at (timestamptz required default now)

Dedupe (ingestion logic):
- prefer (company_id, round_type, announced_at) when announced_at exists
- else fallback (company_id, round_type, amount_usd, valuation_usd)

### sources
- id (uuid, pk)
- url (text unique required)
- title (text nullable)
- publisher (text nullable)
- published_at (date nullable)
- updated_at (timestamptz required default now)

### company_sources
- id (uuid, pk)
- company_id (uuid fk -> companies.id on delete cascade)
- source_id (uuid fk -> sources.id on delete cascade)
- source_kind (text required) // overview | employee_count | founders | focus | revenue | funding_summary | other
- updated_at (timestamptz required default now)

Constraints:
- unique (company_id, source_id, source_kind)

Indexes:
- btree company_id
- btree (company_id, source_kind)
- btree source_id

## Notes
- No claim/evidence model.
- No ingestion_runs tables (for now).
- App/API should still expose nested “company with staff/rounds/sources” as needed.
