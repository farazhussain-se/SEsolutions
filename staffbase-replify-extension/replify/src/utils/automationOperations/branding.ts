/**
 * Branding operations - atomic functions for brand customization
 */

import buildPreviewCss from '../buildPreviewCss';
import { fetchCurrentCSS, postUpdatedCSS } from '../staffbaseCss';
import { ensureContrast } from './environment';
import type { OperationContext } from './types';

const blockRegex = /\/\*\s*⇢\s*REPLIFY START\s*⇠\s*\*\/[\s\S]*?\/\*\s*⇢\s*REPLIFY END\s*⇠\s*\*\//i;
const buildLogoDevUrl = (prospectName = '') => {
  const cleaned = prospectName
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.-]/g, '');

  if (!cleaned) return '';

  const domain = cleaned.includes('.') ? cleaned : `${cleaned}.com`;
  return `https://img.logo.dev/${encodeURIComponent(domain)}?token=pk_f7bKMnRJR4a9cUWuNq1KUg&format=png&retina=true`;
};

interface BrandColors {
  primary?: string;
  text?: string;
  background?: string;
  floatingNavBg?: string;
  floatingNavText?: string;
}

interface LogoSize {
  changeLogoSize?: boolean;
  logoHeight?: number;
  logoMarginTop?: number;
  padW?: number;
  padH?: number;
}

/**
 * Apply brand colors to the environment
 */
export const applyBrandColors = async (args: BrandColors, ctx: OperationContext) => {
  const { primary, text, background, floatingNavBg, floatingNavText } = args;
  const { onProgress } = ctx;

  const finalText = ensureContrast(primary, text);
  const finalNavText = ensureContrast(floatingNavBg || background, floatingNavText || text);

  onProgress?.('Applying brand colors...');

  return {
    colors: {
      primary,
      text: finalText,
      background: background || '#F5F5F5',
      floatingNavBg: floatingNavBg || background || '#F5F5F5',
      floatingNavText: finalNavText,
    } as BrandColors,
  };
};

/**
 * Set company logo
 * ALWAYS uses logo.dev URL from prospectName - ignores any logoUrl from Gemini
 */
export const setLogo = async (
  args: { prospectName?: string; logoUrl?: string },
  ctx: OperationContext
) => {
  const { prospectName } = args;
  const { onProgress } = ctx;

  const finalLogoUrl = buildLogoDevUrl(prospectName);

  onProgress?.(`Setting logo for ${prospectName}...`);

  return { logoUrl: finalLogoUrl, prospectName };
};

/**
 * Set header/nav transparency (0-100)
 */
export const setHeaderTransparency = async (
  args: { value?: number },
  ctx: OperationContext
) => {
  const { value } = args;
  const { onProgress } = ctx;

  let transparency: number = value ?? 70;
  if (transparency > 0 && transparency <= 1) {
    transparency = Math.round(transparency * 100);
  }
  transparency = Math.max(0, Math.min(100, transparency));

  onProgress?.(`Setting header transparency to ${transparency}%...`);

  return { headerTransparency: transparency };
};

/**
 * Set background image
 */
export const setBackground = async (
  args: { bgUrl?: string; bgVertical?: number },
  ctx: OperationContext
) => {
  const { bgUrl, bgVertical = 50 } = args;
  const { onProgress } = ctx;

  onProgress?.('Setting background image...');

  return { bgUrl, bgVertical };
};

/**
 * Set logo size and positioning
 */
export const setLogoSize = async (
  args: { logoHeight?: number; logoMarginTop?: number; padW?: number; padH?: number },
  ctx: OperationContext
) => {
  const { logoHeight = 100, logoMarginTop = 0, padW = 0, padH = 0 } = args;
  const { onProgress } = ctx;

  onProgress?.('Adjusting logo size...');

  return {
    changeLogoSize: true,
    logoHeight,
    logoMarginTop,
    padW,
    padH,
  };
};

/**
 * Commit all branding changes to the environment
 */
