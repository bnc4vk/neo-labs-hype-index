type MistralChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type MistralChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const DEFAULT_MODEL = process.env.MISTRAL_MODEL ?? "mistral-large-latest";
const DEFAULT_TIMEOUT_MS = Number(process.env.MISTRAL_TIMEOUT_MS ?? "15000");

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("Mistral request timed out")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

export const callMistralChat = async (messages: MistralChatMessage[]) => {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("Missing MISTRAL_API_KEY");
  }

  const response = await withTimeout(
    fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    }),
    DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Mistral request failed (${response.status})`);
  }

  return (await response.json()) as MistralChatResponse;
};

export const extractJsonContent = (payload: MistralChatResponse) => {
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
};
