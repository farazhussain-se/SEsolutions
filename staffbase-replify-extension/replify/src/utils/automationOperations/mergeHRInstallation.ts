import { DEFAULT_WORKDAY_FIELD_TITLE } from '../../constants/appConstants';

const WORKDAY_INSTALLER_URL = 'https://merge-workday-installer-production.up.railway.app/api/v1/workday-merge';

/**
 * Inject a function into the existing active Staffbase tab.
 */
async function runInActiveTab(func: (...args: unknown[]) => unknown, args: unknown[] = []) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: false },
    func,
    args,
  });
  return result;
}

/**
 * Fetch available Merge HR integrations from a Staffbase instance.
 */
export async function fetchMergeIntegrations({ domain }: { domain: string }) {
  return runInActiveTab(async (domain: unknown) => {
    try {
      const res = await fetch(`https://${domain}/api/merge-dev/integrations`, {
        credentials: 'include',
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: true, integrations: Array.isArray(data) ? data : (data?.data ?? []) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [domain]);
}

/**
 * Set up a Merge HR integration.
 * - Workday: single POST to Railway microservice (server-side, no tab injection)
 * - SAP / Paylocity: returns manual: true with credentials for manual Merge Link entry
 */
export async function setupMergeIntegration({
  domain,
  integrationName,
  fieldTitle,
  credentials,
  apiToken,
  onProgress,
}: {
  domain: string;
  integrationName: string;
  fieldTitle: string;
  credentials: Record<string, string>;
  apiToken: string;
  onProgress?: (msg: string) => void;
}) {
  const integrationKey = integrationName.toLowerCase().replace(/\s+/g, '');
  const normalizedFieldTitle = typeof fieldTitle === 'string' ? fieldTitle.trim() : '';

  if (integrationKey !== 'workday') {
    return { ok: true, manual: true, credentials };
  }

  // ── Workday: single Railway POST ──
  onProgress?.('🔍 Checking Railway installer service availability…');
  const healthRes = await fetch(
    'https://merge-workday-installer-production.up.railway.app/api/v1/health',
    { headers: { Authorization: `Bearer ${apiToken}` } }
  ).catch(() => null);

  if (!healthRes?.ok) {
    throw new Error('Workday installer service is unavailable. Please try again later.');
  }

  onProgress?.('🚀 Sending Workday install request to Railway…');
  const res = await fetch(WORKDAY_INSTALLER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      domain,
      email: credentials.email,
      password: credentials.password,
      userStudioIdentifier: normalizedFieldTitle || DEFAULT_WORKDAY_FIELD_TITLE,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(`Workday installer failed (${res.status}): ${err.message || err.error || JSON.stringify(err)}`);
  }

  const result = await res.json();
  onProgress?.('✅ Workday integration installed successfully!');
  return { ok: true, result };
}
