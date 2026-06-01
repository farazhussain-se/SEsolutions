const SHARED_DEMO_PASSWORD_PROXY_URL =
  "https://replify-app-hbetc8gmevafbqe0.eastus-01.azurewebsites.net/api/shared-demo-password";
// Cache passwords by slug. TTL: 5 minutes.
const passwordCache = new Map<string, { value: string; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

interface SharedDemoPasswordArgs {
  apiToken?: string;
  apiDomain?: string;
  slug?: string;
}

interface SharedDemoPasswordResponse {
  secret?: string;
  error?: string;
}

export function getSharedDemoPasswordProxyUrl(): string {
  return SHARED_DEMO_PASSWORD_PROXY_URL;
}

export async function fetchSharedDemoPassword(
  { apiToken, apiDomain, slug }: SharedDemoPasswordArgs = {}
): Promise<string> {
  if (!apiToken) {
    throw new Error("Missing admin API key for shared demo password lookup");
  }
  if (!apiDomain) {
    throw new Error("Missing apiDomain for shared demo password lookup");
  }
  if (!slug) {
    throw new Error(
      "Missing slug for shared demo password lookup - was the environment saved before this feature was added?"
    );
  }

  const resolvedApiDomain = apiDomain.trim();

  // Check cache (with TTL)
  const cached = passwordCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const response = await fetch(SHARED_DEMO_PASSWORD_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiToken,
      apiDomain: resolvedApiDomain,
      slug,
    }),
  });

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => ({}))) as SharedDemoPasswordResponse;
    throw new Error(
      errorData.error || `Shared demo password proxy error: ${response.status}`
    );
  }

  const data = (await response.json()) as SharedDemoPasswordResponse;
  if (!data?.secret) {
    throw new Error("Shared demo password proxy returned no secret");
  }

  passwordCache.set(slug, { value: data.secret, ts: Date.now() });
  return data.secret;
}
