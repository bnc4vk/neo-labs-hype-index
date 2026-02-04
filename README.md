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
PARALLEL_API_KEY=your_parallel_key
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
pnpm ingest:refresh
```

6. Start the webapp

```bash
pnpm dev
```

## Environment variables
- `DATABASE_URL`: Supabase Postgres connection string (prefer pooler for CI).
- `PARALLEL_API_KEY`: Parallel Task API key (required for refresh).
- `PARALLEL_BASE_URL`: override Parallel API base URL (optional).
- `PARALLEL_PROCESSOR`: Parallel processor name (default `core`).
- `PARALLEL_RESULT_TIMEOUT_SECONDS`: result wait timeout (default 60).
- `PARALLEL_POLL_INTERVAL_MS`: polling interval (default 4000).
- `PARALLEL_MAX_POLL_ATTEMPTS`: max poll attempts (default 20).
- `INGEST_MODE`: `bootstrap` | `refresh` (defaults to refresh).

## Prisma commands
- `pnpm prisma:migrate` — apply migrations.
- `pnpm prisma:generate` — generate Prisma client.
- `pnpm prisma:studio` — open Prisma Studio.

## Ingestion
- `pnpm ingest:bootstrap` reads `packages/ingest/seed-list.txt` and inserts/updates company rows by name only.
- `pnpm ingest:refresh` (or `pnpm ingest`) runs the weekly refresh against Parallel Task API for companies already in Supabase.
- Dynamic fields (`website_url`, `canonical_domain`, `employee_count`, `known_revenue`, `status`, `last_verified_at`) can be updated on each run.
- Other fields are only filled when missing.

### Seed bootstrap (recommended once)
To initialize Supabase with the curated seed list:

```bash
pnpm ingest:bootstrap
```

## GitHub Actions (weekly refresh)
A scheduled workflow runs weekly and executes `pnpm ingest:refresh` using repository secrets:
- `DATABASE_URL`
- `PARALLEL_API_KEY`
