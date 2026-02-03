import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { collectCandidatesFromSources, ingestFromSources } from "./lib/ingest";
import { normalizeName } from "./lib/normalize";
import { PrismaRepository } from "./repo/prisma";

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

const KNOWN_NEOLABS = [
  "Humans&",
  "Thinking Machines Lab",
  "Inception Labs",
  "Safe Superintelligence",
  "Flapping Airplanes",
  "Black Forest Labs",
  "Periodic Labs",
  "World Labs",
  "Axiom Math",
  "Logical Intelligence",
];

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

const normalizeForComparison = (value: string) => {
  const normalized = normalizeName(value);
  if (!normalized) {
    return "";
  }
  const expanded = normalized.replace(/-/g, " ").replace(/&/g, " and ");
  const tokens = expanded.split(/\s+/g).filter(Boolean);
  const filtered = tokens.filter((token) => !COMPARISON_STOP_WORDS.has(token));
  return filtered.join(" ").trim();
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, "");

const compareCandidates = (candidateNames: string[]) => {
  const candidateMap = new Map<string, string>();
  const candidateCollapsed = new Set<string>();
  for (const name of candidateNames) {
    const normalized = normalizeForComparison(name);
    if (!normalized || candidateMap.has(normalized)) {
      continue;
    }
    candidateMap.set(normalized, name);
    candidateCollapsed.add(collapseWhitespace(normalized));
  }

  const knownMap = new Map<string, string>();
  const knownCollapsed = new Set<string>();
  for (const name of KNOWN_NEOLABS) {
    const normalized = normalizeForComparison(name);
    if (!normalized || knownMap.has(normalized)) {
      continue;
    }
    knownMap.set(normalized, name);
    knownCollapsed.add(collapseWhitespace(normalized));
  }

  const matched: string[] = [];
  const missing: string[] = [];

  for (const [normalized, name] of knownMap.entries()) {
    const collapsed = collapseWhitespace(normalized);
    if (candidateMap.has(normalized) || candidateCollapsed.has(collapsed)) {
      matched.push(name);
    } else {
      missing.push(name);
    }
  }

  const extras: string[] = [];
  for (const [normalized, name] of candidateMap.entries()) {
    const collapsed = collapseWhitespace(normalized);
    if (!knownMap.has(normalized) && !knownCollapsed.has(collapsed)) {
      extras.push(name);
    }
  }

  const matchRate = knownMap.size ? matched.length / knownMap.size : 0;

  return {
    candidateCount: candidateNames.length,
    uniqueCandidateCount: candidateMap.size,
    knownCount: knownMap.size,
    matched,
    missing,
    extras,
    matchRate,
  };
};

const main = async () => {
  loadDotEnv();
  const dryRun = process.env.INGEST_DRY_RUN === "1" || process.env.INGEST_MODE === "compare";

  if (!dryRun) {
    requireEnv("DATABASE_URL");
  }

  if (dryRun) {
    const candidates = await collectCandidatesFromSources();
    const uniqueNames = Array.from(
      new Set(candidates.map((candidate) => candidate.company.name)),
    );
    const comparison = compareCandidates(uniqueNames);

    if (process.env.INGEST_PRINT_CANDIDATES === "1") {
      console.log("[compare] candidate list:", uniqueNames.sort());
    }

    console.log("[compare] candidates:", comparison.candidateCount);
    console.log("[compare] unique candidates:", comparison.uniqueCandidateCount);
    console.log("[compare] known list:", comparison.knownCount);
    console.log("[compare] matched:", comparison.matched.length, comparison.matched.sort());
    console.log("[compare] missing:", comparison.missing.length, comparison.missing.sort());
    console.log("[compare] match rate:", `${Math.round(comparison.matchRate * 100)}%`);
    console.log("[compare] extras sample:", comparison.extras.sort().slice(0, 20));
    return;
  }

  const repo = new PrismaRepository();
  const summary = await ingestFromSources(repo);

  console.log("Ingestion complete:", summary);
};

main().catch((error) => {
  console.error("Ingestion failed:", error);
  process.exitCode = 1;
});
