import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import {
  collectCandidatesForKnownUpdates,
  collectCandidatesForNewDiscoveries,
  collectCandidatesForSeedBootstrap,
  collectCandidatesForSeedUniverse,
  ingestCandidates,
  type CandidateCollection,
} from "./lib/ingest";
import { compareCandidates, loadBenchmarkList } from "./lib/benchmark";
import { loadSeedUniverse } from "./lib/seed";
import { buildIngestReport, writeIngestReport, writeReportSummary } from "./lib/report";
import {
  getReportPath,
  getIngestProfile,
  getSeedMode,
} from "./lib/settings";
import { PrismaRepository } from "./repo/prisma";
import { maxDate, mergeAliases, normalizeName } from "./lib/normalize";

const requireEnv = (key: string) => {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
};

const loadDotEnv = () => {
  let currentDir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const envPath = resolve(currentDir, ".env");
    if (existsSync(envPath)) {
      const contents = readFileSync(envPath, "utf-8");
      for (const line of contents.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) {
          continue;
        }
        const key = trimmed.slice(0, eqIdx).trim();
        const rawValue = trimmed.slice(eqIdx + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      return envPath;
    }
    const parent = dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }
  return null;
};

const main = async () => {
  loadDotEnv();
  const dryRun = process.env.INGEST_DRY_RUN === "1" || process.env.INGEST_MODE === "compare";

  if (!dryRun) {
    requireEnv("DATABASE_URL");
  }

  const seedMode = getSeedMode();
  const benchmarkList = loadBenchmarkList();

  const mergeCollections = (collections: CandidateCollection[]) => {
    const candidates: CandidateCollection["candidates"] = [];
    const sources: CandidateCollection["sources"] = [];
    for (const collection of collections) {
      candidates.push(...collection.candidates);
      sources.push(...collection.sources);
    }
    return { candidates, sources };
  };

  const dedupeCandidates = (candidates: CandidateCollection["candidates"]) => {
    const seen = new Map<string, typeof candidates[number]>();
    for (const candidate of candidates) {
      const normalized = normalizeName(candidate.company.name) ?? candidate.company.name.toLowerCase();
      const existing = seen.get(normalized);
      if (!existing) {
        seen.set(normalized, {
          ...candidate,
          sources: [...candidate.sources],
        });
        continue;
      }

      const mergedSources = [...existing.sources];
      const existingUrls = new Set(existing.sources.map((source) => source.url));
      for (const source of candidate.sources) {
        if (!existingUrls.has(source.url)) {
          mergedSources.push(source);
          existingUrls.add(source.url);
        }
      }

      existing.sources = mergedSources;
      existing.company.aliases = mergeAliases(
        existing.company.aliases ?? [],
        candidate.company.aliases ?? [],
      );
      existing.company.lastVerifiedAt = maxDate(
        existing.company.lastVerifiedAt ?? null,
        candidate.company.lastVerifiedAt ?? null,
      );
    }
    return Array.from(seen.values());
  };

  if (dryRun) {
    const collections: CandidateCollection[] = [];
    collections.push(await collectCandidatesForNewDiscoveries());

    if (seedMode === "always") {
      const seeds = loadSeedUniverse();
      collections.push(await collectCandidatesForSeedUniverse(seeds));
    }

    const merged = mergeCollections(collections);
    const deduped = dedupeCandidates(merged.candidates);
    const uniqueNames = Array.from(new Set(deduped.map((candidate) => candidate.company.name)));
    const comparison = compareCandidates(uniqueNames, benchmarkList);

    if (process.env.INGEST_PRINT_CANDIDATES === "1") {
      console.log("[compare] candidate list:", uniqueNames.sort());
    }

    console.log("[compare] candidates:", comparison.candidateCount);
    console.log("[compare] unique candidates:", comparison.uniqueCandidateCount);
    console.log("[compare] known list:", comparison.knownCount);
    console.log("[compare] matched:", comparison.matched.length, comparison.matched.sort());
    console.log("[compare] missing:", comparison.missing.length, comparison.missing.sort());
    console.log("[compare] match rate:", `${Math.round(comparison.matchRate * 100)}%`);
    console.log(
      "[compare] weighted match rate:",
      `${Math.round(comparison.weightedMatchRate * 100)}% (${comparison.matchedWeight}/${comparison.totalWeight})`,
    );
    const extrasSample = comparison.extras.sort().slice(0, 20);
    console.log("[compare] extras sample:", extrasSample);

    const report = buildIngestReport(
      deduped,
      merged.sources,
      comparison,
      benchmarkList,
      extrasSample,
    );
    const reportPath = getReportPath();
    writeIngestReport(report, reportPath);
    writeReportSummary(report);
    console.log(`[ingest] report written to ${reportPath}`);
    return;
  }

  const repo = new PrismaRepository();
  const knownCompanies = await repo.listCompanies();
  const collections: CandidateCollection[] = [];

  const profile = getIngestProfile();
  if (profile === "weekly") {
    // Weekly cadence focuses on updating known companies only; no new company discovery.
    if (knownCompanies.length) {
      collections.push(await collectCandidatesForKnownUpdates(knownCompanies));
    } else {
      console.warn("[ingest] weekly profile: no companies in DB; skipping known-updates pipeline");
    }
  } else if (seedMode === "bootstrap") {
    // Bootstrap is a controlled path: populate/update the DB from the curated seed universe only.
    // (Avoids polluting the DB with noisy new-discovery candidates.)
    const seeds = loadSeedUniverse();
    collections.push(await collectCandidatesForSeedBootstrap(seeds));
  } else {
    if (knownCompanies.length) {
      collections.push(await collectCandidatesForKnownUpdates(knownCompanies));
    }

    collections.push(await collectCandidatesForNewDiscoveries());

    if (seedMode === "always") {
      const seeds = loadSeedUniverse();
      collections.push(await collectCandidatesForSeedUniverse(seeds));
    }
  }

  const merged = mergeCollections(collections);
  const deduped = dedupeCandidates(merged.candidates);
  const summary = await ingestCandidates(repo, deduped);
  const uniqueNames = Array.from(new Set(deduped.map((candidate) => candidate.company.name)));
  const comparison = compareCandidates(uniqueNames, benchmarkList);
  const extrasSample = comparison.extras.sort().slice(0, 20);
  const report = buildIngestReport(
    deduped,
    merged.sources,
    comparison,
    benchmarkList,
    extrasSample,
  );
  const reportPath = getReportPath();
  writeIngestReport(report, reportPath);
  writeReportSummary(report);
  console.log(`[ingest] report written to ${reportPath}`);

  console.log("Ingestion complete:", summary);
};

main().catch((error) => {
  console.error("Ingestion failed:", error);
  process.exitCode = 1;
});
