# Environment Variables (ENV.md)

This repo uses Prisma to connect directly to the Supabase-hosted Postgres database.
We are NOT using the Supabase HTTP APIs (no SUPABASE_URL / service role key required).

## Required (local dev + CI)

### Database
- DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require
  - Postgres connection string for your Supabase project (prefer the pooler URL for CI).
  - Format: postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require

### Provider (Parallel Task API)
- PARALLEL_API_KEY=... (required for refresh runs)

## Optional
- PARALLEL_BASE_URL=https://api.parallel.ai
- PARALLEL_PROCESSOR=core
- PARALLEL_RESULT_TIMEOUT_SECONDS=60
- PARALLEL_POLL_INTERVAL_MS=4000
- PARALLEL_MAX_POLL_ATTEMPTS=20
- INGEST_MODE=bootstrap | refresh (defaults to refresh)

---

## Where to set these

### Local development
Create a `.env` with at least:
- DATABASE_URL=...
- PARALLEL_API_KEY=...

### GitHub Actions (weekly refresh)
Add these repository secrets:
- DATABASE_URL
- PARALLEL_API_KEY

---

## Notes
- Never commit DATABASE_URL or PARALLEL_API_KEY.
- Bootstrap does not require PARALLEL_API_KEY because it does not call the provider.
