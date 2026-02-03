# Codex Operating Rules (AGENTS.md)

You are an autonomous coding agent working inside this repository. Follow these rules strictly.

## 0) Non-negotiables
- Treat `SPEC.md` and `DATA_MODEL.md` as source-of-truth.
- Do **not** change `DATA_MODEL.md` without explicit instruction.
- Do **not** delete or rewrite migrations; only add new migrations if needed.
- Respect `INGESTION_SOURCES.md` (allowlist/denylist + fetch policy). Never fetch/scrape outside it.
- No manual seed data. The ingestion script is the only data population mechanism.

## 1) How to work (Codex App behavior)
1. Start by reading: `SPEC.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `INGESTION_SOURCES.md`, `ENV.md`, then `PLAN.md`.
2. If `PLAN.md` is missing or stale, create/refresh it **before** making code changes.
3. Work in **vertical slices** (repo scaffold → DB schema → ingestion → homepage).
4. Keep changes incremental and localized. Avoid broad refactors.
5. After each meaningful step, update `PLAN.md`:
   - mark completed items
   - list next steps
   - include commands run and any key decisions

## 2) Commands & verification
- After code changes, run:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
- Fix failures before moving on.
- Prefer to add small, reliable tests:
  - normalization/parsing unit tests
  - an ingestion idempotency smoke test (running twice should not duplicate rows)

## 3) Repo hygiene
- Do not rename or move directories unless required by the spec.
- Prefer predictable structure; avoid clever abstractions.
- Keep dependencies minimal.
- Use TypeScript strict mode when feasible.
- Use `pnpm` for all installs and scripts.

## 4) Database & Supabase
- Use Postgres + Prisma.
- DB writes should be idempotent (upserts).
- Use stable dedupe keys:
  - prefer `companies.canonical_domain` when present
  - otherwise use normalized name + aliases heuristics (non-destructive)
- Never wipe tables to “reset” state as part of normal ingestion.

### Locked tables (must match `DATA_MODEL.md`)
- `companies`
- `people`
- `funding_rounds`
- `sources`
- `company_sources` (NO `field_key`; unique `(company_id, source_id, source_kind)`)

## 5) Ingestion rules
- Follow priority order:
  1) RSS feeds / official sources
  2) Search API fallback (as configured)
  3) Direct scraping only when explicitly allowed
- Do not store full article text. Store only source metadata defined in `DATA_MODEL.md`.
- Implement best-effort quality + dedupe:
  - avoid duplicate sources by URL normalization
  - avoid duplicate companies by canonical_domain when possible
  - avoid duplicate people per company by normalized name
  - avoid duplicate funding rounds via heuristic keys described in `DATA_MODEL.md`

## 6) MVP UI scope
- Implement only what `SPEC.md` requires:
  - homepage table of companies
  - sources section
  - contact card
- Avoid extra pages/features unless needed for debugging (and keep them minimal).

## 7) Documentation requirements
- Maintain `README.md` with:
  - local setup
  - env vars
  - db migration steps
  - how to run ingestion locally
  - how GitHub Actions scheduling works

## 8) Stop conditions
Stop when all are true:
- `pnpm lint`, `pnpm test`, `pnpm build` pass
- ingestion script runs successfully and writes data into the DB
- homepage renders a non-empty table from DB (assuming ingestion found at least one company)
- GitHub Actions workflow exists and is configured for weekly runs
- `PLAN.md` accurately reflects completion and remaining TODOs
