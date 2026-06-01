// Gemini API Proxy - calls our Supabase Edge Function instead of Gemini directly
// This keeps the API key server-side

const GEMINI_PROXY_URL =
  "https://lhxtgvzdzumwjlnpieog.supabase.co/functions/v1/gemini-proxy";

interface GeminiAuth {
  apiToken?: string;
  apiDomain?: string;
  sessionToken?: string;
  issueSession?: boolean;
}

interface GeminiProxyError {
  error?: string;
}

export interface GeminiProxySessionResponse {
  sessionToken?: string;
}

/**
 * Call Gemini API through the secure proxy.
 */
export async function callGeminiProxy<T = unknown>(
  requestBody: Record<string, unknown>,
  model: string = "gemini-2.5-flash",
  auth: GeminiAuth = {}
): Promise<T> {
  const { apiToken, apiDomain } = auth;

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...requestBody,
      model,
      apiToken,
      apiDomain,
      sessionToken: auth.sessionToken,
      issueSession: auth.issueSession,
    }),
  });

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => ({}))) as GeminiProxyError;
    throw new Error(errorData.error || `Gemini proxy error: ${response.status}`);
  }

  return (await response.json()) as T;
}

/**
 * Get the proxy URL for direct fetch calls (for cases where we need more control).
 */
export function getGeminiProxyUrl(): string {
  return GEMINI_PROXY_URL;
}

export default callGeminiProxy;
