import Parser from "rss-parser";

export type RssItem = {
  title: string | null;
  link: string | null;
  publishedAt: Date | null;
  feedTitle: string | null;
  snippet: string | null;
};

const parser = new Parser();

const fetchText = async (url: string, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "NeoLabsHypeIndex/1.0" },
    });
    if (!response.ok) {
      throw new Error(`Status code ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchRssItems = async (feedUrls: string[]) => {
  const items: RssItem[] = [];

  for (const feedUrl of feedUrls) {
    try {
      const xml = await fetchText(feedUrl);
      const feed = await parser.parseString(xml);
      for (const item of feed.items ?? []) {
        items.push({
          title: item.title ?? null,
          link: item.link ?? item.guid ?? null,
          publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
          feedTitle: feed.title ?? null,
          snippet: (item as unknown as { contentSnippet?: string; content?: string }).contentSnippet ??
            (item as unknown as { contentSnippet?: string; content?: string }).content ??
            null,
        });
      }
    } catch (error) {
      console.warn(`RSS fetch failed for ${feedUrl}:`, error instanceof Error ? error.message : error);
    }
  }

  return items;
};
