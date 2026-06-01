const STORAGE_KEY = "githubAccessToken";

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export class GitHubAuthError extends Error {
  status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "GitHubAuthError";
    this.status = status;
  }
}

export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  let res: Response;
  try {
    res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
  } catch (err) {
    throw new GitHubAuthError(
      `GitHub user fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      null
    );
  }
  if (!res.ok) throw new GitHubAuthError(`GitHub user fetch failed: ${res.status}`, res.status);
  return res.json() as Promise<GitHubUser>;
}

export function saveGitHubToken(token: string): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ [STORAGE_KEY]: token }, resolve));
}

export function loadGitHubToken(): Promise<string | null> {
  return new Promise((resolve) =>
    chrome.storage.local.get(STORAGE_KEY, (result) =>
      resolve((result[STORAGE_KEY] as string) ?? null)
    )
  );
}

export function clearGitHubToken(): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.remove(STORAGE_KEY, resolve));
}
