# Ingestion Sources & Fetch Policy

This file is authoritative for what the ingestion script is allowed to discover and fetch.

## Priority order
1. RSS feeds / official sources
2. Search API fallback (Tavily)
3. Direct scraping only when explicitly allowed below

---

## Scope
- Geography: US
- Language: English (best-effort)
- Cadence: weekly (GitHub Actions)
- Data stored from sources: minimal metadata only (see DATA_MODEL.md)

---

## RSS feeds (preferred discovery)

### General tech / startup
- TechCrunch: https://techcrunch.com/feed/
- TechCrunch (AI tag): https://techcrunch.com/tag/artificial-intelligence/feed/
- VentureBeat (main): https://feeds.venturebeat.com/VentureBeat
- VentureBeat (top stories): https://feeds.venturebeat.com/topstories

### AI-specific
- VentureBeat AI: https://venturebeat.com/category/ai/feed/
- WIRED AI: https://www.wired.com/feed/tag/ai/latest/rss

### Optional (add later if needed)
# - WIRED Business: https://www.wired.com/feed/category/business/latest/rss
# - WIRED Top Stories: https://www.wired.com/feed/rss

Notes:
- RSS is used for discovery only. After discovery, fetching/parsing is subject to the domain allowlist/denylist below.

---

## Press pages / official-ish sources (discovery targets)

These are used for discovery (URLs). Fetching is only allowed if the domain is allowlisted.

### VC / investor perspectives (often announce new “lab” investments)
- a16z news content hub: https://a16z.com/news-content/
- a16z portfolio directory: https://a16z.com/portfolio/
- Index Ventures perspectives: https://www.indexventures.com/perspectives/
- Sequoia stories: https://www.sequoiacap.com/stories/

### Optional additions (if you want more coverage later)
# - Khosla Ventures blog / news
# - Lightspeed blog
# - General Catalyst news/insights
# - Nvidia newsroom (if you care about strategic investments)

---

## Allowed fetch domains (direct HTTP fetch + parse)

Only these domains may be fetched and parsed directly.

### News / publishers (public pages only)
- techcrunch.com
- venturebeat.com
- wired.com
- axios.com

### Official / investor sites
- a16z.com
- indexventures.com
- sequoiacap.com

### Reference (optional; useful for basic company metadata)
- wikipedia.org

### Directories (optional; list pages for discovery)
- seedtable.com
- topstartups.io
- nfx.com
- startupblink.com
- failory.com
- wellfound.com

Notes:
- If a URL is discovered from a denylisted domain, we may still store the Source row (url/title/publisher/date), but DO NOT fetch.

---

## Denylisted domains (do not fetch / scrape)

Do not fetch content from these domains (paywalled, restrictive, or high-friction), even if discovered.
We may store minimal source metadata (url/title/publisher/published_at) if available from search/RSS.

- theinformation.com
- ft.com
- wsj.com
- bloomberg.com
- nytimes.com
- economist.com
- linkedin.com
- x.com
- twitter.com
- medium.com

Notes:
- Social links (X/LinkedIn) can be stored as `profile_url` if discovered elsewhere, but never scraped.

---

## Search API configuration (fallback)

### Provider
- Default: tavily

### Required env vars
- SEARCH_PROVIDER=tavily
- SEARCH_API_KEY=...  (Tavily API key)

### When to use search
Use Tavily only when RSS/press discovery yields insufficient new items, or when you need to resolve:
- canonical domain / website URL
- funding announcements
- founder lists (best-effort)

### Tavily usage strategy (recommended)
- Use "news" topic where supported for recent funding/announcements.
- Use a time window appropriate for weekly runs (e.g., last 7–14 days).
- Prefer returning a small number of high-quality results and then selectively fetching only allowlisted URLs.

---

## Search query templates (for weekly runs)

### Discovery (broad)
- "AI research lab startup seed round"
- "new AI lab startup raised seed"
- "stealth AI lab founded by former OpenAI DeepMind"
- "AI institute startup funding"
- "research lab AI startup announced"
