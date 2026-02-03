export const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

export const normalizeName = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s&-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const mergeAliases = (existing: string[], incoming: string[]) => {
  const merged = new Set(existing);
  for (const alias of incoming) {
    const normalized = normalizeName(alias);
    if (normalized) {
      merged.add(normalized);
    }
  }
  return Array.from(merged);
};

export const pickDefined = <T extends Record<string, unknown>>(input: T) => {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as Partial<T>;
};

export const maxDate = (a?: Date | null, b?: Date | null) => {
  if (!a && !b) {
    return undefined;
  }
  if (!a) {
    return b ?? undefined;
  }
  if (!b) {
    return a;
  }
  return a > b ? a : b;
};
