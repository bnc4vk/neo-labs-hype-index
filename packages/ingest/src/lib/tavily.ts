export type TavilyResult = {
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  publisher: string | null;
};

type TavilyResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    published_date?: string;
    source?: string;
  }>;
};

type TavilyOptions = {
  days?: number;
  topic?: "news" | "general";
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
};

export const searchTavily = async (
  query: string,
  apiKey: string,
  options: TavilyOptions = {},
): Promise<TavilyResult[]> => {
  const {
    days = 14,
    topic = "news",
    maxResults = 5,
    searchDepth = "basic",
  } = options;
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      topic,
      max_results: maxResults,
      days,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed (${response.status})`);
  }

  const payload = (await response.json()) as TavilyResponse;

  return (
    payload.results?.map((result) => ({
      title: result.title ?? null,
      url: result.url ?? null,
      publishedAt: result.published_date ? new Date(result.published_date) : null,
      publisher: result.source ?? null,
    })) ?? []
  );
};
