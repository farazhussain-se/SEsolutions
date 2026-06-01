// utils/helpers.ts

/**
 * Strip markdown JSON code fences from a string.
 */
export const stripJsonFences = (text: string = ''): string =>
  text.replace(/```json\n?/gi, '').replace(/```\n?/g, '');

/**
 * Parse a JSON array from raw text, with fallback extraction strategies.
 */
export const parseJsonArray = (rawText: string = ''): unknown[] | null => {
  const cleaned = stripJsonFences(rawText).trim();
  const tryParse = (text: string): unknown => {
    try { return JSON.parse(text); } catch { return null; }
  };
  const coerceArray = (value: unknown): unknown[] | null => {
    if (Array.isArray(value)) return value;
    if (value !== null && typeof value === 'object') {
      const { chatPairs } = value as Record<string, unknown>;
      if (Array.isArray(chatPairs)) return chatPairs;
    }
    return null;
  };

  let parsed = coerceArray(tryParse(cleaned));
  if (parsed) return parsed;

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    parsed = coerceArray(tryParse(cleaned.slice(arrayStart, arrayEnd + 1)));
    if (parsed) return parsed;
  }

  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    parsed = coerceArray(tryParse(cleaned.slice(objectStart, objectEnd + 1)));
    if (parsed) return parsed;
  }

  return null;
};

/**
 * Builds a full API URL from a path and a domain.
 * Pure function — callers are responsible for supplying the active domain.
 * @param {string} path - API path (with or without leading slash).
 * @param {string} domain - Hostname to use (e.g. "app.staffbase.com").
 * @returns {string} Full URL string.
 */
export const buildApiUrl = (path: string, domain: string): string => {
  const normalisedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${domain}${normalisedPath}`;
};

interface SpaceLike {
  domain?: string;
  links?: { self?: string; space?: string; api?: string; branch?: string };
  url?: string;
}

/**
 * Extracts the hostname from a Staffbase space object.
 * Tries space.domain first, then common link properties.
 * @param {Object|null} space - Space object from the Staffbase API.
 * @param {string} fallbackDomain - Returned when no domain can be resolved.
 * @returns {string} Hostname string.
 */
export const extractDomainFromSpace = (space: SpaceLike | null, fallbackDomain: string): string => {
  if (!space) return fallbackDomain;
  if (typeof space.domain === "string" && space.domain.trim()) {
    const raw = space.domain.trim();
    try {
      const parsed = raw.startsWith("http") ? new URL(raw).hostname : raw.split("/")[0];
      if (parsed) return parsed;
    } catch {
      // ignore and continue
    }
  }

  const linkCandidates = [
    space?.links?.self,
    space?.links?.space,
    space?.links?.api,
    space?.links?.branch,
    space?.url,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);

  for (const link of linkCandidates) {
    try {
      const host = new URL(link).hostname;
      if (host) return host;
    } catch {
      continue;
    }
  }
  return fallbackDomain;
};

/**
 * True when the URL points at a LinkedIn host. LinkedIn localizes via
 * subdomains (uk.linkedin.com, de.linkedin.com, etc.), not country TLDs, so
 * .com covers virtually everything. linkedin.cn is included defensively.
 */
export const isLinkedInUrl = (raw: string | null | undefined): raw is string => {
  if (!raw) return false;
  try {
    const { hostname } = new URL(raw);
    return /(^|\.)linkedin\.(com|cn)$/i.test(hostname);
  } catch {
    return /(^|\.)linkedin\.(com|cn)(\/|$)/i.test(raw);
  }
};

/** Helper: ensure the LinkedIn URL ends with `/posts/?feedView=images`. */
export const normaliseLinkedInUrl = (raw: string): string =>
  raw.replace(/\/posts.*$/i, "").replace(/\/$/, "") + "/posts/?feedView=images";

/**
* Builds the image payload. Original URL has no transforms.
* Thumbs and icons use a standard fill-crop.
*/
interface ImagePayload {
  original: {
    url: string;
    size: number;
    width: number;
    height: number;
    created: string;
    format: string;
    mimeType: string;
  };
  icon: {
    url: string;
    format: string;
    mimeType: string;
  };
  thumb: {
    url: string;
    format: string;
    mimeType: string;
  };
}

export const buildImagePayload = (fileId: string, domain: string = "app.staffbase.com"): ImagePayload => {
    const baseUrl = `https://${domain}/api/media/secure/external/v2/image/upload/`;
    return {
        original: {
            url: `${baseUrl}${fileId}`,
            size: 100000,
            width: 1920,
            height: 1080,
            created: String(Date.now()),
            format: "jpg",
            mimeType: "image/jpeg",
        },
        icon: {
            url: `${baseUrl}c_fill,w_70,h_70/${fileId}`,
            format: "jpg",
            mimeType: "image/jpeg",
        },
        thumb: {
            url: `${baseUrl}c_fill,w_200,h_200/${fileId}`,
            format: "jpg",
            mimeType: "image/jpeg",
        },
    };
};
