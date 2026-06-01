/**
 * Installation operations - configure environment features via Chino's endpoints
 */

import { fetchProfileFields } from './environment';
import type { OperationContext } from './types';

const INSTALLATIONS_URL = 'https://sb-news-generator.uc.r.appspot.com/api/v1/installations';
const EMAIL_TEMPLATES_URL = 'https://sb-news-generator.uc.r.appspot.com/api/v1/generate/email-templates';

/**
 * Configure environment features (chat, Microsoft, campaigns, quick links, etc.)
 * @param {Object} args - Configuration options
 * @param {Object} ctx - Execution context
 */
interface SetupInstallationsArgs {
  chat?: boolean;
  microsoft?: boolean;
  campaigns?: boolean;
  launchpad?: string[];
  journeys?: boolean;
  quickLinks?: { name?: string; title?: string }[];
  customWidgets?: boolean;
  workdayMerge?: boolean;
  mergeFieldTitle?: string | null;
}

export const setupInstallations = async (args: SetupInstallationsArgs, ctx: OperationContext) => {
  const {
    chat = false,
    microsoft = false,
    campaigns = false,
    launchpad = [],
    journeys = false,
    quickLinks = [],
    customWidgets = false,
    workdayMerge = false,
    mergeFieldTitle = null,
  } = args;

  const { apiToken, apiDomain, adminUserId, onProgress } = ctx;

  onProgress?.('Setting up environment features...');

  // Derive admin email from domain slug
  const slug = apiDomain.split('.')[0];
  const adminEmail = `admin@${slug}.staffbase.com`;
  const adminPassword = 'staffbase';

  const body: Record<string, unknown> = { domain: apiDomain };

  if (chat) {
    body.chat = true;
    onProgress?.('Enabling chat...');
  }
  if (microsoft) {
    body.microsoft = true;
    onProgress?.('Enabling Microsoft integration...');
  }
  if (campaigns) {
    body.campaigns = true;
    onProgress?.('Enabling campaigns...');
  }
  if (launchpad.length) {
    body.launchpad = launchpad;
    onProgress?.(`Configuring launchpad: ${launchpad.join(', ')}...`);
  }

  if (journeys && adminUserId) {
    body.journeys = { user: adminUserId, desired: ['all'] };
    onProgress?.('Enabling employee journeys...');
  }

  if (quickLinks.length) {
    const mobileQuickLinks: Record<string, { title: string; position: number }> = {};
    quickLinks.forEach((link, idx) => {
      const name = link.name || `link-${idx}`;
      mobileQuickLinks[name] = {
        title: link.title || link.name || `Quick Link ${idx + 1}`,
        position: idx,
      };
    });
    body.mobileQuickLinks = mobileQuickLinks;
    onProgress?.(`Adding ${quickLinks.length} quick link(s)...`);
  }

  if (customWidgets) {
    body.customWidgets = [adminEmail, adminPassword];
    onProgress?.('Enabling custom widgets...');
  }

  if (workdayMerge) {
    let fieldTitle = mergeFieldTitle;

    // If no field title specified, try to find "Public Email Address"
    if (!fieldTitle) {
      try {
        const { profileFields } = await fetchProfileFields({}, ctx);
        const pubEmail = profileFields.find(f => f.slug === 'publicEmailAddress');
        fieldTitle = pubEmail?.title || 'Public Email Address';
      } catch {
        fieldTitle = 'Public Email Address';
      }
    }

    body.workdayMerge = [adminEmail, adminPassword, fieldTitle];
    onProgress?.(`Enabling Workday merge with field: ${fieldTitle}...`);
  }

  const response = await fetch(INSTALLATIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Installations setup failed (${response.status}): ${errorText || response.statusText}`);
  }

  const enabledFeatures = [];
  if (chat) enabledFeatures.push('Chat');
  if (microsoft) enabledFeatures.push('Microsoft');
  if (campaigns) enabledFeatures.push('Campaigns');
  if (launchpad.length) enabledFeatures.push('Launchpad');
  if (journeys) enabledFeatures.push('Journeys');
  if (quickLinks.length) enabledFeatures.push(`${quickLinks.length} Quick Links`);
  if (customWidgets) enabledFeatures.push('Custom Widgets');
  if (workdayMerge) enabledFeatures.push('Workday Merge');

  onProgress?.(`✅ Configured: ${enabledFeatures.join(', ')}`);

  return { success: true, enabledFeatures };
};

/**
 * Generate email templates for the environment
 * @param {Object} args - (no args needed)
 * @param {Object} ctx - Execution context
 */
export const setupEmailTemplates = async (_args: Record<string, unknown>, ctx: OperationContext) => {
  const { apiToken, apiDomain, onProgress } = ctx;

  onProgress?.('Generating email templates...');

  const response = await fetch(EMAIL_TEMPLATES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ domain: apiDomain }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Email templates setup failed (${response.status}): ${errorText || response.statusText}`);
  }

  onProgress?.('✅ Email templates configured');

  return { success: true };
};
