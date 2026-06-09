# Plan

## Current Status
- [x] Static homepage in `docs` reads from Supabase REST with a publishable key.
- [x] Prisma schema and migrations match `DATA_MODEL.md`.
- [x] Ingestion is Parallel-only: bootstrap seeds company names; refresh updates known companies.
- [x] Weekly GitHub Action runs `pnpm ingest:refresh`.
- [x] Neo-lab data lives in the shared Supabase project.
- [x] RLS is enabled for neo-lab tables; anonymous access is read-only for homepage data.
- [x] Deep-clean stale docs, unused provider code, and generated artifacts.

## Commands Run
- (2026-06-09) `git status --short --branch`
- (2026-06-09) `rg ...` audit for stale project, provider, and workflow references
- (2026-06-09) `find apps -maxdepth 3 -type f -print`
- (2026-06-09) `find packages/ingest/artifacts -maxdepth 2 -type f -print`
- (2026-06-09) `rg -n ...` audit for unused provider clients
- (2026-06-09) `rm -rf apps packages/ingest/artifacts packages/ingest/src/lib/llm`
- (2026-06-09) `git grep -n -E ...` stale-reference audit
- (2026-06-09) `pnpm lint` (pass)
- (2026-06-09) `pnpm --filter ingest lint` (pass)
- (2026-06-09) `pnpm test` (pass)
- (2026-06-09) `pnpm build` (pass)
- (2026-06-09) Supabase REST smoke test using `docs/config.js` (pass; returned one company row)

## Key Decisions
- The shared Supabase project is the only active persistence target.
- Static public reads are allowed only through RLS `SELECT` policies on homepage tables.
- Ingestion uses direct Prisma/Postgres credentials and runs via local scripts or GitHub Actions.
- Parallel Task API is the only ingestion provider.
- Historical generated artifacts are not part of the maintained source tree.
