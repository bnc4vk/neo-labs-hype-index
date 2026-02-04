# Environment Variables (ENV.md)

This repo uses Prisma to connect directly to the Supabase-hosted Postgres database.
We are NOT using the Supabase HTTP APIs (no SUPABASE_URL / service role key required).

## Required (local dev + CI)

### Database
- DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require
  - Postgres connection string for your Supabase project (prefer the pooler URL for CI).
  - Format: postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require

### Search (fallback)
- SEARCH_PROVIDER=tavily
- SEARCH_API_KEY=your_tavily_key_here

### LLM (optional; entity resolution)
- ENTITY_RESOLUTION_MODE=off | hybrid | llm
- MISTRAL_API_KEY=... (required if ENTITY_RESOLUTION_MODE=llm or hybrid and you want LLM enabled)

## Optional
- NODE_ENV=development
- INGEST_PROFILE=weekly | benchmark | custom
- INGEST_LOOKBACK_DAYS=7 (overrides profile default)
- INGEST_FORCE_SEARCH=1 (force Tavily fallback even if RSS/discovery is sufficient)
- INGEST_TAVILY_TOPIC=general | news
- INGEST_TAVILY_DEPTH=basic | advanced
- INGEST_TAVILY_MAX_RESULTS=10
- INGEST_ALLOWLIST_FOLLOWUP=1 (set to 0 to disable)
- INGEST_REPORT_PATH=artifacts/ingest-report.json
  - Path is interpreted relative to the ingest package working directory (`packages/ingest`) when running `pnpm ingest`.
- INGEST_SEED_MODE=off | bootstrap | always
  - `bootstrap`: when the DB is empty, create/update only the companies listed in `seed-universe.txt` and attach sources found via search (no candidate extraction).
  - `always`: run the seed searches and parse results into additional company candidates (noisy; best used for experiments).
- INGEST_SEED_MAX_RESULTS=...
- INGEST_SEED_QUERY_LIMIT=1
- INGEST_KNOWN_MAX=...
- INGEST_KNOWN_QUERY_LIMIT=1
- MISTRAL_MODEL=mistral-large-latest
- MISTRAL_TIMEOUT_MS=15000

---

## Where to set these

### Local development
Create a `.env` (or `.env.local` if using Next.js) with at least:
- DATABASE_URL=...
- SEARCH_API_KEY=...
Optionally:
- ENTITY_RESOLUTION_MODE=llm
- MISTRAL_API_KEY=...

### GitHub Actions (weekly ingestion)
Add these repository secrets:
- DATABASE_URL
- SEARCH_API_KEY
- MISTRAL_API_KEY (optional; only if using LLM entity resolution)

(SEARCH_PROVIDER can be hardcoded to `tavily` in the workflow or set as a secret/variable.)

---

## Notes
- Never commit DATABASE_URL or SEARCH_API_KEY.
- Ingestion should be able to run with only DATABASE_URL and SEARCH_API_KEY present.
