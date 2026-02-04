import type { ParallelCompanyOutput } from "./types";
import type { KnownCompany } from "../repo/types";

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
const RESULT_TIMEOUT = readPositiveInt(process.env.PARALLEL_RESULT_TIMEOUT_SECONDS, 60);
const POLL_INTERVAL_MS = readPositiveInt(process.env.PARALLEL_POLL_INTERVAL_MS, 4000);
const MAX_POLL_ATTEMPTS = readPositiveInt(process.env.PARALLEL_MAX_POLL_ATTEMPTS, 20);

const OUTPUT_SCHEMA = {
  type: "json",
  json_schema: {
    type: "object",
    properties: {
      company_name: { type: ["string", "null"] },
      website_url: { type: ["string", "null"] },
      canonical_domain: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      focus: { type: ["string", "null"] },
      employee_count: { type: ["integer", "null"] },
      known_revenue: { type: ["string", "null"] },
      status: { type: ["string", "null"] },
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
    },
    required: [
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
    ],
    additionalProperties: false,
  },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureApiKey = () => {
  if (!process.env.PARALLEL_API_KEY) {
    throw new Error("Missing PARALLEL_API_KEY");
  }
  return process.env.PARALLEL_API_KEY;
};

const requestJson = async (url: string, init: RequestInit, label: string) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status})`);
  }
  return response.json();
};

const requestJsonWithRetry = async (url: string, init: RequestInit, label: string) => {
  try {
    return await requestJson(url, init, label);
  } catch (error) {
    console.warn(`[parallel] ${label} error:`, error instanceof Error ? error.message : error);
    await sleep(1000);
    return requestJson(url, init, label);
  }
};

const fetchTaskResult = async (apiKey: string, runId: string) => {
  const response = await fetch(`${BASE_URL}/v1/tasks/runs/${runId}/result?timeout=${RESULT_TIMEOUT}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 408) {
    return { timeout: true, payload: null };
  }

  if (!response.ok) {
    throw new Error(`fetch task result failed (${response.status})`);
  }

  return { timeout: false, payload: (await response.json()) as TaskResultResponse };
};

type TaskRunResponse = {
  run_id?: string;
  id?: string;
  status?: string;
};

type TaskResultResponse = {
  run?: {
    status?: string;
  };
  output?: {
    type?: string;
    content?: ParallelCompanyOutput;
  };
};

export const runParallelCompanyTask = async (
  company: KnownCompany,
): Promise<ParallelCompanyOutput | null> => {
  const apiKey = ensureApiKey();
  const input = [
    `Company name: ${company.name}.`,
    company.website_url ? `Known website URL: ${company.website_url}.` : null,
    company.canonical_domain ? `Known domain: ${company.canonical_domain}.` : null,
    "Task: Find the official website and return a best-effort company profile.",
    "Return null for fields you cannot confidently determine.",
    "Always attempt to provide website_url and canonical_domain.",
  ].filter(Boolean).join(" ");

  const taskRun = (await requestJsonWithRetry(
    `${BASE_URL}/v1/tasks/runs`,
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        processor: PROCESSOR,
        input,
        task_spec: {
          output_schema: OUTPUT_SCHEMA,
        },
      }),
    },
    "create task run",
  )) as TaskRunResponse;

  const runId = taskRun.run_id ?? taskRun.id;
  if (!runId) {
    throw new Error("Parallel task run did not return run_id");
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    let result: TaskResultResponse | null = null;
    try {
      const { timeout, payload } = await fetchTaskResult(apiKey, runId);
      if (timeout) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      result = payload;
    } catch (error) {
      console.warn(`[parallel] fetch task result error:`, error instanceof Error ? error.message : error);
      await sleep(1000);
      continue;
    }

    if (!result) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const status = result?.run?.status;
    if (status === "completed") {
      const content = result.output?.content ?? null;
      if (!content || typeof content !== "object") {
        return null;
      }
      return content;
    }

    if (status === "failed") {
      console.warn(`[parallel] task ${runId} failed`);
      return null;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.warn(`[parallel] task ${runId} did not complete within polling window`);
  return null;
};
