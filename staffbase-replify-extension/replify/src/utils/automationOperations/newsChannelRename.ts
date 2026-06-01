/**
 * News channel rename + post date redistribution.
 *
 * Bolt-in port of the staffbase-news-tool Flask wizard. Reuses Replify's
 * auth (apiToken + apiDomain via OperationContext) and Gemini proxy.
 *
 * Two independent stages — each runnable on its own from the UI:
 *
 *   A. renameChannelsForIndustry
 *      Lists channels (paginated via /api/branch/channels), calls Gemini to
 *      map each existing channel to the best industry channel template, then
 *      updates each channel via the installation `links.update` endpoint (the
 *      News API exposes channels as installations).
 *
 *   B. redistributePostDates
 *      Lists posts in chosen channels, computes a weighted demo-date spread
 *      (60 % within the last 14 days, the rest exponentially older up to
 *      span days), and PUTs each post with `{published: newISO, contents:
 *      ...original}`. The original `contents` MUST be round-tripped or the
 *      post body gets wiped.
 *
 * News-tool quirks worth knowing:
 *   - GET /api/branch/channels uses cursor pagination — `links.next` is the
 *     canonical "more" signal, `cursor` only exists when there's another page
 *   - Channel update uses `links.update.{method, href}` from the channel GET
 *     response. Use that method; don't hardcode POST/PUT
 *   - Post update is PUT /api/posts/{id} and `contents` MUST be included
 */

import { buildApiUrl, stripJsonFences } from '../helpers';
import callGeminiProxy from '../geminiProxy';
import { NEWS_INDUSTRIES } from './industryTemplates';
import type { OperationContext } from './types';

/* ── Shapes ───────────────────────────────────────────────────────────────── */

export interface ChannelSummary {
  id: string;
  title: string;
  description: string;
  /** From channel GET response: `links.update` — used to commit the rename. */
  updateMethod?: string;
  updateHref?: string;
}

export interface ChannelRenamePlan {
  channelId: string;
  oldTitle: string;
  newTitle: string;
  newDescription: string;
}

export interface RenameReport {
  channelsRenamed: number;
  channelsFailed: number;
  errors: string[];
  applied: ChannelRenamePlan[];
}

export interface PostSummary {
  id: string;
  channelId: string;
  title?: string;
  publishedAt?: string;
}

export interface RedistributeReport {
  postsTouched: number;
  postsFailed: number;
  errors: string[];
}

/* ── A1: list channels (cursor pagination) ─────────────────────────────────── */

interface RawChannelListItem {
  id?: string;
  config?: { localization?: { en_US?: { title?: string; description?: string } } };
  localization?: { en_US?: { title?: string; description?: string } };
  title?: string;
  name?: string;
  description?: string;
}

interface RawChannelListResponse {
  data?: RawChannelListItem[];
  cursor?: string | null;
  links?: { next?: string | null };
}

/**
 * Pull every news channel in the tenant. Mirrors GET /branch/channels paging.
 * Stops when there's no `links.next` (or no cursor) — see file header.
 */
export const listAllChannels = async (
  ctx: OperationContext,
): Promise<ChannelSummary[]> => {
  const out: ChannelSummary[] = [];
  let cursor: string | null = null;
  let pageGuard = 0;

  while (pageGuard < 25) {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const url = buildApiUrl(`/api/branch/channels?${params.toString()}`, ctx.apiDomain);
    const res = await fetch(url, { headers: { Authorization: `Basic ${ctx.apiToken}` } });
    if (!res.ok) throw new Error(`GET /branch/channels -> ${res.status}`);
    const json = (await res.json()) as RawChannelListResponse;
    const items = Array.isArray(json.data) ? json.data : [];

    for (const c of items) {
      if (!c.id) continue;
      const loc = c.config?.localization?.en_US ?? c.localization?.en_US;
      out.push({
        id: c.id,
        title: loc?.title || c.title || c.name || c.id,
        description: loc?.description || c.description || '',
      });
    }

    if (!json.links?.next || !json.cursor || items.length === 0) break;
    cursor = json.cursor;
    pageGuard += 1;
  }

  return out;
};

