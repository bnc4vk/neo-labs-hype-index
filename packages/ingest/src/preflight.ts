import { lookup } from "dns/promises";
import { fileURLToPath } from "url";
import { prisma } from "@neolabs/db";
import { loadDotEnv, requireEnv } from "./lib/env";

type DatabaseUrlSummary = {
  protocol: string;
  host: string;
  port: string | null;
  database: string;
  sslmode: string | null;
  username: string;
};

export const summarizeDatabaseUrl = (databaseUrl: string): DatabaseUrlSummary => {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`DATABASE_URL must use postgresql:// or postgres://, got ${url.protocol}`);
  }

  return {
    protocol: url.protocol,
    host: url.hostname,
    port: url.port || null,
    database: url.pathname.replace(/^\//, "") || "(missing)",
    sslmode: url.searchParams.get("sslmode"),
    username: redactUsername(url.username),
  };
};

export const getDatabasePreflightAdvice = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("tenant/user") && message.includes("not found")) {
    return [
      "Supabase rejected the pooler tenant/user in DATABASE_URL.",
      "If the project was paused, restore it in the Supabase dashboard and rerun this workflow.",
      "If it is already active, rotate the GitHub DATABASE_URL secret from Supabase's current pooler connection string.",
    ].join(" ");
  }

  if (message.includes("P1001") || message.includes("Can't reach database server")) {
    return [
      "The database host is not reachable.",
      "For GitHub Actions, use Supabase's pooler connection string with sslmode=require.",
      "If the project is paused, restore it before rerunning ingestion.",
    ].join(" ");
  }

  if (message.includes("ENOTFOUND") || message.includes("getaddrinfo")) {
    return [
      "The database hostname does not resolve.",
      "For Supabase this usually means the project is paused or DATABASE_URL points at an old project ref.",
      "Restore the project in the Supabase dashboard, then rotate the GitHub DATABASE_URL secret if the connection string changed.",
    ].join(" ");
  }

  if (message.toLowerCase().includes("password authentication failed")) {
    return "DATABASE_URL reached Postgres but the password was rejected. Rotate the GitHub DATABASE_URL secret.";
  }

  return "Database preflight failed before ingestion could start. Check DATABASE_URL and Supabase project status.";
};

const redactUsername = (username: string) => {
  if (!username) {
    return "(missing)";
  }
  if (username.startsWith("postgres.")) {
    return "postgres.<project-ref>";
  }
  if (username === "postgres") {
    return "postgres";
  }
  return "<redacted>";
};

const main = async () => {
  loadDotEnv();
  requireEnv("DATABASE_URL");
  requireEnv("PARALLEL_API_KEY");

  const databaseUrl = process.env.DATABASE_URL ?? "";
  const summary = summarizeDatabaseUrl(databaseUrl);
  console.log(`[preflight] DATABASE_URL=${JSON.stringify(summary)}`);

  const addresses = await lookup(summary.host, { all: true });
  console.log(
    `[preflight] resolved ${summary.host} to ${addresses
      .map((address) => `IPv${address.family}`)
      .join(", ")}`,
  );

  await prisma.$queryRaw`select 1`;
  console.log("[preflight] database connection ok");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .catch((error) => {
      console.error("[preflight] database connection failed");
      console.error(getDatabasePreflightAdvice(error));
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
