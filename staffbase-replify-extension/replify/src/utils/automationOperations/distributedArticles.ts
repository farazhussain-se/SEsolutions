/**
 * Distributed demo articles — Gemini-driven multi-channel AI article
 * generation with realistic date scheduling around a demo date.
 *
 * Composes three existing pieces:
 *   1. fetchProspectIntelligence  → prospect news (via aiUtils, reused
 *      from BrandingForm's sparkle button when prospectNews is supplied
 *      by the caller)
 *   2. generateAndCreateArticles  → per-channel AI article generation
 *      (one call per channel allocation)
 *   3. redistributePostDates      → spreads `published` timestamps
 *      across all chosen channels around the demo date (60/40 curve,
 *      seeded for determinism)
 *
 * The novel bit is the `planArticleDistribution` step: one Gemini call
 * that takes the channel list + total article count + prospect context
 * and returns per-channel allocations (count + topic ideas per channel).
 *
 * This means the SE doesn't have to think about "how many articles in
 * Patient Safety vs HR & Benefits" — Gemini picks counts that fit the
 * channel themes and prospect context.
 *
 * All Staffbase API calls reuse the existing patterns:
 *   - Authorization: Basic <apiToken> (from OperationContext)
 *   - credentials: 'omit' (consistent with the rest of the codebase)
 *   - Gemini calls go through callGeminiProxy (Supabase Edge Function)
 */

import { stripJsonFences } from '../helpers';
import callGeminiProxy from '../geminiProxy';
import { generateAndCreateArticles } from './articles';
import { redistributePostDates, buildSpreadDates, listChannelPosts } from './newsChannelRename';
import { buildApiUrl } from '../helpers';
import type { OperationContext } from './types';

/* ── Shapes ───────────────────────────────────────────────────────────────── */

export interface ChannelSpec {
  id: string;
  title: string;
  description?: string;
}

export interface DistributionEntry {
  channelId: string;
  channelTitle: string;
  count: number;
  topics: string[];
}

export interface DistributedArticlesReport {
  distribution: DistributionEntry[];
  articleIds: string[];
  channelsTouched: number;
  postsRedistributed: number;
  redistributeFailures: number;
  errors: string[];
}

/* ── Step 1: ask Gemini to plan the distribution ──────────────────────────── */

/**
 * Single Gemini call: given the channel list + total count + prospect
 * context, return per-channel article allocations.
 *
 * Constraints the prompt enforces:
 *   - Sum of all per-channel counts must equal totalCount
 *   - Each entry's topics list must be exactly its count
 *   - Channels with low thematic relevance get 0 articles (omit them)
 *   - Topics should be prospect-flavored (use the news context where
 *     possible) and channel-themed (a "Safety First" channel gets
 *     safety-themed topics, not generic ones)
 */
