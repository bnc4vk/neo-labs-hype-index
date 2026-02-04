import { mkdirSync, writeFileSync, appendFileSync } from "fs";
import { dirname } from "path";
import { normalizeName } from "./normalize";
import { normalizeForComparison } from "./benchmark";
import type { BenchmarkComparison } from "./benchmark";
import type { IngestCandidate, IngestSource, SourceOrigin, SourcePipeline } from "./types";
import { getEntityResolutionMode, getIngestProfile, getLookbackDays, getSearchSettings, getSeedMode } from "./settings";

export type IngestReport = {
  generatedAt: string;
  profile: string;
  lookbackDays: number;
  search: {
    topic: string;
    depth: string;
    maxResults: number;
  };
  seedMode: string;
  entityResolutionMode: string;
  candidates: {
    total: number;
    unique: number;
  };
  benchmark: {
    knownCount: number;
    matchedCount: number;
    matchRate: number;
    weightedMatchRate: number;
    matchedWeight: number;
    totalWeight: number;
    matched: string[];
    missing: string[];
  };
  provenance: {
    sourcesByOrigin: Record<string, number>;
    sourcesByPipeline: Record<string, number>;
    matchedByOrigin: Record<string, number>;
    matchedByPipeline: Record<string, number>;
  };
  extrasSample: string[];
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, "");

const tally = <T extends string>(items: T[]) => {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return counts;
};

const buildMatchLookup = (knownNames: string[]) => {
  const normalized = new Set<string>();
  const collapsed = new Set<string>();
  for (const name of knownNames) {
    const normalizedName = normalizeForComparison(name);
    if (!normalizedName) {
      continue;
    }
    normalized.add(normalizedName);
    collapsed.add(collapseWhitespace(normalizedName));
  }
  return { normalized, collapsed };
};

const isCandidateMatched = (name: string, lookup: ReturnType<typeof buildMatchLookup>) => {
  const normalized = normalizeForComparison(name);
  if (!normalized) {
    return false;
  }
  const collapsed = collapseWhitespace(normalized);
  return lookup.normalized.has(normalized) || lookup.collapsed.has(collapsed);
};

export const buildIngestReport = (
  candidates: IngestCandidate[],
  sources: IngestSource[],
  comparison: BenchmarkComparison,
  knownNames: string[],
  extrasSample: string[],
): IngestReport => {
  const uniqueCandidates = new Set<string>();
  for (const candidate of candidates) {
    const normalized = normalizeName(candidate.company.name);
    if (normalized) {
      uniqueCandidates.add(normalized);
    }
  }

  const lookup = buildMatchLookup(knownNames);
  const matchedCandidates = candidates.filter((candidate) =>
    isCandidateMatched(candidate.company.name, lookup),
  );

  const sourcesByOrigin = tally(
    sources.map((source) => source.origin ?? "unknown"),
  );
  const sourcesByPipeline = tally(
    sources.map((source) => source.pipeline ?? "unknown"),
  );

  const matchedOrigins: SourceOrigin[] = [];
  const matchedPipelines: SourcePipeline[] = [];
  for (const candidate of matchedCandidates) {
    const originSet = new Set<SourceOrigin>();
    const pipelineSet = new Set<SourcePipeline>();
    for (const source of candidate.sources) {
      if (source.origin) {
        originSet.add(source.origin);
      }
      if (source.pipeline) {
        pipelineSet.add(source.pipeline);
      }
    }
    originSet.forEach((origin) => matchedOrigins.push(origin));
    pipelineSet.forEach((pipeline) => matchedPipelines.push(pipeline));
  }

  return {
    generatedAt: new Date().toISOString(),
    profile: getIngestProfile(),
    lookbackDays: getLookbackDays(),
    search: getSearchSettings(),
    seedMode: getSeedMode(),
    entityResolutionMode: getEntityResolutionMode(),
    candidates: {
      total: candidates.length,
      unique: uniqueCandidates.size,
    },
    benchmark: {
      knownCount: comparison.knownCount,
      matchedCount: comparison.matched.length,
      matchRate: comparison.matchRate,
      weightedMatchRate: comparison.weightedMatchRate,
      matchedWeight: comparison.matchedWeight,
      totalWeight: comparison.totalWeight,
      matched: comparison.matched,
      missing: comparison.missing,
    },
    provenance: {
      sourcesByOrigin,
      sourcesByPipeline,
      matchedByOrigin: tally(matchedOrigins),
      matchedByPipeline: tally(matchedPipelines),
    },
    extrasSample,
  };
};

export const writeIngestReport = (report: IngestReport, filePath: string) => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
};

export const writeReportSummary = (report: IngestReport) => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  const lines: string[] = [];
  lines.push("## Ingestion Report");
  lines.push("");
  lines.push(`Profile: **${report.profile}**`);
  lines.push(`Lookback: **${report.lookbackDays} days**`);
  lines.push(`Candidates: **${report.candidates.total}** (unique ${report.candidates.unique})`);
  lines.push(
    `Benchmark match: **${Math.round(report.benchmark.matchRate * 100)}%** | weighted **${Math.round(
      report.benchmark.weightedMatchRate * 100,
    )}%**`,
  );
  lines.push("");
  lines.push("**Matched (benchmark)**: " + (report.benchmark.matched.join(", ") || "none"));
  lines.push("**Missing (benchmark)**: " + (report.benchmark.missing.join(", ") || "none"));
  lines.push("");
  lines.push("### Provenance (Sources)");
  for (const [origin, count] of Object.entries(report.provenance.sourcesByOrigin)) {
    lines.push(`- ${origin}: ${count}`);
  }
  lines.push("### Provenance (Matched)" );
  for (const [origin, count] of Object.entries(report.provenance.matchedByOrigin)) {
    lines.push(`- ${origin}: ${count}`);
  }

  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf-8");
};
