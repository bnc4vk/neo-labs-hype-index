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

## Optional
- NODE_ENV=development

---

## Where to set these

### Local development
Create a `.env` (or `.env.local` if using Next.js) with at least:
- DATABASE_URL=...
- SEARCH_API_KEY=...

### GitHub Actions (weekly ingestion)
Add these repository secrets:
- DATABASE_URL
- SEARCH_API_KEY

(SEARCH_PROVIDER can be hardcoded to `tavily` in the workflow or set as a secret/variable.)

---

## Notes
- Never commit DATABASE_URL or SEARCH_API_KEY.
- Ingestion should be able to run with only DATABASE_URL and SEARCH_API_KEY present.
