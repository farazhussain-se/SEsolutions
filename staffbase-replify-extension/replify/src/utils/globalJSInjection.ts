const CONTENTS_API =
  "https://api.github.com/repos/Staffbase/solutions-monorepo/contents";

export interface SnippetParam {
  key: string;
  type: "string" | "secret" | "url" | "number" | "boolean";
  required: boolean;
  description: string;
}

export interface Snippet {
  slug: string;
  name: string;
  description: string;
  target: "intranet" | "app" | "studio" | "all";
  version: string;
  match: string[];
  params: SnippetParam[];
  hosted: string | null;
  hostedUrl: string | null;
  updated: string;
}

export interface SnippetsManifest {
  schemaVersion: number;
  pagesBase: string;
  generated: string;
  snippets: Snippet[];
}

async function fetchGitHubFile(ghToken: string, path: string): Promise<string> {
  const res = await fetch(`${CONTENTS_API}/${path}`, {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github.raw",
    },
  });
  if (!res.ok) throw new Error(`GitHub fetch failed (${path}): ${res.status}`);
  return res.text();
}

export async function fetchManifest(ghToken: string): Promise<SnippetsManifest> {
  const text = await fetchGitHubFile(ghToken, "global-js/snippets.json");
  const data = JSON.parse(text) as SnippetsManifest;
  if (data.schemaVersion !== 1)
    throw new Error(`Unsupported manifest version: ${data.schemaVersion}`);
  return data;
}

export async function fetchSnippetSource(ghToken: string, slug: string): Promise<string> {
  try {
    return await fetchGitHubFile(ghToken, `global-js/dist/${slug}.js`);
  } catch {
    return fetchGitHubFile(ghToken, `global-js/dist/${slug}.user.js`);
  }
}

export function matchesTab(patterns: string[], tabUrl: string): boolean {
  return patterns.some((pattern) => {
    try {
      const regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      return new RegExp("^" + regexStr).test(tabUrl);
    } catch {
      return false;
    }
  });
}

export async function applySnippet(
  tabId: number,
  snippet: Snippet,
  config: Record<string, string>,
  ghToken: string,
  envUrl: string
): Promise<void> {
  // Step 1 — env-wide config
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (cfg: Record<string, unknown>) => {
      (window as unknown as Record<string, unknown>).__sb_config = cfg;
    },
    args: [{ apiKey: config.apiKey ?? null, envUrl } as Record<string, unknown>],
  });

  // Step 2 — per-snippet overrides
  const flagKey = "__sb_" + snippet.slug.replace(/-/g, "_") + "_config";
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (key: string, cfg: Record<string, unknown>) => {
      (window as unknown as Record<string, unknown>)[key] = cfg;
    },
    args: [flagKey, config as unknown as Record<string, unknown>],
  });

  // Step 3 — fetch, cache, and inject source as inline <script>
  const src = await fetchSnippetSource(ghToken, snippet.slug);
  await chrome.storage.local.set({ [`ghjs_source_${snippet.slug}`]: src } as Record<string, unknown>);
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (code: string) => {
      const s = document.createElement("script");
      s.textContent = code;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    },
    args: [src],
  });
}

// ── Enabled-list helpers (persist which snippets auto-inject on page load) ──

export async function getEnabledSlugs(hostname: string): Promise<string[]> {
  const key = `ghjs_enabled_${hostname}`;
  const stored = await chrome.storage.local.get(key);
  return (stored[key] as string[] | undefined) ?? [];
}

export async function enableSnippet(hostname: string, slug: string): Promise<void> {
  const key = `ghjs_enabled_${hostname}`;
  const current = await getEnabledSlugs(hostname);
  if (!current.includes(slug)) {
    await chrome.storage.local.set({ [key]: [...current, slug] } as Record<string, unknown>);
  }
}

export async function disableSnippet(hostname: string, slug: string): Promise<void> {
  const key = `ghjs_enabled_${hostname}`;
  const current = await getEnabledSlugs(hostname);
  await chrome.storage.local.set({ [key]: current.filter((s) => s !== slug) } as Record<string, unknown>);
}

export async function removeSnippet(tabId: number, slug: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (s: string) => {
      const loadedKey = "__sb_" + s.replace(/-/g, "_") + "_loaded";
      delete (window as unknown as Record<string, unknown>)[loadedKey];
      document.querySelectorAll(`[data-sb-cust="${s}"]`).forEach((n) => n.remove());
    },
    args: [slug],
  });
}

export async function refreshSnippetConfig(
  tabId: number,
  slug: string,
  config: Record<string, string>
): Promise<void> {
  const flagKey = "__sb_" + slug.replace(/-/g, "_") + "_config";
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (key: string, cfg: Record<string, unknown>) => {
      (window as unknown as Record<string, unknown>)[key] = cfg;
    },
    args: [flagKey, config as unknown as Record<string, unknown>],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => window.dispatchEvent(new PopStateEvent("popstate")),
    args: [],
  });
}
