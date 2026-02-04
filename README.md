# Neo-Labs Hype Index

A small webapp that surfaces “neolabs” (AI research‑lab‑style startups) via a single homepage table backed by a weekly ingestion script.

## Local setup
1. Install dependencies

```bash
pnpm install
```

2. Create a `.env` in the repo root:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require
SEARCH_PROVIDER=tavily
SEARCH_API_KEY=your_tavily_key
ENTITY_RESOLUTION_MODE=llm
MISTRAL_API_KEY=your_mistral_key
```

3. Run Prisma migrations

```bash
pnpm prisma:migrate
```

4. Generate Prisma client (optional if migrate already generated it)

```bash
pnpm prisma:generate
```

5. Run ingestion

```bash
pnpm ingest
```

6. Start the webapp

```bash
pnpm dev
```

## Environment variables
- `DATABASE_URL`: Supabase Postgres connection string (prefer pooler for CI).
- `SEARCH_PROVIDER`: `tavily`.
- `SEARCH_API_KEY`: Tavily API key for fallback search discovery.
- `ENTITY_RESOLUTION_MODE`: `off` | `hybrid` | `llm` (LLM entity resolution for company names).
- `MISTRAL_API_KEY`: required for `hybrid`/`llm` modes.
- `INGEST_PROFILE`: `weekly` | `benchmark` | `custom` (controls defaults for lookback + search settings).
- `INGEST_LOOKBACK_DAYS`: overrides profile default.
- `INGEST_FORCE_SEARCH`: set to `1` to always run Tavily fallback.
- `INGEST_TAVILY_TOPIC`: `general` or `news`.
- `INGEST_TAVILY_DEPTH`: `basic` or `advanced`.
- `INGEST_TAVILY_MAX_RESULTS`: max Tavily results per query.
- `INGEST_SEED_MODE`: `off` | `bootstrap` | `always` (use `seed-universe.txt` as an input universe).
- `INGEST_REPORT_PATH`: where the JSON report is written (default `artifacts/ingest-report.json`, relative to `packages/ingest` when running `pnpm ingest`).

## Prisma commands
- `pnpm prisma:migrate` — apply migrations.
- `pnpm prisma:generate` — generate Prisma client.
- `pnpm prisma:studio` — open Prisma Studio.

## Ingestion
- `pnpm ingest` runs the RSS-first discovery pipeline with a Tavily fallback.
- Only allowlisted domains are fetched; denylisted domains are never fetched.
- Weekly run profile defaults to a 7-day lookback and advanced Tavily settings via `INGEST_PROFILE=weekly`.
- A JSON report is written to `INGEST_REPORT_PATH` and summarized in GitHub Actions job output.

### Seed bootstrap (optional)
To populate Supabase with a curated set of known/seeded neo-lab companies (no manual DB inserts):

```bash
INGEST_SEED_MODE=bootstrap INGEST_PROFILE=benchmark pnpm ingest
```

## GitHub Actions (weekly ingestion)
A scheduled workflow runs weekly and executes `pnpm ingest` using repository secrets:
- `DATABASE_URL`
- `SEARCH_API_KEY`
- `MISTRAL_API_KEY` (optional; only if LLM resolution is enabled)

`SEARCH_PROVIDER` is set to `tavily` in the workflow environment.
