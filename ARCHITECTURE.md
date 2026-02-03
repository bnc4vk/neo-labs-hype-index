# Architecture

## Stack
- Next.js (App Router) + TypeScript
- Tailwind CSS
- Postgres (Supabase)
- Prisma ORM
- Ingestion: Node/TS script run in-repo (no serverless jobs required for MVP)
- Scheduling: GitHub Actions weekly

## App shape
- `apps/web`: Next.js app
- `packages/db`: Prisma schema + DB client
- `packages/ingest`: ingestion script + source adapters

(Exact monorepo layout is optional; a single Next.js repo with `/prisma` and `/scripts` is also acceptable. Prefer the simplest structure that keeps concerns separated.)

## Data flow
1. Weekly GitHub Action runs ingestion script.
2. Script discovers sources (RSS first, then search API fallback, then scraping where permitted).
3. Script normalizes entities and upserts:
   - companies
   - people
   - funding_rounds
   - sources
   - company_sources
4. Webapp reads from DB and renders homepage table.

## Key constraints
- Idempotent ingestion (safe to rerun)
- Minimal stored source metadata (no raw full text)
- Dedupe logic required (canonical_domain + aliases)
