import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { PrismaRepository } from "./repo/prisma";
import { loadSeedList } from "./lib/seed";
import { runParallelCompanyTask } from "./lib/parallel";
import { applyRefreshUpdate } from "./lib/refresh";
import { normalizeName } from "./lib/normalize";

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

const getMode = () => {
  const arg = process.argv[2]?.toLowerCase();
  if (arg === "bootstrap" || arg === "refresh") {
    return arg;
  }
  const env = process.env.INGEST_MODE?.toLowerCase();
  if (env === "bootstrap" || env === "refresh") {
    return env;
  }
  return "refresh";
};

const runBootstrap = async () => {
  const repo = new PrismaRepository();
  const seeds = Array.from(new Set(loadSeedList()));
  if (!seeds.length) {
    console.warn("[ingest] seed list is empty; nothing to bootstrap");
    return;
  }

  let created = 0;
  let updated = 0;

  for (const name of seeds) {
    const alias = normalizeName(name) || null;
    const result = await repo.upsertSeedCompany({ name, alias });
    if (result.created) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  console.log(`[bootstrap] completed. created=${created} updated=${updated}`);
};

const runRefresh = async () => {
  requireEnv("PARALLEL_API_KEY");
  const repo = new PrismaRepository();
  const companies = await repo.listCompanies();

  if (!companies.length) {
    console.warn("[refresh] no companies found; run bootstrap first");
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const company of companies) {
    console.log(`[refresh] ${company.name}`);
    try {
      const output = await runParallelCompanyTask(company);
      const { update, sources } = applyRefreshUpdate(company, output);
      if (!update) {
        failed += 1;
        continue;
      }

      await repo.updateCompanyFromRefresh(company.id, update);
      updated += 1;

      for (const source of sources) {
        const result = await repo.upsertSource(source);
        await repo.linkCompanySource(company.id, result.record.id, "overview");
      }
    } catch (error) {
      failed += 1;
      console.warn(
        `[refresh] failed for ${company.name}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(`[refresh] completed. updated=${updated} failed=${failed}`);
};

const main = async () => {
  loadDotEnv();
  requireEnv("DATABASE_URL");

  const mode = getMode();
  if (mode === "bootstrap") {
    await runBootstrap();
    return;
  }

  await runRefresh();
};

main().catch((error) => {
  console.error("Ingestion failed:", error);
  process.exitCode = 1;
});
