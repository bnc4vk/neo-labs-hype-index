import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { normalizeName } from "./normalize";

const COMPARISON_STOP_WORDS = new Set([
  "lab",
  "labs",
  "laboratory",
  "laboratories",
  "inc",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "company",
  "co",
  "holdings",
  "group",
]);

const collapseWhitespace = (value: string) => value.replace(/\s+/g, "");

export const normalizeForComparison = (value: string) => {
  const normalized = normalizeName(value);
  if (!normalized) {
    return "";
  }
  const expanded = normalized.replace(/-/g, " ").replace(/&/g, " and ");
  const tokens = expanded.split(/\s+/g).filter(Boolean);
  const filtered = tokens.filter((token) => !COMPARISON_STOP_WORDS.has(token));
  return filtered.join(" ").trim();
};

export const parseBenchmarkList = (contents: string) =>
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

const getDefaultBenchmarkPath = () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, "..", "..", "benchmarks", "known-neolabs.txt");
};

export const loadBenchmarkList = (filePath = getDefaultBenchmarkPath()) => {
  const contents = readFileSync(filePath, "utf-8");
  return parseBenchmarkList(contents);
};

export type BenchmarkComparison = {
  candidateCount: number;
  uniqueCandidateCount: number;
  knownCount: number;
  matched: string[];
  missing: string[];
  extras: string[];
  matchRate: number;
  weightedMatchRate: number;
  matchedWeight: number;
  totalWeight: number;
};

const buildNormalizedMap = (names: string[]) => {
  const entries: Array<{ name: string; normalized: string }> = [];
  const seen = new Set<string>();
  for (const name of names) {
    const normalized = normalizeForComparison(name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    entries.push({ name, normalized });
  }
  return entries;
};

export const compareCandidates = (candidateNames: string[], knownNames: string[]): BenchmarkComparison => {
  const candidateEntries = buildNormalizedMap(candidateNames);
  const candidateMap = new Map(candidateEntries.map((entry) => [entry.normalized, entry.name]));
  const candidateCollapsed = new Set(candidateEntries.map((entry) => collapseWhitespace(entry.normalized)));

  const knownEntries = buildNormalizedMap(knownNames);
  const knownMap = new Map(knownEntries.map((entry) => [entry.normalized, entry.name]));
  const knownCollapsed = new Set(knownEntries.map((entry) => collapseWhitespace(entry.normalized)));

  const matched: string[] = [];
  const missing: string[] = [];

  const totalWeight = knownEntries.reduce((sum, _entry, index) => sum + (index + 1), 0);
  let matchedWeight = 0;

  for (const [index, entry] of knownEntries.entries()) {
    const collapsed = collapseWhitespace(entry.normalized);
    const isMatch = candidateMap.has(entry.normalized) || candidateCollapsed.has(collapsed);
    if (isMatch) {
      matched.push(entry.name);
      matchedWeight += index + 1;
    } else {
      missing.push(entry.name);
    }
  }

  const extras: string[] = [];
  for (const [normalized, name] of candidateMap.entries()) {
    const collapsed = collapseWhitespace(normalized);
    if (!knownMap.has(normalized) && !knownCollapsed.has(collapsed)) {
      extras.push(name);
    }
  }

  const matchRate = knownEntries.length ? matched.length / knownEntries.length : 0;
  const weightedMatchRate = totalWeight ? matchedWeight / totalWeight : 0;

  return {
    candidateCount: candidateNames.length,
    uniqueCandidateCount: candidateEntries.length,
    knownCount: knownEntries.length,
    matched,
    missing,
    extras,
    matchRate,
    weightedMatchRate,
    matchedWeight,
    totalWeight,
  };
};
