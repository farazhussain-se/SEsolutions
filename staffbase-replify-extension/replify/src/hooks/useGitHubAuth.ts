import { useState, useEffect, useCallback } from "react";
import {
  fetchGitHubUser,
  saveGitHubToken,
  loadGitHubToken,
  clearGitHubToken,
  GitHubAuthError,
} from "../utils/githubAuth";
import type { GitHubUser } from "../utils/githubAuth";

type AuthStatus = "idle" | "validating" | "authenticated" | "expired" | "error";

export interface GitHubAuthState {
  status: AuthStatus;
  user: GitHubUser | null;
  error: string | null;
  submitToken: (pat: string) => Promise<void>;
  logout: () => Promise<void>;
}

export default function useGitHubAuth(): GitHubAuthState {
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGitHubToken().then(async (token) => {
      if (!token) return;
      try {
        const ghUser = await fetchGitHubUser(token);
        setUser(ghUser);
        setStatus("authenticated");
      } catch (err) {
        // A 401 is the only signal we trust as "expired". For network blips
        // or 5xx we retry once before giving up — see report from users that
        // valid tokens were being marked expired after a transient failure.
        const status = err instanceof GitHubAuthError ? err.status : null;
        if (status === 401) {
          setStatus("expired");
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
        try {
          const ghUser = await fetchGitHubUser(token);
          setUser(ghUser);
          setStatus("authenticated");
        } catch (retryErr) {
          const retryStatus = retryErr instanceof GitHubAuthError ? retryErr.status : null;
          setStatus(retryStatus === 401 ? "expired" : "error");
          if (retryStatus !== 401) {
            setError("Couldn't reach GitHub. Check your connection and try again.");
          }
        }
      }
    });
  }, []);

  const submitToken = useCallback(async (pat: string) => {
    setStatus("validating");
    setError(null);
    try {
      const ghUser = await fetchGitHubUser(pat);
      await saveGitHubToken(pat);
      setUser(ghUser);
      setStatus("authenticated");
    } catch {
      setStatus("error");
      setError("Invalid token or insufficient permissions. Make sure it has repo and read:org scopes.");
    }
  }, []);

  const logout = useCallback(async () => {
    await clearGitHubToken();
    setUser(null);
    setError(null);
    setStatus("idle");
  }, []);

  return { status, user, error, submitToken, logout };
}
