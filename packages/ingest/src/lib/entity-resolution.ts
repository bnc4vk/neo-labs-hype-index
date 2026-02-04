import { extractCompanyName } from "./extract";
import { normalizeWhitespace } from "./normalize";
import { isLikelyCompanyName } from "./neolab";
import { callMistralChat, extractJsonContent } from "./llm/mistral";
import { getEntityResolutionMode } from "./settings";

export type EntityResolutionInput = {
  url: string;
  title?: string | null;
  snippet?: string | null;
  metaSnippet?: string | null;
  jsonLdNames?: string[];
  fallbackNames?: string[];
};

type ResolutionResult = {
  companyNames: string[];
  candidates: string[];
  mode: "llm" | "heuristic" | "hybrid";
};

const MAX_FIELD_LENGTH = 600;
let warnedMissingKey = false;

const truncate = (value?: string | null) => {
  if (!value) {
    return null;
  }
  if (value.length <= MAX_FIELD_LENGTH) {
    return value;
  }
  return value.slice(0, MAX_FIELD_LENGTH);
};

const normalizeCandidate = (value: string) => normalizeWhitespace(value).trim();

const cleanPrefixes = (value: string) => {
  const trimmed = normalizeWhitespace(value);
  const lowered = trimmed.toLowerCase();
  const prefixes = [
    "exclusive:",
    "exclusive",
    "ai startup",
    "startup",
    "new startup",
    "ai lab",
    "research lab",
  ];
  for (const prefix of prefixes) {
    if (lowered.startsWith(`${prefix} `)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return trimmed;
};

const buildHeuristicCandidates = (input: EntityResolutionInput) => {
  const candidates = new Set<string>();
  const add = (value?: string | null) => {
    if (!value) {
      return;
    }
    const cleaned = cleanPrefixes(normalizeCandidate(value));
    if (!cleaned) {
      return;
    }
    candidates.add(cleaned);
  };

  for (const name of input.jsonLdNames ?? []) {
    add(name);
  }

  const title = input.title ?? "";
  if (title) {
    const extracted = extractCompanyName(title);
    if (extracted) {
      add(extracted);
    }
  }

  for (const fallback of input.fallbackNames ?? []) {
    add(fallback);
  }

  return Array.from(candidates);
};

const isSuspiciousCandidate = (value: string) => {
  const cleaned = cleanPrefixes(value);
  if (!isLikelyCompanyName(cleaned)) {
    return true;
  }
  const lowered = cleaned.toLowerCase();
  const stopPhrases = ["ai startup", "startup", "exclusive", "funding", "raises", "raised", "series", "seed"];
  if (stopPhrases.some((phrase) => lowered.includes(phrase))) {
    return true;
  }
  return false;
};

const resolveWithMistral = async (input: EntityResolutionInput, candidates: string[]) => {
  const system =
    "You extract the single most likely company name from the given evidence. Return JSON: {\"company_name\": string|null}.";
  const userPayload = {
    url: input.url,
    title: truncate(input.title),
    snippet: truncate(input.snippet),
    meta_description: truncate(input.metaSnippet),
    json_ld_names: input.jsonLdNames ?? [],
    candidate_hints: candidates,
    rules: [
      "Return null if no specific company is mentioned.",
      "Remove generic descriptors like 'AI startup', 'startup', or 'company'.",
      "Preserve brand words like 'Labs' if they are part of the name.",
      "Return only the company name, not investors or people.",
    ],
  };

  const response = await callMistralChat([
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(userPayload) },
  ]);

  const parsed = extractJsonContent(response);
  const raw = parsed?.company_name;
  if (typeof raw !== "string") {
    return null;
  }
  const cleaned = cleanPrefixes(normalizeCandidate(raw));
  if (!cleaned) {
    return null;
  }
  return cleaned;
};

export const resolveCompanyName = async (input: EntityResolutionInput): Promise<ResolutionResult> => {
  const mode = getEntityResolutionMode();
  const heuristicCandidates = buildHeuristicCandidates(input);
  const hasKey = Boolean(process.env.MISTRAL_API_KEY);

  const warnMissingKey = () => {
    if (warnedMissingKey) {
      return;
    }
    warnedMissingKey = true;
    console.warn("[ingest][llm] MISTRAL_API_KEY not set; falling back to heuristic resolution.");
  };

  if (mode === "off") {
    return { companyNames: heuristicCandidates, candidates: heuristicCandidates, mode: "heuristic" };
  }

  if (mode === "llm") {
    if (!hasKey) {
      warnMissingKey();
      return { companyNames: heuristicCandidates, candidates: heuristicCandidates, mode: "llm" };
    }
    try {
      const llmName = await resolveWithMistral(input, heuristicCandidates);
      if (llmName && isLikelyCompanyName(llmName)) {
        return { companyNames: [llmName], candidates: heuristicCandidates, mode: "llm" };
      }
    } catch (error) {
      console.warn("[ingest][llm] entity resolution failed:", error instanceof Error ? error.message : error);
    }
    return { companyNames: heuristicCandidates, candidates: heuristicCandidates, mode: "llm" };
  }

  const shouldCallLlm =
    heuristicCandidates.length === 0 || heuristicCandidates.some((candidate) => isSuspiciousCandidate(candidate));

  if (shouldCallLlm) {
    if (!hasKey) {
      warnMissingKey();
      return { companyNames: heuristicCandidates, candidates: heuristicCandidates, mode: "hybrid" };
    }
    try {
      const llmName = await resolveWithMistral(input, heuristicCandidates);
      if (llmName && isLikelyCompanyName(llmName)) {
        return { companyNames: [llmName], candidates: heuristicCandidates, mode: "hybrid" };
      }
    } catch (error) {
      console.warn("[ingest][llm] entity resolution failed:", error instanceof Error ? error.message : error);
    }
  }

  return { companyNames: heuristicCandidates, candidates: heuristicCandidates, mode: "hybrid" };
};
