const POSITIVE_PHRASES: Array<[string, number]> = [
  ["research lab", 4],
  ["ai lab", 4],
  ["ai research", 3],
  ["research institute", 4],
  ["research", 2],
  ["laboratory", 2],
  ["institute", 2],
  ["lab", 2],
  ["foundation model", 4],
  ["foundational model", 3],
  ["frontier model", 3],
  ["frontier", 2],
  ["model", 1],
  ["agent", 1],
  ["robotics", 1],
  ["stealth", 2],
  ["emerges from stealth", 4],
  ["superintelligence", 3],
  ["alignment", 2],
  ["safety", 2],
  ["agi", 3],
  ["raises", 3],
  ["raised", 3],
  ["seed", 2],
  ["series a", 2],
  ["series b", 2],
  ["funding", 2],
  ["round", 1],
  ["startup", 2],
  ["founded", 1],
  ["ex-openai", 3],
  ["ex deepmind", 3],
  ["deepmind", 1],
  ["openai", 1],
];

const NEGATIVE_PHRASES: Array<[string, number]> = [
  ["supreme court", 8],
  ["court", 5],
  ["government", 4],
  ["regulator", 3],
  ["whatsapp", 6],
  ["waymo", 6],
  ["spacex", 6],
  ["tesla", 5],
  ["microsoft", 5],
  ["google", 5],
  ["meta", 5],
  ["elon musk", 5],
  ["plans", 2],
  ["preview", 2],
  ["review", 2],
  ["opinion", 2],
  ["podcast", 2],
];

const normalizeText = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

export const scoreNeolabRelevance = (input: { title?: string | null; snippet?: string | null }) => {
  const title = normalizeText(input.title ?? "");
  const snippet = normalizeText(input.snippet ?? "");
  const text = `${title} ${snippet}`.trim();

  if (!text) {
    return { score: 0, reasons: ["empty"] };
  }

  let score = 0;
  const reasons: string[] = [];

  for (const [phrase, weight] of POSITIVE_PHRASES) {
    if (text.includes(phrase)) {
      score += weight;
      reasons.push(`+${weight}:${phrase}`);
    }
  }

  for (const [phrase, weight] of NEGATIVE_PHRASES) {
    if (text.includes(phrase)) {
      score -= weight;
      reasons.push(`-${weight}:${phrase}`);
    }
  }

  // Titles that are almost certainly not company-led headlines.
  if (title.startsWith("how to ") || title.startsWith("why ") || title.startsWith("what ")) {
    score -= 2;
    reasons.push("-2:how/why/what");
  }

  return { score, reasons };
};

export const isLikelyCompanyName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.length > 60) {
    return false;
  }
  const words = trimmed.split(/\s+/g);
  if (words.length > 6) {
    return false;
  }
  const lowered = trimmed.toLowerCase();
  const hardReject = [
    "supreme court",
    "court",
    "government",
    "railway",
    "valley",
    "plans",
    "whatsapp",
    "waymo",
    "spacex",
  ];
  if (hardReject.some((term) => lowered.includes(term))) {
    return false;
  }
  return true;
};