/* ── A2: fetch single channel (for links.update) ──────────────────────────── */

interface RawChannelDetail {
  id?: string;
  /**
   * The full `config` object — Staffbase will 403 if we POST back a truncated
   * copy, so we round-trip the whole thing. Treated as opaque except for the
   * localization keys we mutate.
   */
  config?: Record<string, unknown> & {
    localization?: { en_US?: { title?: string; description?: string } };
  };
  localization?: { en_US?: { title?: string; description?: string } };
  links?: { update?: { method?: string; href?: string } };
  title?: string;
  description?: string;
}

/** Like ChannelSummary but with the full config object so we can round-trip. */
interface ChannelDetail extends ChannelSummary {
  fullConfig: Record<string, unknown>;
}

const getChannelDetail = async (
  channelId: string,
  ctx: OperationContext,
): Promise<ChannelDetail> => {
  const url = buildApiUrl(`/api/channels/${channelId}`, ctx.apiDomain);
  const res = await fetch(url, { headers: { Authorization: `Basic ${ctx.apiToken}` } });
  if (!res.ok) throw new Error(`GET /channels/${channelId} -> ${res.status}`);
  const c = (await res.json()) as RawChannelDetail;
  const loc = c.config?.localization?.en_US ?? c.localization?.en_US;
  return {
    id: channelId,
    title: loc?.title || c.title || channelId,
    description: loc?.description || c.description || '',
    updateMethod: c.links?.update?.method,
    updateHref: c.links?.update?.href,
    fullConfig: (c.config as Record<string, unknown>) ?? {},
  };
};

/* ── A3: Gemini mapping ───────────────────────────────────────────────────── */

/**
 * Build the Gemini prompt for channel rename planning.
 *
 * Two modes:
 *   - industryKey === 'auto': Gemini infers from prospectName + prospectNews
 *     and produces fully bespoke channel names (no template constraints).
 *   - otherwise: prompt is anchored to the matching NEWS_INDUSTRIES template
 *     so the rename stays on-brand for that vertical. Prospect context, if
 *     provided, sharpens the choices (e.g. "Patient Safety & Quality" might
 *     become "Patient Safety @ Stryker").
 */
const buildRenamePrompt = (
  industryKey: string,
  channels: ChannelSummary[],
  prospect?: { name?: string; news?: string },
): string => {
  const prospectBlock = prospect?.name
    ? [
        `Prospect context — use this to flavor the new channel names:`,
        `  Prospect: ${prospect.name}`,
        prospect.news ? `  Recent news / industry context:\n${prospect.news.slice(0, 1200)}` : '',
        '',
      ].join('\n')
    : '';

  if (industryKey === 'auto') {
    return [
      `You are renaming a Staffbase customer's existing news channels to fit a demo for the prospect below. Pick channel names that read like the prospect's own internal newsroom — they should sound native to that company's industry and brand voice.`,
      ``,
      prospectBlock,
      `Existing channels:`,
      JSON.stringify(channels.map((c) => ({ channelId: c.id, currentTitle: c.title, currentDescription: c.description })), null, 2),
      ``,
      `Rules:`,
      `- Propose ONE new title + description per channel listed above.`,
      `- Titles are 2-5 words, no "channel" / "feed" suffix.`,
      `- Descriptions are 1 sentence describing the channel's purpose for this prospect.`,
      `- Skip the channel (omit it) only if no rename would be appropriate.`,
      ``,
      `Respond with ONLY a JSON array, no prose:`,
      `[{"channelId":"...","newTitle":"...","newDescription":"..."}]`,
    ].join('\n');
  }

  const industry = NEWS_INDUSTRIES[industryKey] ?? NEWS_INDUSTRIES.generic;
  return [
    `You are renaming a Staffbase customer's existing news channels to fit the "${industry.label}" industry demo${prospect?.name ? ` for the prospect "${prospect.name}"` : ''}.`,
    ``,
    prospectBlock,
    `Available industry-appropriate channel templates (pick one per existing channel; do not invent new ones):`,
    industry.channels.map(([t, d], i) => `  ${i + 1}. ${t} — ${d}`).join('\n'),
    ``,
    `Existing channels:`,
    JSON.stringify(channels.map((c) => ({ channelId: c.id, currentTitle: c.title, currentDescription: c.description })), null, 2),
    ``,
    `Rules:`,
    `- Each existing channel maps to ONE template name from the list above.`,
    `- Prefer semantic similarity (e.g. an existing "Updates from Plant Floor" → "Production Updates").`,
    `- Each template may be used at most ONCE. If a channel has no good match, omit it (do not duplicate templates).`,
    `- Copy the template's description verbatim into newDescription unless prospect context suggests a small tweak.`,
    ``,
    `Respond with ONLY a JSON array, no prose:`,
    `[{"channelId":"...","newTitle":"...","newDescription":"..."}]`,
  ].join('\n');
};

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Single Gemini call returning the rename plan. The user can edit the plan in
 * the UI before applying.
 *
 * Optional `prospect.{name,news}` is the Replify intelligence already pulled
 * from `fetchProspectIntelligence` — passing it makes the rename feel native
 * to the company being demoed rather than just generically industry-bucketed.
 */