export const planArticleDistribution = async (
  args: {
    channels: ChannelSpec[];
    totalCount: number;
    prospect?: { name?: string; news?: string };
    topicHints?: string[];
  },
  ctx: OperationContext,
): Promise<DistributionEntry[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  if (args.channels.length === 0 || args.totalCount <= 0) return [];

  onProgress?.(
    `🤖 Gemini distributing ${args.totalCount} article(s) across ${args.channels.length} channel(s)…`,
  );

  const prospectBlock = args.prospect?.name
    ? [
        `Prospect: ${args.prospect.name}`,
        args.prospect.news ? `Recent context:\n${args.prospect.news.slice(0, 1600)}` : '',
        '',
      ].filter(Boolean).join('\n')
    : '';

  const hintsBlock = args.topicHints && args.topicHints.length > 0
    ? `Topic hints from the SE (use as flavor, but prefer channel-thematic + prospect-relevant ideas if these don't fit):\n  ${args.topicHints.join(', ')}\n\n`
    : '';

  const channelList = args.channels
    .map((c) => `  - id="${c.id}" · title="${c.title}"${c.description ? ` · ${c.description}` : ''}`)
    .join('\n');

  const prompt = [
    `You are populating a Staffbase demo with realistic news articles.`,
    `Distribute exactly ${args.totalCount} article(s) across the channels below.`,
    ``,
    prospectBlock,
    hintsBlock,
    `Available channels:`,
    channelList,
    ``,
    `Rules:`,
    `1. The SUM of all "count" values must equal exactly ${args.totalCount}.`,
    `2. Skip channels (omit them entirely) if they don't fit the prospect or have no thematic relevance — better to give 0 articles to an irrelevant channel than to dilute coverage.`,
    `3. Per channel, propose UNIQUE article topics (one short title per intended article). The "topics" array length MUST equal the "count" for that channel.`,
    `4. Topics should sound like real internal-newsroom headlines for this prospect — mention products / sites / programs from the prospect context when natural. Don't write generic headlines.`,
    `5. Avoid identical or near-duplicate topics across channels.`,
    ``,
    `Respond with ONLY a JSON object, no prose:`,
    `{"distribution":[{"channelId":"...","count":N,"topics":["...","..."]}, ...]}`,
  ].join('\n');

  interface PlanResponse {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }
  const response = await callGeminiProxy<PlanResponse>(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    },
    'gemini-2.5-flash',
    { apiToken, apiDomain },
  );
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = JSON.parse(stripJsonFences(text)) as {
    distribution?: Array<{ channelId?: string; count?: number; topics?: string[] }>;
  };
  const raw = Array.isArray(parsed.distribution) ? parsed.distribution : [];

  // Normalise + drop bad entries: must have a valid channelId from our input,
  // count >= 1, and topics.length === count.
  const titleById = new Map(args.channels.map((c) => [c.id, c.title]));
  const valid: DistributionEntry[] = raw
    .filter((e): e is { channelId: string; count: number; topics: string[] } =>
      typeof e.channelId === 'string'
      && titleById.has(e.channelId)
      && typeof e.count === 'number'
      && e.count >= 1
      && Array.isArray(e.topics)
      && e.topics.length === e.count,
    )
    .map((e) => ({
      channelId: e.channelId,
      channelTitle: titleById.get(e.channelId)!,
      count: e.count,
      topics: e.topics,
    }));

  // Sanity-log if the LLM didn't hit the total. Don't auto-correct — better
  // to surface the drift so the user knows.
  const sum = valid.reduce((acc, e) => acc + e.count, 0);
  if (sum !== args.totalCount) {
    onProgress?.(`⚠️ Gemini distribution sums to ${sum}, requested ${args.totalCount}. Proceeding with what came back.`);
  } else {
    onProgress?.(`✅ Distribution: ${valid.map((e) => `${e.count}×${e.channelTitle}`).join(' · ')}.`);
  }

  return valid;
};

/* ── Step 2: orchestrator ──────────────────────────────────────────────────── */

/**
 * Full end-to-end flow:
 *   1. Plan distribution (Gemini)
 *   2. For each allocation, generate + create articles in that channel
 *      (existing generateAndCreateArticles op — handles channel resolve,
 *      AI content gen, Unsplash image fetch, post creation)
 *   3. After all channels are populated, redistribute `published`
 *      timestamps across ALL selected channels (existing + new posts
 *      both get the realistic spread) around demoDateIso
 *
 * Returns aggregate report so the form can display counts + errors.
 */
