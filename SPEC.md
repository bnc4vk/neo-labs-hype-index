# Neolabs Directory — Spec

## Goal
A small webapp that surfaces information about "neolabs" (AI research-lab-style startups) via a single homepage table backed by a weekly ingestion script.

## MVP UI
- Homepage (`/`)
  - A table listing neolabs and key attributes (columns TBD later; do not over-design the UI).
  - Below the table:
    - "Sources" section (cite sources used / linked)
    - "Contact us" card

No additional pages are required for MVP unless needed for debugging (e.g., a hidden /admin page for viewing DB counts).

## Data freshness & trust
- Show a disclaimer indicating data may be incomplete/out-of-date.
- Display `last_verified_at` for each company or a "Last updated" timestamp (implementation detail).

## Non-goals (MVP)
- No user accounts / auth.
- No manual data entry and no seed file.
- No claim/evidence model beyond company_sources.
- No ingestion run logs stored in DB (can add later).

---

**Definition:**
A neolab is a new type of private startup that is heavily focused on research, typically founded by leading AI researchers and oriented toward long-term foundational AI breakthroughs. Neolabs often lack revenue or a defined product and are effectively a privatization of what was traditionally research conducted in academia.

**Inclusion criteria (bullet list):**
* Founders with deep AI research expertise
* Pure or heavily research-focused mission
* Typically AI field focus

**Exclusion criteria (bullet list):**
* Short-term horizon for commercialization
* Defined go-to-market plan
* Large cohort of non-technical staff

---

**Homepage title:**
Neo-Lab Hype Index

**Short intro paragraph (1–3 sentences):**
A weekly-updated directory of US-based AI research‑lab‑style startups. We focus on labs building foundational AI capability and surface the most recent public signals we can find.

**Disclaimer text (1–2 sentences):**
The information presented on this page is regularly refreshed but nevertheless may present outdated information.

**Contact us text + destination (email or URL):**
If you feel there is inaccurate or missing information presented here, please reach out to bnc4vk@gmail.com

---

Publisher citation policy for "Sources" section
- For the MVP list unique publishers/domains from the most recent ingestion in the Sources section, and include a per-company sources summary in the table.