export const planChannelRenames = async (
  args: { industryKey: string; channels: ChannelSummary[]; prospect?: { name?: string; news?: string } },
  ctx: OperationContext,
): Promise<ChannelRenamePlan[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  if (args.channels.length === 0) return [];

  const label = args.industryKey === 'auto' ? 'auto-infer from prospect' : `"${args.industryKey}" templates`;
  onProgress?.(`🤖 Gemini matching ${args.channels.length} channel(s) → ${label}…`);
  const prompt = buildRenamePrompt(args.industryKey, args.channels, args.prospect);
  const response = await callGeminiProxy<GeminiResponse>(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    },
    'gemini-2.5-flash',
    { apiToken, apiDomain },
  );
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = JSON.parse(stripJsonFences(text)) as ChannelRenamePlan[] | { plan?: ChannelRenamePlan[] };
  const plan = Array.isArray(parsed) ? parsed : Array.isArray(parsed.plan) ? parsed.plan : [];

  // Backfill oldTitle from the channels list so the UI can show a diff.
  const titleById = new Map(args.channels.map((c) => [c.id, c.title]));
  return plan
    .filter((p) => titleById.has(p.channelId))
    .map((p) => ({ ...p, oldTitle: titleById.get(p.channelId) ?? '' }));
};

/* ── A4: apply renames ────────────────────────────────────────────────────── */

/**
 * Resolve the channel update URL.
 *
 * `links.update.href` may come back as:
 *   - absolute              "https://tenant.../api/installations/{id}"
 *   - api-rooted             "/api/installations/{id}"
 *   - api-relative (Flask)  "/installations/{id}"   ← from sb_get(base+/api, …)
 *
 * The last case is the one that bit us: buildApiUrl drops the request through
 * without the `/api` prefix, the call lands on a public endpoint that doesn't
 * accept updates, and Staffbase 403s. Always prepend `/api` if missing.
 */
const resolveUpdateUrl = (
  channelId: string,
  detail: ChannelDetail,
  domain: string,
): string => {
  const href = detail.updateHref;
  if (!href) return buildApiUrl(`/api/installations/${channelId}`, domain);
  if (href.startsWith('http')) return href;
  const path = href.startsWith('/api/') ? href : `/api${href.startsWith('/') ? '' : '/'}${href}`;
  return buildApiUrl(path, domain);
};

