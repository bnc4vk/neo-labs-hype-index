export const fetchHtml = async (url: string, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "NeoLabsHypeIndex/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed (${response.status})`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};
