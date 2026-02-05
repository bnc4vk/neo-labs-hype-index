import type { KnownCompany } from "../repo/types";
import type { ParallelCompanyOutput } from "./types";

const readPositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const BASE_URL = process.env.PARALLEL_BASE_URL ?? "https://api.parallel.ai";
const PROCESSOR = process.env.PARALLEL_PROCESSOR ?? "core";
const GROUP_POLL_INTERVAL_MS = readPositiveInt(process.env.PARALLEL_GROUP_POLL_INTERVAL_MS, 5000);
const GROUP_MAX_POLL_ATTEMPTS = readPositiveInt(process.env.PARALLEL_GROUP_MAX_POLL_ATTEMPTS, 240);

const ensureApiKey = () => {
  const key = process.env.PARALLEL_API_KEY;
  if (!key) {
    throw new Error("Missing PARALLEL_API_KEY");
  }
  return key;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const requestJson = async <T>(url: string, init: RequestInit, label: string): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status})`);
  }
  return (await response.json()) as T;
};

const requestJsonWithRetry = async <T>(url: string, init: RequestInit, label: string): Promise<T> => {
  try {
    return await requestJson<T>(url, init, label);
  } catch (error) {
    console.warn(`[parallel] ${label} error:`, error instanceof Error ? error.message : error);
    await sleep(1000);
    return requestJson<T>(url, init, label);
  }
};

type TaskGroupCreateResponse = {
  taskgroup_id?: string;
};

type TaskGroupRunInput = {
  processor?: string;
  input: {
    company_id: string;
    company_name: string;
    company_website?: string | null;
  };
};

type TaskGroupAddRunsResponse = {
  run_ids?: string[];
};

type TaskGroupStatus = {
  is_active?: boolean;
  task_run_status_counts?: Record<string, number>;
};

type TaskGroupResponse = {
  taskgroup_id?: string;
  status?: TaskGroupStatus;
};

type TaskRunResultResponse = {
  run?: {
    status?: string;
  };
  output?: {
    content?: ParallelCompanyOutput;
  };
};

const OUTPUT_SCHEMA = {
  type: "json",
  json_schema: {
    type: "object",
    properties: {
      company_id: {
        type: ["string", "null"],
        description: "Echo the company_id from input.",
      },
      company_name: { type: ["string", "null"] },
      website_url: {
        type: ["string", "null"],
        description: "Official website URL if confidently identified.",
      },
      canonical_domain: {
        type: ["string", "null"],
        description: "Canonical domain for the official website.",
      },
      description: { type: ["string", "null"] },
      focus: {
        type: ["string", "null"],
        description:
          "One concise sentence describing the company's focus. Soft limit ~120 characters. No funding, valuation, or revenue details.",
      },
      employee_count: { type: ["integer", "null"] },
      known_revenue: { type: ["string", "null"] },
      status: {
        type: ["string", "null"],
        description: "One of: active | stealth | inactive | unknown.",
      },
      founded_year: { type: ["integer", "null"] },
      hq_location: { type: ["string", "null"] },
      sources: {
        type: ["array", "null"],
        items: {
          type: "object",
          properties: {
            url: { type: ["string", "null"] },
            title: { type: ["string", "null"] },
            publisher: { type: ["string", "null"] },
            published_at: { type: ["string", "null"] },
          },
          required: ["url", "title", "publisher", "published_at"],
          additionalProperties: false,
        },
      },
      funding_rounds: {
        type: ["array", "null"],
        description:
          "Up to 5 notable funding rounds. If exact rounds are unavailable, include a single summary entry with round_type 'total' and amount_usd (total funding to date) and optional valuation_usd.",
        items: {
          type: "object",
          properties: {
            round_type: { type: ["string", "null"] },
            amount_usd: { type: ["integer", "null"] },
            valuation_usd: {
              type: ["integer", "null"],
              description: "Post-money valuation in USD if publicly reported; otherwise null.",
            },
            announced_at: {
              type: ["string", "null"],
              description: "YYYY-MM-DD if known.",
            },
            investors: {
              type: ["array", "null"],
              items: { type: "string" },
            },
            source_url: { type: ["string", "null"] },
          },
          required: [
            "round_type",
            "amount_usd",
            "valuation_usd",
            "announced_at",
            "investors",
            "source_url",
          ],
          additionalProperties: false,
        },
      },
    },
    required: [
      "company_id",
      "company_name",
      "website_url",
      "canonical_domain",
      "description",
      "focus",
      "employee_count",
      "known_revenue",
      "status",
      "founded_year",
      "hq_location",
      "sources",
      "funding_rounds",
    ],
    additionalProperties: false,
  },
};

const INPUT_SCHEMA = {
  type: "json",
  json_schema: {
    type: "object",
    properties: {
      company_id: { type: "string" },
      company_name: { type: "string" },
      company_website: { type: ["string", "null"] },
    },
    required: ["company_id", "company_name"],
    additionalProperties: false,
  },
};

export const runParallelCompanyTasks = async (
  companies: KnownCompany[],
): Promise<Map<string, ParallelCompanyOutput | null>> => {
  const apiKey = ensureApiKey();
  if (companies.length === 0) {
    return new Map();
  }

  const created = await requestJsonWithRetry<TaskGroupCreateResponse>(
    `${BASE_URL}/v1beta/tasks/groups`,
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
    "create task group",
  );

  const groupId = created.taskgroup_id;
  if (!groupId) {
    throw new Error("Parallel did not return taskgroup_id");
  }

  const inputs: TaskGroupRunInput[] = companies.map((company) => ({
    processor: PROCESSOR,
    input: {
      company_id: company.id,
      company_name: company.name,
      company_website: company.website_url ?? null,
    },
  }));

  const addResponse = await requestJsonWithRetry<TaskGroupAddRunsResponse>(
    `${BASE_URL}/v1beta/tasks/groups/${groupId}/runs`,
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        default_task_spec: {
          input_schema: INPUT_SCHEMA,
          output_schema: OUTPUT_SCHEMA,
        },
        inputs,
      }),
    },
    "add task runs",
  );

  const runIds = addResponse.run_ids ?? [];
  if (runIds.length !== inputs.length) {
    console.warn(`[parallel] expected ${inputs.length} run_ids but got ${runIds.length}`);
  }

  for (let attempt = 0; attempt < GROUP_MAX_POLL_ATTEMPTS; attempt += 1) {
    const group = await requestJsonWithRetry<TaskGroupResponse>(
      `${BASE_URL}/v1beta/tasks/groups/${groupId}`,
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
      },
      "fetch task group",
    );

    const isActive = group.status?.is_active ?? false;
    if (!isActive) {
      break;
    }

    await sleep(GROUP_POLL_INTERVAL_MS);
  }

  const results = new Map<string, ParallelCompanyOutput | null>();

  // Fetch results sequentially to keep load low.
  for (const runId of runIds) {
    try {
      const result = await requestJsonWithRetry<TaskRunResultResponse>(
        `${BASE_URL}/v1/tasks/runs/${runId}/result?timeout=30`,
        {
          method: "GET",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        },
        "fetch run result",
      );

      const status = result.run?.status;
      if (status !== "completed") {
        continue;
      }

      const content = result.output?.content ?? null;
      const companyId = content?.company_id ?? null;
      if (companyId) {
        results.set(companyId, content);
      }
    } catch (error) {
      console.warn(`[parallel] run ${runId} result error:`, error instanceof Error ? error.message : error);
    }
  }

  // Ensure all inputs get an entry.
  for (const company of companies) {
    if (!results.has(company.id)) {
      results.set(company.id, null);
    }
  }

  return results;
};
