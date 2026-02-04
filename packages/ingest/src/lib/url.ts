const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_reader",
  "utm_referrer",
  "utm_pubreferrer",
  "utm_swu",
  "ref",
  "referrer",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "cmpid",
  "ocid",
  "icid",
  "vero_id",
  "vero_conv",
  "igshid",
  "s",
  "spm",
  "guce_referrer",
  "guce_referrer_sig",
]);

const TRACKING_PREFIXES = ["utm_"];

const normalizeHostname = (hostname: string) =>
  hostname.toLowerCase().replace(/^www\./, "");

const isTrackingParam = (key: string) => {
  if (TRACKING_PARAMS.has(key)) {
    return true;
  }
  return TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix));
};

export const normalizeUrl = (input: string): string | null => {
  try {
    const url = new URL(input);
    url.hash = "";
    url.hostname = normalizeHostname(url.hostname);

    const params = new URLSearchParams(url.search);
    const cleaned = new URLSearchParams();

    for (const [key, value] of params.entries()) {
      if (!isTrackingParam(key)) {
        cleaned.append(key, value);
      }
    }

    const cleanedParams = cleaned.toString();
    url.search = cleanedParams ? `?${cleanedParams}` : "";

    if (url.pathname.endsWith("/") && url.pathname !== "/") {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return null;
  }
};

export const getHostname = (input: string): string | null => {
  try {
    const url = new URL(input);
    return normalizeHostname(url.hostname);
  } catch {
    return null;
  }
};
