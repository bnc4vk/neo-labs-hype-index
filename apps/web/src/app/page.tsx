import { prisma } from "@neolabs/db";
import { formatDate } from "../lib/format";
import { getDomain } from "../lib/url";

const MAX_COMPANIES = 200;
const MAX_SOURCES = 16;

const getCompanies = async () =>
  prisma.company.findMany({
    include: {
      company_sources: {
        include: { source: true },
      },
    },
    orderBy: [{ updated_at: "desc" }],
    take: MAX_COMPANIES,
  });

const getSources = async () =>
  prisma.source.findMany({
    orderBy: [{ published_at: "desc" }, { updated_at: "desc" }],
    take: 200,
  });

const buildSourceSummary = (sources: { source: { publisher: string | null; url: string } }[]) => {
  const labels = new Set<string>();
  for (const entry of sources) {
    const label = entry.source.publisher ?? getDomain(entry.source.url);
    if (label) {
      labels.add(label);
    }
  }
  const list = Array.from(labels);
  const preview = list.slice(0, 2);
  const remaining = list.length - preview.length;
  return { preview, remaining };
};

const buildPublisherList = (sources: { publisher: string | null; url: string }[]) => {
  const map = new Map<string, number>();
  for (const source of sources) {
    const label = source.publisher ?? getDomain(source.url);
    if (!label) {
      continue;
    }
    map.set(label, (map.get(label) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SOURCES)
    .map(([label, count]) => ({ label, count }));
};

export default async function Home() {
  const [companies, sources] = await Promise.all([getCompanies(), getSources()]);
  const publishers = buildPublisherList(sources);

  return (
    <main className="px-6 pb-24 pt-16 md:px-12">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4">
          <p className="text-sm uppercase tracking-[0.3em] text-ember">Weekly index</p>
          <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
            Neo-Lab Hype Index
          </h1>
          <p className="max-w-2xl text-base text-ink/80 md:text-lg">
            A weekly-updated directory of US-based AI research‑lab‑style startups. We focus on labs
            building foundational AI capability and surface the most recent public signals we can
            find.
          </p>
          <p className="text-sm text-ink/60">
            The information presented on this page is regularly refreshed but nevertheless may
            present outdated information.
          </p>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-soft backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Neolabs</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-ink/50">
              {companies.length} tracked
            </span>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="border-b border-black/10 text-xs uppercase tracking-[0.18em] text-ink/50">
                <tr>
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Focus</th>
                  <th className="py-3 pr-4">HQ</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Employees</th>
                  <th className="py-3 pr-4">Last updated</th>
                  <th className="py-3">Sources</th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink/60">
                      No companies found yet. Run ingestion to populate the index.
                    </td>
                  </tr>
                ) : (
                  companies.map((company) => {
                    const freshness = company.last_verified_at ?? company.updated_at;
                    const sourceSummary = buildSourceSummary(company.company_sources);
                    return (
                      <tr key={company.id} className="border-b border-black/5">
                        <td className="py-4 pr-4">
                          <div className="flex flex-col">
                            <span className="font-medium">{company.name}</span>
                            {company.website_url ? (
                              <span className="text-xs text-ink/60">
                                {getDomain(company.website_url)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-4 pr-4 text-ink/80">
                          {company.focus ?? "—"}
                        </td>
                        <td className="py-4 pr-4 text-ink/80">
                          {company.hq_location ?? "—"}
                        </td>
                        <td className="py-4 pr-4 text-ink/80">{company.status}</td>
                        <td className="py-4 pr-4 text-ink/80">
                          {company.employee_count ?? "—"}
                        </td>
                        <td className="py-4 pr-4 text-ink/80">{formatDate(freshness)}</td>
                        <td className="py-4 text-ink/80">
                          {sourceSummary.preview.length ? (
                            <span>
                              {sourceSummary.preview.join(", ")}
                              {sourceSummary.remaining > 0
                                ? ` +${sourceSummary.remaining}`
                                : ""}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-soft">
            <h2 className="text-2xl font-semibold">Sources</h2>
            <p className="mt-2 text-sm text-ink/70">
              Unique publishers/domains from the most recent ingestion.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {publishers.length === 0 ? (
                <span className="text-sm text-ink/60">No sources yet.</span>
              ) : (
                publishers.map((publisher) => (
                  <span
                    key={publisher.label}
                    className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs uppercase tracking-[0.16em] text-ink/70"
                  >
                    {publisher.label} · {publisher.count}
                  </span>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-black/10 bg-gradient-to-br from-ember/10 via-white/80 to-ocean/10 p-6 shadow-soft">
            <h2 className="text-2xl font-semibold">Contact us</h2>
            <p className="mt-3 text-sm text-ink/70">
              If you feel there is inaccurate or missing information presented here, please reach
              out to bnc4vk@gmail.com
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-[0.2em] text-white">
              bnc4vk@gmail.com
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