export const generateDistributedDemoArticles = async (
  args: {
    channels: ChannelSpec[];
    totalCount: number;
    demoDateIso: string;
    prospect?: { name?: string; news?: string };
    topicHints?: string[];
    locales?: string[];
    spanDays?: number;
  },
  ctx: OperationContext,
): Promise<DistributedArticlesReport> => {
  const { onProgress } = ctx;
  const report: DistributedArticlesReport = {
    distribution: [],
    articleIds: [],
    channelsTouched: 0,
    postsRedistributed: 0,
    redistributeFailures: 0,
    errors: [],
  };

  if (args.channels.length === 0) {
    report.errors.push('No channels selected.');
    return report;
  }

  /* 1️⃣  Plan distribution */
  const distribution = await planArticleDistribution(
    {
      channels: args.channels,
      totalCount: args.totalCount,
      prospect: args.prospect,
      topicHints: args.topicHints,
    },
    ctx,
  );
  report.distribution = distribution;
  if (distribution.length === 0) {
    report.errors.push('Gemini returned no usable distribution.');
    return report;
  }

  /* 2️⃣  Generate + create per channel (sequential to keep Gemini calls
   *     polite + so the post order in each channel is deterministic) */
  for (const entry of distribution) {
    try {
      onProgress?.(`📝 Generating ${entry.count} article(s) for "${entry.channelTitle}"…`);
      const result = await generateAndCreateArticles(
        {
          topics: entry.topics,
          count: entry.count,
          channelId: entry.channelId,
          prospectName: args.prospect?.name,
          locales: args.locales,
        },
        ctx,
      );
      if (result?.articleIds?.length) {
        report.articleIds.push(...result.articleIds);
      }
      report.channelsTouched += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress?.(`❌ Failed to generate articles for "${entry.channelTitle}": ${msg}`);
      report.errors.push(`${entry.channelTitle}: ${msg}`);
    }
  }

  /* 3️⃣  Redistribute dates across the selected channels.
   *
   * `redistributePostDates` pulls every post in each channel via the
   * Pages API, applies the 60/40 weighted spread around demoDateIso, and
   * PUTs each post with the new `published` timestamp. Existing posts +
   * the new AI articles both get repositioned so the channel timeline
   * looks demo-fresh and internally consistent. The Mulberry32 seed is
   * fixed, so repeated runs with the same inputs are idempotent. */
  try {
    onProgress?.(`🗓 Redistributing post dates across ${args.channels.length} channel(s) around ${args.demoDateIso.slice(0, 10)}…`);
    const redistReport = await redistributePostDates(
      {
        channelIds: args.channels.map((c) => c.id),
        demoDateIso: args.demoDateIso,
        spanDays: args.spanDays ?? 90,
      },
      ctx,
    );
    report.postsRedistributed = redistReport.postsTouched;
    report.redistributeFailures = redistReport.postsFailed;
    if (redistReport.errors.length) {
      report.errors.push(...redistReport.errors.slice(0, 5));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.(`⚠️ Date redistribution skipped: ${msg}`);
    report.errors.push(`redistribute: ${msg}`);
  }

  return report;
};

/* ── Convenience: read-only dry-run for the UI preview ─────────────────────── */

/**
 * Plan-only — does the Gemini distribution call and shows what would
 * happen, but does NOT create any articles or touch any posts. Useful
 * for a Preview button before the user commits.
 *
 * Also reports how many posts already exist in each channel so the user
 * can see what the "redistribute existing too" step will affect.
 */
export const previewDistributedArticlesPlan = async (
  args: {
    channels: ChannelSpec[];
    totalCount: number;
    prospect?: { name?: string; news?: string };
    topicHints?: string[];
  },
  ctx: OperationContext,
): Promise<{
  distribution: DistributionEntry[];
  existingPostCounts: Record<string, number>;
}> => {
  const distribution = await planArticleDistribution(args, ctx);
  const existingPostCounts: Record<string, number> = {};

  // Light-touch sample: get post count per channel (limit=1, total field tells us actual count)
  for (const c of args.channels) {
    try {
      const url = buildApiUrl(`/api/channels/${c.id}/posts?limit=1`, ctx.apiDomain);
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${ctx.apiToken}` },
        credentials: 'omit',
      });
      if (res.ok) {
        const json = (await res.json()) as { total?: number };
        existingPostCounts[c.id] = json.total ?? 0;
      } else {
        existingPostCounts[c.id] = -1;
      }
    } catch {
      existingPostCounts[c.id] = -1;
    }
  }

  return { distribution, existingPostCounts };
};

// Expose buildSpreadDates re-export so callers don't have to also import from
// newsChannelRename — this module IS the consolidated "demo article scheduling"
// surface for downstream code.
export { buildSpreadDates, listChannelPosts };