const applyChannelRename = async (
  plan: ChannelRenamePlan,
  ctx: OperationContext,
): Promise<void> => {
  // News API exposes channel updates via the installation's `links.update`.
  // We GET the channel first so we can both discover the URL *and* round-trip
  // the entire `config` object — Staffbase rejects (403) updates that drop
  // sibling fields like accessorIDs or contentType.
  const detail = await getChannelDetail(plan.channelId, ctx);
  const method = (detail.updateMethod || 'POST').toUpperCase();
  const targetUrl = resolveUpdateUrl(plan.channelId, detail, ctx.apiDomain);

  // Mutate ONLY the localization keys; preserve everything else verbatim.
  const cfg: Record<string, unknown> = { ...(detail.fullConfig ?? {}) };
  const localization = (cfg.localization as Record<string, Record<string, unknown>> | undefined) ?? {};
  const enUs = (localization.en_US as Record<string, unknown> | undefined) ?? {};
  cfg.localization = {
    ...localization,
    en_US: {
      ...enUs,
      title: plan.newTitle,
      description: plan.newDescription || (enUs.description as string | undefined) || '',
    },
  };

  ctx.onProgress?.(`→ ${method} ${targetUrl}`);
  const res = await fetch(targetUrl, {
    method,
    headers: {
      Authorization: `Basic ${ctx.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ config: cfg }),
  });
  if (!res.ok) {
    const responseText = await res.text().catch(() => '');
    throw new Error(`${method} ${targetUrl} -> ${res.status}${responseText ? ` :: ${responseText.slice(0, 140)}` : ''}`);
  }
};

/**
 * Apply a (possibly user-edited) rename plan. Returns aggregate report.
 */
export const renameChannels = async (
  args: { plan: ChannelRenamePlan[] },
  ctx: OperationContext,
): Promise<RenameReport> => {
  const { onProgress } = ctx;
  const report: RenameReport = {
    channelsRenamed: 0,
    channelsFailed: 0,
    errors: [],
    applied: [],
  };

  for (const p of args.plan) {
    try {
      await applyChannelRename(p, ctx);
      report.channelsRenamed += 1;
      report.applied.push(p);
      onProgress?.(`✏️  "${p.oldTitle}" → "${p.newTitle}"`);
    } catch (err) {
      report.channelsFailed += 1;
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return report;
};

/* ── B1: list posts in a channel ──────────────────────────────────────────── */

interface RawPostListItem {
  id?: string;
  published?: string;
  publishedAt?: string;
  contents?: Record<string, unknown>;
}

interface RawPostListResponse {
  data?: RawPostListItem[];
  total?: number;
}

export const listChannelPosts = async (
  channelId: string,
  ctx: OperationContext,
  limit = 100,
): Promise<PostSummary[]> => {
  const out: PostSummary[] = [];
  let offset = 0;
  let total = Infinity;
  let guard = 0;

  while (offset < total && guard < 25) {
    const url = buildApiUrl(`/api/channels/${channelId}/posts?limit=${limit}&offset=${offset}`, ctx.apiDomain);
    const res = await fetch(url, { headers: { Authorization: `Basic ${ctx.apiToken}` } });
    if (!res.ok) throw new Error(`GET /channels/${channelId}/posts -> ${res.status}`);
    const json = (await res.json()) as RawPostListResponse;
    const items = Array.isArray(json.data) ? json.data : [];
    if (typeof json.total === 'number') total = json.total;

    for (const p of items) {
      if (!p.id) continue;
      out.push({
        id: p.id,
        channelId,
        publishedAt: p.published || p.publishedAt,
      });
    }
    offset += items.length;
    if (items.length === 0) break;
    guard += 1;
  }

  return out;
};

/* ── B2: weighted date spread (ported from spread_dates() in app.py) ─────── */

/**
 * Deterministic post-date generator. Seed is fixed to 42 so preview ≡ apply,
 * matching the Flask tool's behavior.
 *
 * Weighting:
 *   - 60 % of posts land within the last `recentWindowDays` (default 14)
 *   - the remaining 40 % spread exponentially older up to `spanDays` (90)
 *
 * Hours/minutes are nudged off the :00 / :30 grid so timestamps don't look
 * scripted. Weekends bump forward to Friday.
 */
export const buildSpreadDates = (
  count: number,
  demoDateIso: string,
  opts: { spanDays?: number; recentWindowDays?: number; recentWeight?: number } = {},
): string[] => {
  const spanDays = opts.spanDays ?? 90;
  const recentWindow = opts.recentWindowDays ?? 14;
  const recentWeight = opts.recentWeight ?? 0.6;
  const demo = new Date(demoDateIso);

  // Mulberry32 — tiny seedable PRNG so we don't pull in a lib.
  let seed = 42;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  const nRecent = Math.max(1, Math.round(count * recentWeight));
  const nOlder = count - nRecent;

  const dates: Date[] = [];
  for (let i = 0; i < nRecent; i += 1) {
    const daysBack = randInt(0, recentWindow);
    dates.push(new Date(demo.getTime() - daysBack * 86400000));
  }
  for (let i = 0; i < nOlder; i += 1) {
    const u = rand() ** 1.6; // bias toward recent
    const daysBack = recentWindow + Math.floor(u * (spanDays - recentWindow));
    dates.push(new Date(demo.getTime() - daysBack * 86400000));
  }

  const minuteChoices = [0, 7, 12, 22, 31, 45, 53];
  const out: Date[] = dates.map((d) => {
    const dt = new Date(d);
    // Snap weekends → Friday
    while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) {
      dt.setUTCDate(dt.getUTCDate() - 1);
    }
    dt.setUTCHours(randInt(8, 16));
    dt.setUTCMinutes(minuteChoices[randInt(0, minuteChoices.length - 1)]);
    dt.setUTCSeconds(randInt(0, 59));
    dt.setUTCMilliseconds(0);
    return dt;
  });

  out.sort((a, b) => b.getTime() - a.getTime());
  return out.map((d) => d.toISOString());
};

/* ── B3: apply published-date updates (PUT /posts/{id}) ───────────────────── */

const updatePostPublishedDate = async (
  postId: string,
  newIso: string,
  ctx: OperationContext,
): Promise<void> => {
  // Round-trip contents — PUT without contents wipes the body. The Flask tool
  // GETs first, then PUTs both fields together.
  const getUrl = buildApiUrl(`/api/posts/${postId}`, ctx.apiDomain);
  const getRes = await fetch(getUrl, { headers: { Authorization: `Basic ${ctx.apiToken}` } });
  if (!getRes.ok) throw new Error(`GET /posts/${postId} -> ${getRes.status}`);
  const post = (await getRes.json()) as { contents?: Record<string, unknown> };

  const putRes = await fetch(getUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${ctx.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ published: newIso, contents: post.contents ?? {} }),
  });
  if (!putRes.ok) throw new Error(`PUT /posts/${postId} -> ${putRes.status}`);
};

/**
 * Pull every post from the supplied channels and reassign `published`
 * timestamps using {@link buildSpreadDates}. Newest goes to index 0 so the
 * channel reads naturally.
 */
export const redistributePostDates = async (
  args: { channelIds: string[]; demoDateIso: string; spanDays?: number },
  ctx: OperationContext,
): Promise<RedistributeReport> => {
  const { onProgress } = ctx;
  const report: RedistributeReport = { postsTouched: 0, postsFailed: 0, errors: [] };

  const allPosts: PostSummary[] = [];
  for (const channelId of args.channelIds) {
    try {
      const posts = await listChannelPosts(channelId, ctx);
      allPosts.push(...posts);
      onProgress?.(`📋 ${posts.length} post(s) in channel ${channelId}`);
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (allPosts.length === 0) return report;

  const newDates = buildSpreadDates(allPosts.length, args.demoDateIso, { spanDays: args.spanDays });
  for (let i = 0; i < allPosts.length; i += 1) {
    const post = allPosts[i];
    const iso = newDates[i] ?? newDates[newDates.length - 1];
    try {
      await updatePostPublishedDate(post.id, iso, ctx);
      report.postsTouched += 1;
      onProgress?.(`🗓 ${post.id} → ${iso}`);
    } catch (err) {
      report.postsFailed += 1;
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return report;
};