export const commitBranding = async (
  args: {
    colors?: BrandColors;
    logoUrl?: string;
    headerTransparency?: number;
    bgUrl?: string;
    bgVertical?: number;
    logoSize?: LogoSize;
    prospectName?: string;
  },
  ctx: OperationContext
) => {
  const {
    colors = {},
    logoUrl,
    headerTransparency = 70,
    bgUrl = '',
    bgVertical = 50,
    logoSize = {},
    prospectName = '',
  } = args;

  const { apiToken, branchId, apiDomain, onProgress } = ctx;

  onProgress?.('Building branding CSS...');

  const existingCss = await fetchCurrentCSS(apiToken, apiDomain);
  const trimmedCss = existingCss ? existingCss.trim() : '';
  if (!trimmedCss) {
    const errorMessage = 'Branding aborted: fetched CSS is empty. Existing CSS was not replaced.';
    console.error('[commitBranding] Empty CSS fetch; aborting branding update.', { apiDomain, branchId });
    onProgress?.(`❌ ${errorMessage}`);
    throw new Error(errorMessage);
  }
  const finalLogoUrl = logoUrl || buildLogoDevUrl(prospectName);

  const cssConfig = {
    primary: colors.primary || '#1D4ED8',
    text: colors.text || '#0F172A',
    background: colors.background || '#F8FAFC',
    floatingNavBg: colors.floatingNavBg || colors.background || '#F5F5F5',
    floatingNavText: colors.floatingNavText || colors.text,
    bg: bgUrl,
    logo: finalLogoUrl || '',
    padW: logoSize.padW || 0,
    padH: logoSize.padH || 0,
    bgVert: bgVertical,
    headerTransparency,
    changeLogoSize: logoSize.changeLogoSize || false,
    logoHeight: logoSize.logoHeight || 100,
    logoMarginTop: logoSize.logoMarginTop || 0,
    prospectName,
  };

  const newCssBody = buildPreviewCss(cssConfig, [], '');
  const newBlock = `/* ⇢ REPLIFY START ⇠ */\n${newCssBody}\n/* ⇢ REPLIFY END ⇠ */`;
  const finalCss = blockRegex.test(trimmedCss)
    ? trimmedCss.replace(blockRegex, newBlock)
    : `${trimmedCss}\n\n${newBlock}`;

  const colorConfig = {
    primary: colors.primary || '#1D4ED8',
    text: colors.text || '#0F172A',
    background: colors.background || '#F8FAFC',
    floatingNavText: colors.floatingNavText || '#0F172A',
    floatingNavBg: colors.floatingNavBg || colors.background || '#F5F5F5',
  };

  onProgress?.('Applying branding to environment...');
  await postUpdatedCSS(apiToken, branchId ?? '', finalCss, colorConfig, apiDomain);

  onProgress?.(`Branding applied with ${headerTransparency}% header transparency`);

  return { success: true, appliedConfig: cssConfig };
};

/**
 * Full branding operation - combines all branding steps
 */
export const applyFullBranding = async (
  args: BrandColors & {
    logoUrl?: string;
    headerTransparency?: number;
    bgUrl?: string;
    bgVertical?: number;
    logoHeight?: number;
    logoMarginTop?: number;
    padW?: number;
    padH?: number;
    prospectName?: string;
  },
  ctx: OperationContext
) => {
  const {
    prospectName,
    primary,
    text,
    background,
    floatingNavBg,
    floatingNavText,
    logoUrl,
    headerTransparency,
    bgUrl,
    bgVertical,
    logoHeight,
    logoMarginTop,
    padW,
    padH,
  } = args;

  const colorsResult = await applyBrandColors({ primary, text, background, floatingNavBg, floatingNavText }, ctx);
  const logoResult = await setLogo({ prospectName, logoUrl }, ctx);
  const transparencyResult = await setHeaderTransparency({ value: headerTransparency }, ctx);

  let bgResult: { bgUrl?: string; bgVertical: number } = { bgUrl: '', bgVertical: 50 };
  if (bgUrl) {
    bgResult = await setBackground({ bgUrl, bgVertical }, ctx);
  }

  let sizeResult: LogoSize = {};
  if (logoHeight || logoMarginTop || padW || padH) {
    sizeResult = await setLogoSize({ logoHeight, logoMarginTop, padW, padH }, ctx);
  }

  const finalResult = await commitBranding({
    colors: colorsResult.colors,
    logoUrl: logoResult.logoUrl,
    headerTransparency: transparencyResult.headerTransparency,
    bgUrl: bgResult.bgUrl,
    bgVertical: bgResult.bgVertical,
    logoSize: sizeResult,
    prospectName: logoResult.prospectName,
  }, ctx);

  return finalResult;
};
