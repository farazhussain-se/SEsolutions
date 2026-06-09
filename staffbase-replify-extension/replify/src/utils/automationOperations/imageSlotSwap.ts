/**
 * Image-slot swap for email templates.
 *
 * Walks the pikasso content tree of an email template, identifies every
 * image slot (anything with a `src` field in a column-item), suggests
 * prospect-branded replacements (from logo.dev or user-pasted URLs),
 * and PUTs the modified tree back.
 *
 * Key choices:
 *   - We swap BOTH `src` and `mediumId` when uploading to the tenant's
 *     /api/media (so Studio's media picker continues to work). If
 *     upload fails we fall back to swapping just `src` with the
 *     external URL — image will render correctly in mail clients but
 *     Studio may refresh from a stale mediumId on later edits.
 *
 *   - Image SUGGESTIONS use logo.dev (already integrated in Replify
 *     with a public token) keyed on the prospect's domain. Domain
 *     comes from prospect intelligence (fetchProspectIntelligence's
 *     websiteUrl) or a Brandfetch search fallback. The same suggested
 *     URL is offered per slot; the user can override per-slot via a
 *     paste field — that hybrid (auto-suggest + per-slot override) is
 *     the approval UX.
 *
 *   - Social-icon hrefs are intentionally left alone. They're
 *     functional links (Twitter, LinkedIn, etc.), not branded images
 *     to swap.
 */

import { buildApiUrl } from '../helpers';
import type { OperationContext } from './types';

/* ── logo.dev URL builder (same token Replify uses elsewhere) ──────────────── */

const LOGO_DEV_TOKEN = 'pk_f7bKMnRJR4a9cUWuNq1KUg';

/**
 * Build a deterministic logo.dev URL for the given domain. No API call
 * needed — logo.dev serves the image directly off the URL.
 */
export const buildLogoDevUrl = (domain: string): string => {
  const cleaned = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `https://img.logo.dev/${encodeURIComponent(cleaned)}?token=${LOGO_DEV_TOKEN}&format=png&retina=true`;
};

/* ── Shapes ───────────────────────────────────────────────────────────────── */

/**
 * A single image-bearing node inside a template's pikasso tree. We
 * remember the JSON path so we can splice replacements back in.
 *
 * `slotIndex` is a 0-based ordering across the template — used as the
 * stable handle in the UI ("slot 0", "slot 1") so the user can map a
 * pasted URL to the right slot without us asking for the path.
 */
export interface ImageSlot {
  slotIndex: number;
  /** JSON path to the `content` object that holds {src, mediumId, alt, aspectRatio}. */
  path: Array<string | number>;
  currentSrc: string;
  currentMediumId?: string;
  alt?: string;
  aspectRatio?: number;
}

/**
 * A single swap proposed for a slot. `suggestedUrl` is what we'd swap
 * to by default; `overrideUrl` is the user's paste-override (if any);
 * `approved` controls whether the swap applies on PUT.
 */
export interface ImageSwap {
  slotIndex: number;
  /** Logo.dev URL we suggest by default. May be null if no domain is known. */
  suggestedUrl: string | null;
  /** User-pasted override. Wins over suggestedUrl when present. */
  overrideUrl: string;
  approved: boolean;
}

export interface TemplateImagePlan {
  templateId: string;
  templateName: string;
  galleryName: string;
  /** Full original content — needed for the round-trip on PUT. */
  originalContent: Record<string, unknown>;
  slots: ImageSlot[];
  swaps: ImageSwap[];
}

export interface ImageSwapReport {
  templateId: string;
  templateName: string;
  slotsApplied: number;
  slotsSkipped: number;
  uploadedToMedia: number;
  externalUrlsUsed: number;
  errors: string[];
}

/* ── Step 1: walk the pikasso tree for image slots ────────────────────────── */

/**
 * Recursively walk a pikasso tree and collect every node that has a
 * `src` field (which is the image URL slot). We capture path + current
 * values so the swap step can splice replacements back in deterministically.
 *
 * Skipped intentionally:
 *   - `icons[*].href` — social-icon click-throughs, not image sources
 *   - any object inside `icons[*]` arrays (social icons reference an
 *     external icon registry, not a swappable image)
 */
