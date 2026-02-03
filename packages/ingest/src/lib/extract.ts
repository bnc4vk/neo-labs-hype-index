import { normalizeWhitespace } from "./normalize";

const VERB_MARKERS = [
  "raises",
  "raised",
  "lands",
  "lands a",
  "closes",
  "secures",
  "snags",
  "announces",
  "announcing",
  "launches",
  "debuts",
  "unveils",
  "introduces",
  "introducing",
  "introducing the",
  "releases",
  "opens",
  "spins",
  "acquires",
  "buys",
  "backs",
  "backing",
  "invests in",
  "investing in",
  "funds",
  "emerges from stealth",
  "funding",
  "seed",
  "series",
  "round",
];

const LEADING_MARKERS = [
  "announcing",
  "introducing",
  "introducing the",
  "meet",
  "backing",
  "investing in",
  "launching",
];

const cleanCandidate = (value: string) =>
  normalizeWhitespace(
    value
      .replace(/[“”"']/g, "")
      .replace(/\s+-\s+.*$/, "")
      .replace(/\s+—\s+.*$/, "")
      .trim(),
  );

export const extractCompanyName = (title: string): string | null => {
  const trimmed = normalizeWhitespace(title);
  const lower = trimmed.toLowerCase();

  for (const marker of LEADING_MARKERS) {
    if (lower.startsWith(`${marker} `)) {
      const candidate = cleanCandidate(trimmed.slice(marker.length).trim());
      if (candidate && candidate.split(" ").length <= 5) {
        return candidate;
      }
    }
  }

  for (const marker of VERB_MARKERS) {
    const idx = lower.indexOf(` ${marker} `);
    if (idx > 1) {
      const candidate = cleanCandidate(trimmed.slice(0, idx));
      if (candidate && candidate.split(" ").length <= 5) {
        return candidate;
      }
    }
  }

  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    const candidate = cleanCandidate(trimmed.slice(0, colonIdx));
    if (candidate && candidate.split(" ").length <= 5) {
      return candidate;
    }
  }

  const dashIdx = trimmed.indexOf(" - ");
  if (dashIdx > 0) {
    const candidate = cleanCandidate(trimmed.slice(0, dashIdx));
    if (candidate && candidate.split(" ").length <= 5) {
      return candidate;
    }
  }

  const pipeIdx = trimmed.indexOf(" | ");
  if (pipeIdx > 0) {
    const candidate = cleanCandidate(trimmed.slice(0, pipeIdx));
    if (candidate && candidate.split(" ").length <= 5) {
      return candidate;
    }
  }

  return null;
};
