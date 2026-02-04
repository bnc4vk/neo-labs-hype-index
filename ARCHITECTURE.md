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
1. One-time bootstrap script inserts the curated seed list into `companies`.
2. Weekly GitHub Action runs refresh script.
3. Script calls Parallel Task API per company to retrieve best‑effort structured fields + source URLs.
4. Script upserts:
   - companies
   - sources
   - company_sources
5. Webapp reads from DB and renders homepage table.

## Key constraints
- Idempotent ingestion (safe to rerun)
- Minimal stored source metadata (no raw full text)
- Dedupe logic required (canonical_domain + aliases)
