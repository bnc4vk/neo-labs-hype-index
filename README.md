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

## Prisma commands
- `pnpm prisma:migrate` — apply migrations.
- `pnpm prisma:generate` — generate Prisma client.
- `pnpm prisma:studio` — open Prisma Studio.

## Ingestion
- `pnpm ingest` runs the RSS-first discovery pipeline with a Tavily fallback.
- Only allowlisted domains are fetched; denylisted domains are never fetched.

## GitHub Actions (weekly ingestion)
A scheduled workflow runs weekly and executes `pnpm ingest` using repository secrets:
- `DATABASE_URL`
- `SEARCH_API_KEY`

`SEARCH_PROVIDER` is set to `tavily` in the workflow environment.
