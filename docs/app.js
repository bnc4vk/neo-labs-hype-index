(() => {
  const config = window.APP_CONFIG || {};
  const SUPABASE_URL = config.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = config.SUPABASE_PUBLISHABLE_KEY;

  const companiesBody = document.getElementById("companies-body");
  const companiesCount = document.getElementById("companies-count");
  const sourcesList = document.getElementById("sources-list");
  const lastRefresh = document.getElementById("last-refresh");

  const setCompaniesMessage = (message) => {
    if (!companiesBody) return;
    companiesBody.innerHTML = `
      <tr>
        <td colSpan="3" class="py-8 text-center text-ink/60">${message}</td>
      </tr>
    `;
  };

  const setSourcesMessage = (message) => {
    if (!sourcesList) return;
    sourcesList.innerHTML = `<span class="text-sm text-ink/60">${message}</span>`;
  };

  const requireConfig = () => {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      setCompaniesMessage("Missing Supabase configuration.");
      setSourcesMessage("Missing Supabase configuration.");
      return false;
    }
    return true;
  };

  const headers = () => ({
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    "Content-Type": "application/json",
  });

  const getDomain = (value) => {
    try {
      return new URL(value).hostname.replace(/^www\./, "");
    } catch {
      return value;
    }
  };

  const formatDate = (value) => {
    if (!value) {
      return "—";
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);
  };

  const buildSourceSummary = (sources) => {
    const counts = new Map();
    for (const entry of sources) {
      const source = entry?.source;
      if (!source) continue;
      const label = source.publisher || getDomain(source.url);
      if (!label) continue;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    if (!counts.size) {
      return { top: null, remaining: 0, count: 0 };
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const [top] = sorted[0];
    return { top, remaining: sorted.length - 1, count: sorted.length };
  };

  const buildPublisherList = (sources) => {
    const map = new Map();
    for (const source of sources) {
      const label = source.publisher || getDomain(source.url);
      if (!label) continue;
      map.set(label, (map.get(label) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([label, count]) => ({ label, count }));
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, { headers: headers() });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return response.json();
  };

  const fetchCompanies = async () => {
    const params = new URLSearchParams({
      select:
        "id,name,website_url,focus,hq_location,status,employee_count,last_verified_at,updated_at,company_sources:company_sources(source:source_id(url,publisher))",
      order: "updated_at.desc",
      limit: "200",
    });
    const url = `${SUPABASE_URL}/rest/v1/companies?${params.toString()}`;
    try {
      return await fetchJson(url);
    } catch (error) {
      console.warn("Company join fetch failed, retrying without sources.", error);
      const fallbackParams = new URLSearchParams({
        select: "id,name,website_url,focus,hq_location,status,employee_count,last_verified_at,updated_at",
        order: "updated_at.desc",
        limit: "200",
      });
      const fallbackUrl = `${SUPABASE_URL}/rest/v1/companies?${fallbackParams.toString()}`;
      const companies = await fetchJson(fallbackUrl);
      return companies.map((company) => ({ ...company, company_sources: [] }));
    }
  };

  const fetchSources = async () => {
    const params = new URLSearchParams({
      select: "url,publisher,published_at,updated_at",
      order: "published_at.desc,updated_at.desc",
      limit: "200",
    });
    const url = `${SUPABASE_URL}/rest/v1/sources?${params.toString()}`;
    return fetchJson(url);
  };

  const renderCompanies = (companies) => {
    if (!companiesBody) return;

    if (!companies.length) {
      setCompaniesMessage("No companies found yet. Run ingestion to populate the index.");
      if (companiesCount) {
        companiesCount.textContent = "0 tracked";
      }
      if (lastRefresh) {
        lastRefresh.textContent = "Last refresh: —";
      }
      return;
    }

    if (companiesCount) {
      companiesCount.textContent = `${companies.length} tracked`;
    }

    if (lastRefresh) {
      const maxDate = companies.reduce((acc, company) => {
        const candidate = company.last_verified_at || company.updated_at;
        if (!candidate) return acc;
        const value = new Date(candidate);
        if (Number.isNaN(value.getTime())) return acc;
        if (!acc) return value;
        return value > acc ? value : acc;
      }, null);
      lastRefresh.textContent = `Last refresh: ${formatDate(maxDate)}`;
    }

    const rows = companies
      .map((company) => {
        const sourceSummary = buildSourceSummary(company.company_sources || []);
        const sourcesLabel = sourceSummary.top
          ? `${sourceSummary.top}${sourceSummary.remaining > 0 ? ` +${sourceSummary.remaining}` : ""}`
          : "—";
        const domain = company.website_url ? getDomain(company.website_url) : "";

        return `
          <tr class="border-b border-black/5">
            <td class="py-4 pr-4">
              <div class="flex items-center gap-2">
                <span class="font-medium">${company.name}</span>
                ${domain ? `<a class="text-xs text-ink/40 hover:text-ink" href="${company.website_url}" target="_blank" rel="noreferrer">↗</a>` : ""}
              </div>
            </td>
            <td class="py-4 pr-4 text-ink/80 truncate max-w-[280px]">${company.focus || "—"}</td>
            <td class="py-4 text-ink/80">${sourcesLabel}</td>
          </tr>
        `;
      })
      .join("\n");

    companiesBody.innerHTML = rows;
  };

  const renderSources = (sources) => {
    if (!sourcesList) return;

    const publishers = buildPublisherList(sources);
    if (!publishers.length) {
      setSourcesMessage("No sources yet.");
      return;
    }

    sourcesList.innerHTML = publishers
      .map(
        (publisher) => `
        <span class="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs uppercase tracking-[0.16em] text-ink/70">
          ${publisher.label} · ${publisher.count}
        </span>
      `,
      )
      .join("\n");
  };

  const load = async () => {
    if (!requireConfig()) {
      return;
    }

    try {
      const [companies, sources] = await Promise.all([fetchCompanies(), fetchSources()]);
      renderCompanies(companies || []);
      renderSources(sources || []);
    } catch (error) {
      console.error(error);
      setCompaniesMessage("Failed to load data.");
      setSourcesMessage("Failed to load sources.");
    }
  };

  document.addEventListener("DOMContentLoaded", load);
})();
