// src/utils/tokenStorage.ts

export interface StoredToken {
  slug?: string;
  token?: string;
  branchId?: string | null;
  starred?: boolean;
  hasNewUI?: boolean;
  domain?: string;
  [key: string]: unknown;
}

export const loadTokensFromStorage = (): StoredToken[] => {
  try {
    const raw = localStorage.getItem("staffbaseTokens");
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => {
      const t = (item && typeof item === "object" ? item : {}) as StoredToken;
      return {
        ...t,
        slug: t.slug || "unknown-slug",
        token: t.token || "[invalid token]",
        starred: t.starred || false,
        branchId: t.branchId || null,
        hasNewUI: !!t.hasNewUI,
        domain: t.domain || "",
      };
    });
  } catch (err) {
    console.error("Failed to parse stored tokens", err);
    return [];
  }
};

export const saveTokensToStorage = (tokens: StoredToken[]): void => {
  try {
    localStorage.setItem("staffbaseTokens", JSON.stringify(tokens));
  } catch (err) {
    console.error("Failed to save tokens", err);

    // If the above fails, try to save a minimal version to avoid data loss.
    const minimalTokens = tokens.map((t) => ({
      slug: t.slug,
      token: t.token,
      branchId: t.branchId,
      starred: t.starred,
      hasNewUI: t.hasNewUI,
      domain: t.domain || "",
    }));

    try {
      localStorage.setItem("staffbaseTokens", JSON.stringify(minimalTokens));
    } catch (e) {
      console.error("Failed to save minimal tokens either", e);
    }
  }
};
