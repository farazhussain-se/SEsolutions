// hooks/useSavedTokens.ts
// This hook manages saved tokens in local storage.

import { useEffect, useState } from "react";
import {
  loadTokensFromStorage,
  saveTokensToStorage,
  type StoredToken,
} from "../utils/tokenStorage";

export interface DisplayToken {
  slug?: string;
  branchId?: string | null;
  domain: string;
  truncatedToken: string;
  fullToken?: string;
  hasNewUI?: boolean;
  starred?: boolean;
}

type TokenUpdater =
  | DisplayToken[]
  | ((prev: DisplayToken[]) => DisplayToken[]);

export default function useSavedTokens(): [
  DisplayToken[],
  (updater: TokenUpdater) => void,
] {
  const [tokens, setTokens] = useState<DisplayToken[]>([]);

  useEffect(() => {
    setTokens(
      loadTokensFromStorage().map((t: StoredToken) => ({
        slug: typeof t.slug === "string" ? t.slug : undefined,
        branchId:
          typeof t.branchId === "string" || t.branchId === null
            ? t.branchId
            : null,
        domain: typeof t.domain === "string" ? t.domain : "",
        truncatedToken:
          typeof t.token === "string" && t.token.trim().length >= 8
            ? `${t.token.trim().substring(0, 8)}.....`
            : "[invalid token]",
        fullToken: typeof t.token === "string" ? t.token : undefined,
        hasNewUI: !!t.hasNewUI,
        starred: !!t.starred,
      }))
    );
  }, []);

  const updateTokens = (updater: TokenUpdater) => {
    setTokens((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveTokensToStorage(
        next.map((t) => ({
          slug: t.slug,
          token: t.fullToken,
          branchId: t.branchId,
          domain: t.domain || "",
          hasNewUI: t.hasNewUI,
          starred: t.starred,
        }))
      );
      return next;
    });
  };

  return [tokens, updateTokens];
}
