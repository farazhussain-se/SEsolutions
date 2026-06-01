/**
 * Environment operations - shared helpers for automation
 * These are low-level utilities used by other atomic operations
 */

import { getGeminiProxyUrl } from '../geminiProxy';
import { fetchSharedDemoPassword } from '../sharedDemoPasswordProxy';
import { buildApiUrl } from '../helpers';
export { buildApiUrl } from '../helpers';
import type { OperationContext } from './types';

/**
 * Get fresh CSRF token from the page
 */
export const getCsrfToken = async () => {
  const response = await fetch('/auth/discover', {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.staffbase.auth.discovery.v2+json',
      'Content-Type': 'application/json',
    }
  });
  if (!response.ok) {
    const meta = document.querySelector('meta[name="x-csrf-token"]') as HTMLMetaElement | null;
    return meta?.content || '';
  }
  const data = await response.json();
  return data?.csrfToken || '';
};

/**
 * Fetch all groups from the environment
 */
export const fetchGroups = async (_args: Record<string, unknown>, ctx: OperationContext) => {
  const { apiToken, apiDomain, branchId } = ctx;
  if (!apiToken) return { groups: [] };

  const url = branchId
    ? buildApiUrl('/api/branch/groups', apiDomain)
    : buildApiUrl('/api/groups', apiDomain);

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${apiToken}` }
  });

  if (!res.ok) return { groups: [] };
  const data = await res.json();
  return { groups: data?.data || [] };
};

/**
 * Fetch all users from the environment
 */
export const fetchUsers = async (args: { limit?: number }, ctx: OperationContext) => {
  const { limit = 200 } = args || {};
  const { apiToken, apiDomain } = ctx;

  const res = await fetch(buildApiUrl(`/api/users?limit=${limit}`, apiDomain), {
    headers: { Authorization: `Basic ${apiToken}` }
  });

  if (!res.ok) throw new Error(`Failed to fetch users (${res.status})`);
  const data = await res.json();
  return { users: data?.data || [] };
};

/**
 * Fetch profile fields schema
 */
export const fetchProfileFields = async (_args: Record<string, unknown>, ctx: OperationContext) => {
  const { apiToken, apiDomain, branchId } = ctx;

  const url = branchId
    ? buildApiUrl(`/api/branches/${branchId}/profilefields`, apiDomain)
    : buildApiUrl('/api/profilefields', apiDomain);

  const resp = await fetch(url, {
    headers: { Authorization: `Basic ${apiToken}` }
  });

  if (!resp.ok) throw new Error(`Profile fields fetch failed (${resp.status})`);
  const data = await resp.json();

  let fields: { slug: string; title: string }[] = [];
  if (Array.isArray(data?.data)) {
    fields = data.data;
  } else if (data?.schema && typeof data.schema === 'object') {
    fields = Object.keys(data.schema).map(slug => {
      const field = data.schema[slug] || {};
      return {
        slug,
        title: field.localization?.en_US?.title || field.localization?.de_DE?.title || slug,
      };
    });
  }

  return { profileFields: fields };
};

/**
 * Fetch admin user ID from the environment
 */
export const fetchAdminUserId = async (_args: Record<string, unknown>, ctx: OperationContext) => {
  const { apiToken, apiDomain } = ctx;

  try {
    const resp = await fetch(buildApiUrl('/api/users?limit=100', apiDomain), {
      headers: { Authorization: `Basic ${apiToken}` }
    });
    if (!resp.ok) throw new Error(`Status ${resp.status}`);
    const data = await resp.json();
    const admins = (data?.data || []).filter((u: { branchRole?: string }) => u.branchRole === 'WeBranchAdminRole');
    return { adminUserId: admins[0]?.id || null };
  } catch (error) {
    console.warn('Failed to auto-fetch admin ID', error);
    return { adminUserId: null };
  }
};

/**
 * Find primary email from user object
 */
export const findPrimaryEmail = (user: { emails?: { primary?: boolean; value?: string }[] }) => {
  return user?.emails?.find(e => e.primary)?.value || user?.emails?.[0]?.value || null;
};

/**
 * Fetch group members by group ID
 */
export const fetchGroupMembers = async (args: { groupId?: string }, ctx: OperationContext) => {
  const { groupId } = args;
  const { apiToken } = ctx;

  const csrfToken = await getCsrfToken();
  const headers = {
    Authorization: `Basic ${apiToken}`,
    'x-csrf-token': csrfToken,
    'Accept': 'application/vnd.staffbase.accessors.group.members-search.v1+json'
  };

  const resp = await fetch(`/api/groups/${groupId}/members/search?limit=200`, { headers });
  if (!resp.ok) throw new Error(`Group member fetch failed (${resp.status})`);

  const data = await resp.json();
  const members = (data?.entries || []).map((entry: { data?: Record<string, unknown> }) => {
    const d = entry.data || {};
    const emailObj = d.email as { value?: string } | undefined;
    const email = emailObj?.value || null;
    return {
      id: d.id,
      firstName: d.firstName || '',
      lastName: d.lastName || '',
      emails: email ? [{ value: email, primary: true }] : [],
    };
  });

  return { members };
};

/**
 * Sleep utility for delays
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getSharedDemoPassword = async (ctx: OperationContext & { slug?: string }) => {
  const { apiToken, apiDomain, slug } = ctx || {};
  return fetchSharedDemoPassword({ apiToken, apiDomain, slug });
};

/**
 * Call Gemini API with a prompt
 */
export const callGemini = async (
  args: { prompt?: string; temperature?: number; maxOutputTokens?: number },
  ctx: OperationContext
) => {
  const { prompt, temperature = 0.25, maxOutputTokens = 8192 } = args;
  const { apiToken, apiDomain } = ctx || {};
  const proxyUrl = getGeminiProxyUrl();

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apiToken,
      apiDomain,
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gemini API failed: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

  return { rawText };
};

/**
 * Fetch news channels from the environment
 */
export const fetchNewsChannels = async (_args: Record<string, unknown>, ctx: OperationContext) => {
  const { apiToken, branchId, apiDomain } = ctx;
  if (!apiToken || !branchId) return { channels: [] };

  try {
    const res = await fetch(
      buildApiUrl(`/api/spaces/${branchId}/installations?pluginID=news`, apiDomain),
      { headers: { Authorization: `Basic ${apiToken}` } }
    );

    if (!res.ok) return { channels: [] };

    const data = await res.json();
    const channels = (data?.data || []).map((c: { id: string; config?: { localization?: { en_US?: { title?: string } } } }) => ({
      id: c.id,
      title: c.config?.localization?.en_US?.title || 'Unknown',
    }));

    return { channels };
  } catch (e) {
    console.error('Error fetching news channels:', e);
    return { channels: [] };
  }
};

/**
 * Ensure two colors have sufficient contrast
 */
export const ensureContrast = (color1: string | undefined, color2: string | undefined): string | undefined => {
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const getLuminance = (r: number, g: number, b: number) => {
    const [rs, gs, bs] = [r, g, b].map(c => {
      const n = c / 255;
      return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  if (!color1 || !color2) return color2;

  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return color2;

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const ratio = lum1 > lum2
    ? (lum1 + 0.05) / (lum2 + 0.05)
    : (lum2 + 0.05) / (lum1 + 0.05);

  if (ratio < 3) {
    return lum1 > 0.5 ? '#000000' : '#FFFFFF';
  }

  return color2;
};
