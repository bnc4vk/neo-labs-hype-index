# Plan

## Phase 0 — Repo scaffold (Next.js + TS + Tailwind + pnpm)
- [x] Choose repo layout (apps/web + packages/db + packages/ingest)
- [x] Scaffold Next.js App Router + TypeScript + Tailwind (manual setup)
- [x] Add base README with setup, env vars, migrations, ingestion, and GitHub Actions schedule

## Phase 1 — Prisma schema + migrations (match DATA_MODEL.md exactly)
- [x] Add Prisma schema that mirrors DATA_MODEL.md
- [x] Create initial migration(s) without altering locked tables
- [x] Add DB client wrapper

## Phase 2 — Ingestion script (RSS first, Tavily fallback, allow/deny list, dedupe + idempotent upserts)
- [x] Implement RSS discovery for listed feeds
- [x] Implement press-page discovery (URL collection only)
- [x] Implement allowlist/denylist fetch policy
- [x] Implement Tavily search fallback (gated by env and policy)
- [x] Implement normalization + dedupe rules per DATA_MODEL.md
- [x] Implement idempotent upserts for companies, people, funding_rounds, sources, company_sources
- [x] Add `pnpm ingest` command

## Phase 3 — Webapp homepage
- [x] Homepage table of companies from DB
- [x] “Sources” section per SPEC.md policy decision
- [x] Contact card per SPEC.md copy
- [x] Show data freshness (last_verified_at or last updated)
- [x] Minimal styling polish

## Phase 4 — Automation + tests + quality gates
- [x] GitHub Actions workflow to run ingestion weekly
- [x] Minimal tests: normalization/parsing unit tests
- [x] Minimal tests: ingestion idempotency smoke test
- [ ] Ensure `pnpm lint`, `pnpm test`, `pnpm build` pass

## Phase 5 — Candidate tuning + controlled ingest
- [x] Add dry-run candidate evaluation mode
- [x] Purge Supabase tables (companies, sources, etc.)
- [ ] Iterate sourcing tweaks to reach ≥70% match with provided list
- [ ] Run ingest to write to Supabase after threshold

---

## Commands run
- `node -v`
- `npm install -g pnpm`
- `pnpm -v`
- `pnpm dlx create-next-app@latest apps/web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-git` (failed: network ENOTFOUND)
- `pnpm install` (failed: network ENOTFOUND to registry.npmjs.org)
- `pnpm lint` (failed: missing node_modules / next not found)
- `pnpm test` (failed: missing node_modules / vitest not found)
- `pnpm build` (failed: missing node_modules / next not found)
- `pnpm prisma:migrate` (failed: schema engine error; likely missing Prisma engines/builds in sandbox)
- `DEBUG="*" pnpm --filter db prisma migrate dev --schema prisma/schema.prisma --create-only --skip-generate --skip-seed` (failed: schema engine error)
- (User local) `pnpm ingest` (success; 7 companies created; VentureBeat RSS 404s)
- `pnpm ingest` (sandbox: runs but network fetch fails; switched ingest runner away from `tsx` CLI to avoid `EPERM` IPC socket error)
- (2026-02-03) `pnpm ingest` (sandbox: command succeeds; all HTTP fetches fail; 0 candidates prepared)
- (2026-02-03) `pnpm ingest` retry (sandbox: same outcome; all HTTP fetches fail; 0 candidates prepared)
- (2026-02-03) `pnpm lint` (sandbox: fails; `next lint` tries to auto-install `@types/react` + `@types/node`; pnpm store mismatch with existing `node_modules`)
- `pnpm test` (sandbox: pass)
- (2026-02-03) `pnpm ingest` (network-enabled: RSS/discovery fetch works; 4 companies created, 1 updated; VentureBeat RSS fetch fails; one VentureBeat URL 429)
- (2026-02-03) `pnpm ingest` (rerun: idempotent; 0 companies created, 5 updated)
- (2026-02-03) `node - <<'NODE' ... deleteMany` (purged company_sources, funding_rounds, people, companies, sources)
- (2026-02-03) `INGEST_DRY_RUN=1 INGEST_LOOKBACK_DAYS=365 INGEST_FORCE_SEARCH=1 INGEST_TAVILY_TOPIC=general INGEST_TAVILY_DEPTH=advanced INGEST_TAVILY_MAX_RESULTS=10 pnpm ingest` (dry-run compare; best match reached 50%)
- (2026-02-03) `pnpm install` (refreshed node_modules)
- (2026-02-03) `pnpm lint` (pass; Next.js updated `apps/web/tsconfig.json`)
- (2026-02-03) `pnpm test` (pass)
- (2026-02-03) `pnpm build` (pass; warning about `serverExternalPackages` in `next.config.mjs`)

## Key decisions
- Monorepo layout: `apps/web`, `packages/db`, `packages/ingest`.
- Prisma schema uses `@unique` on `canonical_domain` (Postgres unique allows multiple nulls).
- Ingestion uses RSS first, then discovery pages, then Tavily fallback; skips full-content scraping.
- Idempotency test uses an in-memory repository to avoid DB dependency in CI.
- Added basic ingestion progress logging to surface RSS/discovery/search status.
- Candidate sourcing improvements: relevance scoring filter, allowlisted page fetch + JSON-LD extraction, TechCrunch AI RSS feed, and portfolio-directory parsing for a16z.
- Added `.env` loader for ingestion, expanded search controls (topic/depth/max results), and directory-domain parsing for startup lists.
- Current discovery sources + generic search plateau at ~50% match vs provided list; need additional allowlisted sources or permission to use known list for targeted search to reach 70%.
