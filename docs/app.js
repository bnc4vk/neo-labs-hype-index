(() => {
  const config = window.APP_CONFIG || {};
  const SUPABASE_URL = config.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = config.SUPABASE_PUBLISHABLE_KEY;

  const TABLE_COLUMNS = 7;
  const MIN_MONEY_USD = 100000;

  const companiesBody = document.getElementById("companies-body");
  const companiesCount = document.getElementById("companies-count");
  const sourcesList = document.getElementById("sources-list");
  const lastRefresh = document.getElementById("last-refresh");

  const setCompaniesMessage = (message) => {
    if (!companiesBody) return;
    companiesBody.innerHTML = `
      <tr>
        <td colSpan="${TABLE_COLUMNS}" class="py-8 text-center text-ink/60">${message}</td>
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

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const normalizeToken = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

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

  const truncateText = (value, maxLength) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
      return { text: "—", full: "", truncated: false };
    }
    if (trimmed.length <= maxLength) {
      return { text: trimmed, full: trimmed, truncated: false };
    }
    return {
      text: `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`,
      full: trimmed,
      truncated: true,
    };
  };

  const formatCurrencyShort = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return "—";
    }
    const abs = Math.abs(num);
    const format = (amount, suffix) => {
      const rounded = amount >= 10 ? amount.toFixed(0) : amount.toFixed(1);
      return `$${rounded.replace(/\.0$/, "")}${suffix}`;
    };
    if (abs >= 1e9) return format(num / 1e9, "B");
    if (abs >= 1e6) return format(num / 1e6, "M");
    if (abs >= 1e3) return format(num / 1e3, "K");
    return `$${num.toFixed(0)}`;
  };

  const parseMoney = (value) => {
    if (value === null || value === undefined) return null;
    const raw = String(value).replace(/,/g, "").trim();
    if (!raw) return null;
    const match = raw.match(
      /\$?\s*(\d+(?:\.\d+)?)\s*(billion|million|thousand|b|m|k)?/i,
    );
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;
    const unit = match[2]?.toLowerCase();
    if (!unit) return amount;
    if (unit === "b" || unit === "billion") return amount * 1e9;
    if (unit === "m" || unit === "million") return amount * 1e6;
    if (unit === "k" || unit === "thousand") return amount * 1e3;
    return amount;
  };

  const formatRevenue = (value) => {
    if (!value) return "Presumed $0";
    const raw = String(value).trim();
    if (!raw) return "Presumed $0";
    const lowered = raw.toLowerCase();
    if (
      lowered.includes("unknown") ||
      lowered.includes("not public") ||
      lowered.includes("no public") ||
      lowered.includes("undisclosed") ||
      lowered.includes("n/a") ||
      lowered.includes("raised") ||
      lowered.includes("valued") ||
      lowered.includes("valuation") ||
      lowered.includes("funding")
    ) {
      return "Presumed $0";
    }
    const parsed = parseMoney(raw);
    if (!parsed || parsed <= 0) {
      return "Presumed $0";
    }
    if (parsed < MIN_MONEY_USD) {
      return "Presumed $0";
    }
    return formatCurrencyShort(parsed);
  };

  const formatEmployeeCount = (value) => {
    if (value === null || value === undefined) {
      return "<10";
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return "<10";
    }
    return `${Math.round(num)}`;
  };

  const formatFundingValue = (value) => {
    if (!value || value <= 0) {
      return "—";
    }
    if (value < MIN_MONEY_USD) {
      return "—";
    }
    return formatCurrencyShort(value);
  };

  const formatFocus = (value) => truncateText(value, 140);

  const buildSourceSummary = (sources, companyName, companyDomain) => {
    const companyToken = normalizeToken(companyName);
    const domainToken = normalizeToken(companyDomain);
    const counts = new Map();
    for (const entry of sources) {
      const source = entry?.source;
      if (!source) continue;
      const label = getDomain(source.url) || source.publisher;
      if (!label) continue;
      const labelToken = normalizeToken(label);
      if (labelToken && (labelToken === companyToken || (domainToken && labelToken === domainToken))) {
        continue;
      }
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
      const label = getDomain(source.url) || source.publisher;
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
        "id,name,website_url,focus,employee_count,known_revenue,last_verified_at,updated_at,company_sources:company_sources(source:source_id(url,publisher))",
      order: "updated_at.desc",
      limit: "200",
    });
    const url = `${SUPABASE_URL}/rest/v1/companies?${params.toString()}`;
    try {
      return await fetchJson(url);
    } catch (error) {
      console.warn("Company join fetch failed, retrying without sources.", error);
      const fallbackParams = new URLSearchParams({
        select: "id,name,website_url,focus,employee_count,known_revenue,last_verified_at,updated_at",
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

  const fetchFundingRounds = async () => {
    const params = new URLSearchParams({
      select: "company_id,round_type,amount_usd,valuation_usd,announced_at,updated_at",
      limit: "2000",
    });
    const url = `${SUPABASE_URL}/rest/v1/funding_rounds?${params.toString()}`;
    return fetchJson(url);
  };

  const buildFundingMap = (rounds) => {
    const map = new Map();
    for (const round of rounds) {
      const companyId = round?.company_id;
      if (!companyId) continue;
      const entry = map.get(companyId) ?? { total: 0, totalIsSummary: false, valuations: [], summaryValuation: null };
      const amount = Number(round.amount_usd);
      const valuation = Number(round.valuation_usd);
      const roundType = String(round.round_type || "").toLowerCase();
      const isSummary = roundType === "total" || roundType === "summary" || roundType === "total_funding";

      if (Number.isFinite(amount)) {
        if (isSummary) {
          entry.total = amount;
          entry.totalIsSummary = true;
        } else if (!entry.totalIsSummary) {
          entry.total += amount;
        }
      }

      if (Number.isFinite(valuation)) {
        if (roundType === "valuation" || isSummary) {
          entry.summaryValuation = valuation;
        } else {
          entry.valuations.push({
            value: valuation,
            date: round.announced_at || round.updated_at || null,
          });
        }
      }
      map.set(companyId, entry);
    }
    return map;
  };

  const pickValuation = (entry) => {
    if (entry?.summaryValuation && Number.isFinite(entry.summaryValuation)) {
      return entry.summaryValuation;
    }
    if (!entry?.valuations?.length) return null;
    const withDate = entry.valuations
      .map((item) => ({ ...item, time: item.date ? new Date(item.date).getTime() : null }))
      .filter((item) => item.time && Number.isFinite(item.time));
    if (withDate.length) {
      withDate.sort((a, b) => b.time - a.time);
      return withDate[0].value;
    }
    return entry.valuations.reduce((max, item) => (item.value > max ? item.value : max), 0);
  };

  const renderCompanies = (companies, fundingByCompanyId) => {
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
        const domain = company.website_url ? getDomain(company.website_url) : "";
        const sourceSummary = buildSourceSummary(
          company.company_sources || [],
          company.name,
          domain,
        );
        const sourceTop = sourceSummary.top
          ? truncateText(sourceSummary.top, 18)
          : null;
        const sourcesLabel = sourceTop
          ? `${sourceTop.text}${sourceSummary.remaining > 0 ? ` +${sourceSummary.remaining}` : ""}`
          : "—";
        const focusInfo = formatFocus(company.focus);
        const revenue = formatRevenue(company.known_revenue);
        const size = formatEmployeeCount(company.employee_count);
        const fundingEntry = fundingByCompanyId?.get(company.id);
        const totalFunding = fundingEntry?.total ?? null;
        const valuation = pickValuation(fundingEntry);
        const fundingLabel = formatFundingValue(totalFunding);
        const valuationLabel = formatFundingValue(valuation);

        return `
          <tr class="border-b border-black/5 text-ink/80 bg-white/80">
            <td class="py-4 pr-4 sticky left-0 z-[5] bg-white/90 backdrop-blur">
              <div class="flex items-center gap-2">
                <span class="font-medium text-ink">${escapeHtml(company.name)}</span>
                ${domain ? `<a class="text-xs text-ink/40 hover:text-ink" href="${company.website_url}" target="_blank" rel="noreferrer">↗</a>` : ""}
              </div>
            </td>
            <td class="py-4 pr-4 whitespace-normal leading-relaxed">
              <span class="focus-clamp"${focusInfo.truncated ? ` title="${escapeHtml(focusInfo.full)}"` : ""}>
                ${escapeHtml(focusInfo.text)}
              </span>
            </td>
            <td class="py-4 pr-4 whitespace-nowrap">${escapeHtml(revenue)}</td>
            <td class="py-4 pr-4 whitespace-nowrap">${escapeHtml(size)}</td>
            <td class="py-4 pr-4 whitespace-nowrap">${escapeHtml(fundingLabel)}</td>
            <td class="py-4 pr-4 whitespace-nowrap">${escapeHtml(valuationLabel)}</td>
            <td class="py-4 whitespace-nowrap" title="${escapeHtml(sourceSummary.top || "")}">
              ${escapeHtml(sourcesLabel)}
            </td>
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
          ${escapeHtml(publisher.label)} · ${publisher.count}
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
      const companies = await fetchCompanies();
      const [fundingRounds, sources] = await Promise.all([
        fetchFundingRounds().catch((error) => {
          console.warn("Funding rounds fetch failed:", error);
          return [];
        }),
        fetchSources().catch((error) => {
          console.warn("Sources fetch failed:", error);
          return [];
        }),
      ]);
      const fundingMap = buildFundingMap(fundingRounds || []);
      renderCompanies(companies || [], fundingMap);
      renderSources(sources || []);
    } catch (error) {
      console.error(error);
      setCompaniesMessage("Failed to load data.");
      setSourcesMessage("Failed to load sources.");
    }
  };

  document.addEventListener("DOMContentLoaded", load);
})();
