# Ingestion Sources & Fetch Policy

This file defines the only approved data procurement path for the ingestion scripts.

## Current policy (Parallel-only)
- **Single provider:** Parallel Task API.
- **No direct scraping by our code.**
- **No RSS / discovery / allowlist logic.**
- **All fields are best-effort.** If the provider cannot determine a field confidently, it should return `null`.

## Operations

### 1) Bootstrap (manual, one-time)
- Input: `packages/ingest/seed-list.txt`
- Action: create/update company rows with **name only** (plus normalized alias).
- No web calls.

### 2) Weekly refresh (GitHub Actions)
- Input: companies already in Supabase.
- Action: for each company, call Parallel Task API to retrieve best‑effort company data and sources.
- Output: update company columns (dynamic fields overwrite; static fields fill if empty) and upsert sources.

## Stored data
- Only minimal metadata is stored (see `DATA_MODEL.md`).
- Source URLs returned by Parallel are stored in `sources` and linked via `company_sources`.