const findImageNodes = (
  node: unknown,
  path: Array<string | number>,
  out: ImageSlot[],
  withinIcons = false,
): void => {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      findImageNodes(node[i], [...path, i], out, withinIcons);
    }
    return;
  }
  if (typeof node !== 'object') return;

  const obj = node as Record<string, unknown>;
  // If we just descended into an `icons` array, mark the flag so child
  // images inside don't get treated as swappable slots.
  const nextWithinIcons = withinIcons || (path[path.length - 1] === 'icons');

  if (!nextWithinIcons && typeof obj.src === 'string') {
    out.push({
      slotIndex: out.length,
      path,
      currentSrc: obj.src,
      currentMediumId: typeof obj.mediumId === 'string' ? obj.mediumId : undefined,
      alt: typeof obj.alt === 'string' ? obj.alt : undefined,
      aspectRatio: typeof obj.aspectRatio === 'number' ? obj.aspectRatio : undefined,
    });
  }

  for (const [k, v] of Object.entries(obj)) {
    findImageNodes(v, [...path, k], out, nextWithinIcons);
  }
};

export const findImageSlotsInTree = (tree: Record<string, unknown>): ImageSlot[] => {
  const out: ImageSlot[] = [];
  findImageNodes(tree, [], out, false);
  return out;
};

/* ── Step 2: discover slots in a specific template (fetches content) ──────── */

interface TemplateContentResponse {
  content?: Record<string, unknown>;
  [k: string]: unknown;
}

export const discoverEmailTemplateImageSlots = async (
  args: { templateId: string },
  ctx: OperationContext,
): Promise<{ slots: ImageSlot[]; originalContent: Record<string, unknown> }> => {
  const { apiToken, apiDomain } = ctx;
  const url = buildApiUrl(`/api/email-service/templates/${args.templateId}/contents/pikasso`, apiDomain);
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${apiToken}` },
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`GET template content -> ${res.status}`);
  const wrapper = (await res.json()) as TemplateContentResponse;
  const originalContent: Record<string, unknown> =
    wrapper.content && typeof wrapper.content === 'object'
      ? (wrapper.content as Record<string, unknown>)
      : wrapper;
  const slots = findImageSlotsInTree(originalContent);
  return { slots, originalContent };
};

/* ── Step 3: suggest replacements (logo.dev keyed on prospect domain) ──────── */

interface BrandfetchSearchItem {
  name?: string;
  domain?: string;
  icon?: string;
}

/**
 * Resolve the prospect's primary web domain. Tries (in order):
 *   1. Caller-supplied websiteUrl (from prospect intelligence)
 *   2. Brandfetch /v2/search public endpoint — first hit's domain
 *
 * Returns null if neither succeeds; UI will then prompt the user to
 * paste URLs manually.
 */
export const resolveProspectDomain = async (
  args: { prospectName: string; websiteUrl?: string },
): Promise<string | null> => {
  if (args.websiteUrl) {
    const clean = args.websiteUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
    if (clean) return clean;
  }
  if (!args.prospectName || args.prospectName.trim().length < 2) return null;

  try {
    const url = new URL(`https://api.brandfetch.io/v2/search/${encodeURIComponent(args.prospectName.trim())}`);
    // Same public client key Replify already uses in App.tsx for prospect suggestions.
    url.searchParams.set('c', '1idl5t4I4YVu9p2ItXa');
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    const data = (await res.json()) as BrandfetchSearchItem[];
    const first = (data || []).find((r) => r.domain);
    return first?.domain ?? null;
  } catch {
    return null;
  }
};

/**
 * Build a default ImageSwap[] given the discovered slots. We seed every
 * slot's suggestion with the same logo.dev URL (if we know the domain),
 * and pre-approve them — the user unchecks any they don't want.
 */
export const buildDefaultSwaps = (
  slots: ImageSlot[],
  prospectDomain: string | null,
): ImageSwap[] => {
  const suggestedUrl = prospectDomain ? buildLogoDevUrl(prospectDomain) : null;
  return slots.map((s) => ({
    slotIndex: s.slotIndex,
    suggestedUrl,
    overrideUrl: '',
    approved: !!suggestedUrl,
  }));
};

/* ── Step 4: plan-builder for the UI (multi-template) ─────────────────────── */

/**
 * For each selected template: fetch + discover slots + seed swaps. The
 * UI renders per-template per-slot cards from this list and lets the
 * user approve / override / skip per slot before applying.
 */
