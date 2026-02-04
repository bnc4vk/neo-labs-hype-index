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
- [x] Ensure `pnpm lint`, `pnpm test`, `pnpm build` pass

## Phase 5 — Parallel-only redesign (Bootstrap + Weekly Refresh)
- [x] Commit/push checkpoint on main before redesign
- [x] Confirm new operating model: bootstrap seed list, weekly refresh on existing companies
- [x] Remove RSS/discovery/heuristics and allowlist logic (retain Tavily/Mistral client code only)
- [x] Implement bootstrap script (seed list -> company rows only)
- [x] Implement weekly refresh script (Parallel Task API -> best-effort column refresh + sources)
- [x] Update docs + workflow + env for Parallel-only flow
- [x] Trim tests to bootstrap/refresh coverage only

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
- (2026-02-04) `INGEST_DRY_RUN=1 INGEST_LOOKBACK_DAYS=365 INGEST_FORCE_SEARCH=1 pnpm ingest` (dry-run compare; match rate 9%, weighted match rate 8%)
- (2026-02-04) `pnpm lint` (pass)
- (2026-02-04) `pnpm test` (pass; added benchmark tests)
- (2026-02-04) `pnpm build` (pass; warning about `serverExternalPackages` in `next.config.mjs`)
- (2026-02-04) `pnpm install` (dependency prune for ingest redesign)
- (2026-02-04) `pnpm --filter ingest lint` (pass)
- (2026-02-04) `pnpm lint` (pass)
- (2026-02-04) `pnpm test` (pass; redesigned tests)
- (2026-02-04) `pnpm build` (pass; warning about `serverExternalPackages` in `next.config.mjs`)
- (2026-02-04) `INGEST_PROFILE=benchmark INGEST_SEED_MODE=bootstrap ENTITY_RESOLUTION_MODE=llm pnpm ingest` (populated Supabase; report in `packages/ingest/artifacts/ingest-report-bootstrap.json`)
- (2026-02-04) `INGEST_DRY_RUN=1 INGEST_PROFILE=benchmark INGEST_FORCE_SEARCH=1 ENTITY_RESOLUTION_MODE=llm pnpm ingest` (compare; report in `packages/ingest/artifacts/report-llm.json`)
- (2026-02-04) `INGEST_DRY_RUN=1 INGEST_PROFILE=benchmark INGEST_FORCE_SEARCH=1 ENTITY_RESOLUTION_MODE=hybrid pnpm ingest` (compare; report in `packages/ingest/artifacts/report-hybrid.json`)
- (2026-02-04) `INGEST_PROFILE=weekly INGEST_FORCE_SEARCH=1 ENTITY_RESOLUTION_MODE=hybrid INGEST_KNOWN_MAX=30 pnpm ingest` (weekly run; report in `packages/ingest/artifacts/weekly-report.json`)
- (2026-02-04) `pnpm --filter ingest lint` (pass; fixed `tsconfig.json` rootDir and added `@types/node`)
- (2026-02-04) `node --input-type=module ... prisma.*.deleteMany` (cleared Supabase tables: companies/sources/company_sources/people/funding_rounds)
- (2026-02-04) `pnpm lint` (pass)
- (2026-02-04) `pnpm test` (pass; added seed tests + LLM plumbing)
- (2026-02-04) `pnpm build` (pass; warning about `serverExternalPackages` in `next.config.mjs`)

## Key decisions
- Monorepo layout: `apps/web`, `packages/db`, `packages/ingest`.
- Prisma schema uses `@unique` on `canonical_domain` (Postgres unique allows multiple nulls).
- Ingestion is now Parallel-only: bootstrap inserts seed list (no web calls), weekly refresh calls Parallel Task API for best-effort column updates.
- Dynamic fields (`website_url`, `canonical_domain`, `employee_count`, `known_revenue`, `status`, `last_verified_at`) can be overwritten; other fields only fill when missing.
- Sources returned by Parallel are stored in `sources` and linked via `company_sources` to keep the homepage “Sources” section populated.
- Frontend converted to a static HTML/CSS/JS bundle (`apps/web`) that reads from Supabase REST with a publishable key.
