import { describe, expect, it } from "vitest";
import { getDatabasePreflightAdvice, summarizeDatabaseUrl } from "../src/preflight";

describe("database preflight helpers", () => {
  it("redacts pooler usernames while preserving diagnostic fields", () => {
    expect(
      summarizeDatabaseUrl(
        "postgresql://postgres.project-ref:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require",
      ),
    ).toEqual({
      protocol: "postgresql:",
      host: "aws-0-eu-west-1.pooler.supabase.com",
      port: "6543",
      database: "postgres",
      sslmode: "require",
      username: "postgres.<project-ref>",
    });
  });

  it("returns Supabase restore advice for missing pooler tenants", () => {
    expect(
      getDatabasePreflightAdvice(
        new Error("Error querying the database: FATAL: (ENOTFOUND) tenant/user postgres.example not found"),
      ),
    ).toContain("restore it in the Supabase dashboard");
  });

  it("returns Supabase restore advice for unresolved database hosts", () => {
    expect(getDatabasePreflightAdvice(new Error("getaddrinfo ENOTFOUND db.example.supabase.co"))).toContain(
      "project is paused",
    );
  });
});