export const buildImageSwapPlans = async (
  args: {
    templates: Array<{ id: string; name: string; galleryName: string }>;
    prospectName?: string;
    prospectWebsiteUrl?: string;
  },
  ctx: OperationContext,
): Promise<TemplateImagePlan[]> => {
  const { onProgress } = ctx;
  const prospectDomain = args.prospectName
    ? await resolveProspectDomain({ prospectName: args.prospectName, websiteUrl: args.prospectWebsiteUrl })
    : null;
  if (prospectDomain) {
    onProgress?.(`🌐 Suggesting logo.dev images keyed on "${prospectDomain}".`);
  } else if (args.prospectName) {
    onProgress?.(`⚠️ Couldn't resolve a domain for "${args.prospectName}" — suggestions empty, user must paste URLs.`);
  }

  const out: TemplateImagePlan[] = [];
  for (const tpl of args.templates) {
    try {
      onProgress?.(`📨 Scanning "${tpl.name}" for image slots…`);
      const { slots, originalContent } = await discoverEmailTemplateImageSlots(
        { templateId: tpl.id },
        ctx,
      );
      if (slots.length === 0) {
        onProgress?.(`⏭️  ${tpl.name}: no swappable image slots.`);
        continue;
      }
      out.push({
        templateId: tpl.id,
        templateName: tpl.name,
        galleryName: tpl.galleryName,
        originalContent,
        slots,
        swaps: buildDefaultSwaps(slots, prospectDomain),
      });
      onProgress?.(`✅ ${tpl.name}: ${slots.length} image slot(s) found.`);
    } catch (err) {
      onProgress?.(`❌ ${tpl.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
};

/* ── Step 5: optional upload-to-media (so Studio also sees the new asset) ── */

interface MediaUploadResult {
  newUrl: string;
  mediumId?: string;
}

/**
 * Mirror of CopierForm's image migration step: fetch image bytes from
 * the external URL, POST them to the tenant's /api/media to register a
 * tenant-hosted asset, return the canonical URL + medium ID.
 *
 * If anything in this chain fails (CORS-blocked external fetch, /api/media
 * rejection, etc.), we let the caller catch and fall back to using the
 * external URL directly.
 */
const uploadImageToTenantMedia = async (
  imageUrl: string,
  ctx: OperationContext,
): Promise<MediaUploadResult> => {
  const { apiToken, apiDomain } = ctx;

  // 1. Fetch bytes. External URLs (logo.dev) generally serve with
  //    permissive CORS so this should work, but it's the most fragile
  //    step in the chain.
  const imgRes = await fetch(imageUrl, { credentials: 'omit' });
  if (!imgRes.ok) throw new Error(`Fetch image bytes -> ${imgRes.status}`);
  const blob = await imgRes.blob();

  // 2. Build a sensible filename. Strip query string + URL path noise.
  const fileNameRaw = (imageUrl.split('/').pop() || 'image').split('?')[0] || 'image';
  const fileName = /\.[a-zA-Z0-9]+$/.test(fileNameRaw) ? fileNameRaw : `${fileNameRaw}.png`;

  // 3. POST to tenant /api/media. Mirrors CopierForm's existing usage.
  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('metadata', JSON.stringify({ type: 'auto', fileName }));

  const uploadRes = await fetch(buildApiUrl('/api/media', apiDomain), {
    method: 'POST',
    credentials: 'omit',
    headers: { Authorization: `Basic ${apiToken}` },
    body: form,
  });
  if (!uploadRes.ok) throw new Error(`POST /api/media -> ${uploadRes.status}`);

  const uploadData = (await uploadRes.json()) as { id?: string; resourceInfo?: { url?: string } };
  const newUrl = uploadData.resourceInfo?.url;
  if (!newUrl) throw new Error('Upload succeeded but no resourceInfo.url returned.');
  return { newUrl, mediumId: uploadData.id };
};

/* ── Step 6: apply approved swaps to a single template ────────────────────── */

/** Mutate `tree` so the leaf at `path` becomes `value`. Returns the same tree. */
const setAtPath = (tree: unknown, path: Array<string | number>, value: unknown): void => {
  if (path.length === 0) return;
  let cursor: unknown = tree;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (cursor === null || typeof cursor !== 'object') return;
    cursor = (cursor as Record<string | number, unknown>)[path[i] as string | number];
  }
  if (cursor === null || typeof cursor !== 'object') return;
  (cursor as Record<string | number, unknown>)[path[path.length - 1] as string | number] = value;
};

/** Apply image swaps to ONE template's tree, mutating in place + PUT back. */
export const applyImageSwapsToTemplate = async (
  args: { plan: TemplateImagePlan },
  ctx: OperationContext,
): Promise<ImageSwapReport> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const report: ImageSwapReport = {
    templateId: args.plan.templateId,
    templateName: args.plan.templateName,
    slotsApplied: 0,
    slotsSkipped: 0,
    uploadedToMedia: 0,
    externalUrlsUsed: 0,
    errors: [],
  };

  // Deep-clone the original content so the in-memory plan isn't trashed
  // if we have to roll back a partial application.
  const workingTree = JSON.parse(JSON.stringify(args.plan.originalContent)) as Record<string, unknown>;

  for (const swap of args.plan.swaps) {
    if (!swap.approved) {
      report.slotsSkipped += 1;
      continue;
    }
    const targetUrl = (swap.overrideUrl?.trim() || swap.suggestedUrl || '').trim();
    if (!targetUrl) {
      report.slotsSkipped += 1;
      continue;
    }
    const slot = args.plan.slots.find((s) => s.slotIndex === swap.slotIndex);
    if (!slot) {
      report.slotsSkipped += 1;
      continue;
    }

    // Try to upload to /api/media first — gives a tenant-hosted URL
    // and a real mediumId Studio can recognize. Fall back to the
    // external URL if upload fails.
    let newSrc = targetUrl;
    let newMediumId: string | undefined;
    try {
      const uploaded = await uploadImageToTenantMedia(targetUrl, ctx);
      newSrc = uploaded.newUrl;
      newMediumId = uploaded.mediumId;
      report.uploadedToMedia += 1;
      onProgress?.(`⬆️  slot ${slot.slotIndex}: uploaded to media, new url ${newSrc.slice(-32)}`);
    } catch (err) {
      // Non-fatal — use external URL directly. Email rendering will
      // still work; only Studio's media picker won't recognize the asset.
      report.externalUrlsUsed += 1;
      onProgress?.(
        `↪️  slot ${slot.slotIndex}: using external URL (upload failed: ${err instanceof Error ? err.message : String(err)})`,
      );
    }

    // Splice: walk to the slot's content object and set src + mediumId.
    const containerPath = slot.path; // points at the {src,...} object
    setAtPath(workingTree, [...containerPath, 'src'], newSrc);
    if (newMediumId) {
      setAtPath(workingTree, [...containerPath, 'mediumId'], newMediumId);
    }
    report.slotsApplied += 1;
  }

  if (report.slotsApplied === 0) {
    onProgress?.(`⏭️  ${args.plan.templateName}: nothing to apply.`);
    return report;
  }

  // PUT the modified tree back to the template.
  const url = buildApiUrl(
    `/api/email-service/templates/${args.plan.templateId}/contents/pikasso`,
    apiDomain,
  );
  const putRes = await fetch(url, {
    method: 'PUT',
    credentials: 'omit',
    headers: { Authorization: `Basic ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: workingTree }),
  });
  if (!putRes.ok && putRes.status !== 204) {
    const txt = await putRes.text().catch(() => '');
    const msg = `PUT template -> ${putRes.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`;
    report.errors.push(msg);
    onProgress?.(`❌ ${args.plan.templateName}: ${msg}`);
  } else {
    onProgress?.(`✏️  ${args.plan.templateName}: ${report.slotsApplied} slot(s) updated.`);
  }

  return report;
};

/**
 * Apply approved swaps across MANY templates (sequential to keep
 * /api/media polite + so progress reads sensibly in the side panel).
 */
export const applyImageSwapsToAllTemplates = async (
  args: { plans: TemplateImagePlan[] },
  ctx: OperationContext,
): Promise<ImageSwapReport[]> => {
  const out: ImageSwapReport[] = [];
  for (const plan of args.plans) {
    try {
      out.push(await applyImageSwapsToTemplate({ plan }, ctx));
    } catch (err) {
      out.push({
        templateId: plan.templateId,
        templateName: plan.templateName,
        slotsApplied: 0,
        slotsSkipped: plan.swaps.length,
        uploadedToMedia: 0,
        externalUrlsUsed: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }
  return out;
};
