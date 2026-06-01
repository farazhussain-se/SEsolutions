/**
 * Article operations - atomic functions for article/news automation
 */

import { buildApiUrl, callGemini } from './environment';
import { normaliseLinkedInUrl, isLinkedInUrl } from '../helpers';
import { runInPageContext } from './tabInjection';
import type { OperationContext } from './types';

const UNSPLASH_PROXY_URL = 'https://replify-app-hbetc8gmevafbqe0.eastus-01.azurewebsites.net/api/unsplash-proxy';
const LINKEDIN_MARKER_TITLE = 'SB NEWS GEN: Start Up (please Delete this Article)';

type LocaleEntry = {
  title?: string;
  teaser?: string;
  content?: string;
  image?: string;
};

type LocalesMap = Record<string, LocaleEntry>;

type ArticlePost = {
  topic?: string;
  locales?: Record<string, LocaleEntry>;
};

type ArticleRecord = {
  id?: string;
  contents?: { en_US?: { title?: string; content?: string } };
  published?: string | boolean;
  channelId?: string;
  channelTitle?: string;
};

type PageResult = {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
  reason?: string;
};

type ChannelRecord = {
  id: string;
  config?: { localization?: { en_US?: { title?: string } } };
};

/**
 * Find a news channel by name
 * @param {Object} args - { channelName }
 * @param {Object} ctx - context
 */
export const findNewsChannel = async (
  args: { channelName?: string },
  ctx: OperationContext
) => {
  const { channelName = 'Top News' } = args;
  const { apiToken, branchId, apiDomain, onProgress } = ctx;

  onProgress?.(`Looking for "${channelName}" channel...`);

  try {
    const r = await fetch(
      buildApiUrl(`/api/spaces/${branchId}/installations?pluginID=news`, apiDomain),
      {
        headers: {
          Authorization: `Basic ${apiToken.trim()}`,
        }
      }
    );

    if (r.ok) {
      const data = await r.json();
      const hit = data?.data?.find((i: ChannelRecord) =>
        i.config?.localization?.en_US?.title
          ?.toLowerCase()
          .includes(channelName.toLowerCase())
      );

      if (hit) {
        onProgress?.(`Found channel: ${hit.id}`);
        return { channelId: hit.id, found: true, channelTitle: hit.config?.localization?.en_US?.title };
      }
    }
  } catch (e) {
    console.error('Error finding news channel:', e);
  }

  return { channelId: null, found: false };
};

/**
 * Create a news channel
 * @param {Object} args - { channelName, prospectName }
 * @param {Object} ctx - context
 */
export const createNewsChannel = async (
  args: { channelName?: string; prospectName?: string },
  ctx: OperationContext
) => {
  const { channelName = 'Top News', prospectName = '' } = args;
  const { apiToken, apiDomain, branchId, onProgress } = ctx;

  const title = prospectName ? `${channelName} // ${prospectName}` : channelName;
  onProgress?.(`Creating news channel: "${title}"...`);

  const payload = {
    pluginID: 'news',
    contentType: 'articles',
    accessorIDs: [branchId],
    config: {
      localization: {
        en_US: { title },
      },
    },
  };

  // Attempt 0: Basic auth + credentials:omit
  if (apiToken) {
    try {
      const crt0 = await fetch(
        buildApiUrl(`/api/spaces/${branchId}/installations`, apiDomain),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${apiToken.trim()}`,
          },
          credentials: 'omit',
          body: JSON.stringify(payload),
        }
      );
      if (crt0.ok) {
        const data0 = await crt0.json();
        onProgress?.(`Created channel: ${data0.id}`);
        // Publish via Basic auth
        const pubRes0 = await fetch(
          buildApiUrl(`/api/installations/${data0.id}/publish`, apiDomain),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              Authorization: `Basic ${apiToken.trim()}`,
            },
            credentials: 'omit',
            body: '',
          }
        );
        if (pubRes0.ok) {
          onProgress?.(`Published channel: ${data0.id}`);
        } else {
          console.warn('[Articles][createNewsChannel] Basic auth publish failed', pubRes0.status);
        }
        return { channelId: data0.id };
      }
      const errText0 = await crt0.text().catch(() => '');
      console.warn('[Articles][createNewsChannel] Basic auth failed', crt0.status, errText0);
    } catch (err) {
      console.warn('[Articles][createNewsChannel] Basic auth error', err);
    }
  }

  // Fallback: session cookies + CSRF
  const getCsrf = async () => {
    try {
      const res = await fetch(buildApiUrl('/auth/discover', apiDomain), {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/vnd.staffbase.auth.discovery.v2+json',
          'Content-Type': 'application/json',
        }
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data?.csrfToken || '';
    } catch {
      return '';
    }
  };

  const csrfToken = await getCsrf();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
  };

  const crt = await fetch(
    buildApiUrl(`/api/spaces/${branchId}/installations`, apiDomain),
    {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload),
    }
  );

  if (!crt.ok) {
    const errorText = await crt.text();
    throw new Error(`Failed to create news channel (${crt.status}): ${errorText}`);
  }

  const data = await crt.json();
  onProgress?.(`Created channel: ${data.id}`);

  // Publish the newly created channel so it is not left as a draft
  const publishHeaders: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
  };
  const publishRes = await fetch(
    buildApiUrl(`/api/installations/${data.id}/publish`, apiDomain),
    { method: 'POST', headers: publishHeaders, credentials: 'include', body: '' }
  );
  if (!publishRes.ok) {
    const publishText = await publishRes.text();
    console.warn('[Articles][createNewsChannel] Publish failed', publishRes.status, publishText);
  } else {
    onProgress?.(`Published channel: ${data.id}`);
  }

  return { channelId: data.id };
};

/**
 * Find or create a news channel
 * @param {Object} args - { channelName, prospectName }
 * @param {Object} ctx - context
 */
export const findOrCreateNewsChannel = async (
  args: { channelName?: string; prospectName?: string },
  ctx: OperationContext
) => {
  const { channelName = 'Top News', prospectName } = args;

  // Try to find existing
  const { channelId, found } = await findNewsChannel({ channelName }, ctx);

  if (found && channelId) {
    return { channelId, created: false };
  }

  // Create new
  const result = await createNewsChannel({ channelName, prospectName }, ctx);
  return { channelId: result.channelId, created: true };
};

/**
 * Fetch an image from Unsplash based on a search query (via proxy)
 * @param {Object} args - { query }
 * @param {Object} ctx - context
 */
export const fetchUnsplashImage = async (
  args: { query: string },
  ctx: OperationContext
) => {
  const { query } = args;
  const { apiToken, apiDomain, onProgress } = ctx;

  onProgress?.(`Fetching image for "${query}"...`);

  try {
    const response = await fetch(UNSPLASH_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiToken,
        apiDomain,
        query,
        orientation: 'landscape',
        perPage: 10,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { error?: string }).error || `Unsplash proxy returned ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    if (results.length === 0) {
      onProgress?.(`No images found for "${query}"`);
      return { imageUrl: null };
    }

    // Pick a random image from results
    const randomImage = results[Math.floor(Math.random() * results.length)];
    // Use regular size with crop parameters for consistent sizing
    const imageUrl = `${randomImage.urls.raw}&w=1280&h=720&fit=crop`;

    onProgress?.(`Found image for "${query}"`);
    return { imageUrl };
  } catch (error) {
    console.error('Error fetching Unsplash image:', error);
    onProgress?.(`Failed to fetch image: ${error instanceof Error ? error.message : String(error)}`);
    return { imageUrl: null };
  }
};

/**
 * Generate article content using Gemini AI
 * @param {Object} args - { topics, count, companyName }
 * @param {Object} ctx - context
 */
export const generateArticleContent = async (
  args: { topics?: string[]; count?: number; companyName?: string; locales?: string[] },
  ctx: OperationContext
) => {
  const { topics = ['company news'], count = 3, companyName = 'Company', locales = ['en_US'] } = args;
  const { onProgress } = ctx;

  onProgress?.(`Generating ${count} article(s) about "${topics.join(', ')}" in ${locales.join(', ')}...`);

  const topicsStr = topics.join(', ');
  const localeList = locales.join(', ');
  const buildPrompt = (requestedCount: number, existingTitles: string[] = []) => {
    const dedupeInstruction = existingTitles.length > 0
      ? `Do not repeat these already-generated article titles: ${existingTitles.join(' | ')}`
      : 'All article titles must be unique.';

    return `You are an internal communications specialist for ${companyName}. Generate ${requestedCount} internal company news articles.

Topics to cover: ${topicsStr}
Locales to generate content for: ${localeList}

For each article, provide a "topic" label and a "locales" object with an entry for EACH of these locales: ${localeList}.
Each locale entry must have: title, teaser (1-2 sentences, no HTML), content (HTML with <p>, <h3>, <ul>, <li> tags, 150-300 words).
Translate naturally — do not just translate word-for-word, write authentically in each language.

Return a valid JSON object with this structure:
{
  "posts": [
    {
      "topic": "Topic Label",
      "locales": {
        "en_US": { "title": "...", "teaser": "...", "content": "<p>...</p>" },
        "es_ES": { "title": "...", "teaser": "...", "content": "<p>...</p>" }
      }
    }
  ]
}

Rules:
1. JSON only — no markdown code fences
2. Professional but engaging, internal company voice ("we", "our team")
3. Include all requested locales for every post
4. ${dedupeInstruction}`;
  };

  const extractPostsFromRawText = (rawText: string, expectedCount: number): ArticlePost[] => {
    let parsed;
    try {
      parsed = JSON.parse(rawText);
      if (!parsed.posts || !Array.isArray(parsed.posts)) {
        throw new Error('Invalid response format from Gemini');
      }
      return parsed.posts as ArticlePost[];
    } catch {
      // Gemini can truncate JSON; recover complete post objects from the posts array.
      const postsMatch = rawText.match(/"posts"\s*:\s*\[/);
      if (postsMatch && postsMatch.index !== undefined) {
        const startIdx = postsMatch.index + postsMatch[0].length;
        const arrayContent = rawText.slice(startIdx);
        const completePosts: ArticlePost[] = [];
        let depth = 0;
        let inString = false;
        let escape = false;
        let postStart = -1;

        for (let i = 0; i < arrayContent.length; i++) {
          const ch = arrayContent[i];
          if (escape) {
            escape = false;
            continue;
          }
          if (ch === '\\' && inString) {
            escape = true;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
            continue;
          }
          if (inString) continue;
          if (ch === '{') {
            if (depth === 0) postStart = i;
            depth++;
          } else if (ch === '}') {
            depth--;
            if (depth === 0 && postStart !== -1) {
              try {
                completePosts.push(JSON.parse(arrayContent.slice(postStart, i + 1)) as ArticlePost);
              } catch {
                // Failed to parse JSON post object
              }              postStart = -1;
            }
          }
        }

        if (completePosts.length > 0) {
          onProgress?.(`⚠️ Response was truncated — recovered ${completePosts.length} of ${expectedCount} article(s)`);
          return completePosts;
        }
      }
      throw new Error('Could not parse Gemini response as JSON');
    }
  };

  const getPrimaryTitle = (post: ArticlePost): string => {
    const primary = post?.locales?.[locales[0]];
    if (primary?.title) return primary.title;
    const en = post?.locales?.en_US;
    if (en?.title) return en.title;
    const anyLocale = Object.values(post?.locales || {}).find((loc) => loc?.title);
    return anyLocale?.title || '';
  };

  try {
    const collected: ArticlePost[] = [];
    const seenKeys = new Set<string>();
    const maxAttempts = Math.max(4, count + 2);
    let attempts = 0;

    while (collected.length < count && attempts < maxAttempts) {
      const remaining = count - collected.length;
      const requestedCount = attempts === 0 ? remaining : 1;
      const existingTitles = collected.map((post) => getPrimaryTitle(post)).filter(Boolean);
      const prompt = buildPrompt(requestedCount, existingTitles);
      const { rawText } = await callGemini({ prompt, temperature: 0.7, maxOutputTokens: 16384 }, ctx);
      const posts = extractPostsFromRawText(rawText, requestedCount);

      if (!Array.isArray(posts) || posts.length === 0) break;

      let added = 0;
      for (const post of posts) {
        const dedupeKey = `${(post?.topic || '').toLowerCase()}::${getPrimaryTitle(post).toLowerCase()}`;
        if (!dedupeKey || seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);
        collected.push(post);
        added += 1;
        if (collected.length >= count) break;
      }

      if (collected.length >= count) break;

      if (added === 0) {
        onProgress?.('⚠️ Follow-up generation returned duplicate/empty articles, retrying...');
      } else {
        onProgress?.(`↪️ Generated ${collected.length}/${count} article(s); requesting remaining...`);
      }
      attempts += 1;
    }

    if (collected.length === 0) {
      throw new Error('Gemini returned no usable articles');
    }

    if (collected.length < count) {
      onProgress?.(`⚠️ Only generated ${collected.length} of ${count} article(s) after retries`);
    } else {
      onProgress?.(`Generated ${collected.length} article(s)`);
    }

    return { articles: collected.slice(0, count) };
  } catch (error) {
    console.error('Error generating article content:', error);
    throw new Error(`Failed to generate articles: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
};

/**
 * Create a single article in a news channel
 * @param {Object} args - { channelId, title, teaser, content, imageUrl }
 * @param {Object} ctx - context
 */
export const createArticle = async (
  args: {
    channelId: string;
    title?: string;
    teaser?: string;
    content?: string;
    imageUrl?: string | null;
    locales?: LocalesMap;
  },
  ctx: OperationContext
) => {
  const { channelId, title, teaser, content, imageUrl, locales: localesMap } = args;
  const { apiToken, apiDomain, onProgress } = ctx;

  // Build contents: prefer explicit locales map, fall back to single en_US entry
  const buildContents = (withImage: boolean) => {
    if (localesMap) {
      return Object.fromEntries(
        Object.entries(localesMap).map(([locale, lc]) => [
          locale,
          { title: lc.title, teaser: lc.teaser, content: lc.content, ...(withImage && imageUrl ? { image: imageUrl } : {}) },
        ])
      );
    }
    return { en_US: { title, teaser, content, ...(withImage && imageUrl ? { image: imageUrl } : {}) } };
  };

  const displayTitle = localesMap ? (Object.values(localesMap)[0]?.title || channelId) : title;
  onProgress?.(`Creating article: "${displayTitle}"...`);

  const publishArticle = async (articleId: string, csrfToken: string | null) => {
    const publishHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    };
    const publishEndpoints = [
      buildApiUrl(`/api/posts/${articleId}/publish`, apiDomain),
      buildApiUrl(`/api/articles/${articleId}/publish`, apiDomain),
    ];
    for (const endpoint of publishEndpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: publishHeaders,
          credentials: 'include',
          body: '',
        });
        if (res.ok) {
          onProgress?.(`Published article: ${articleId}`);
          return true;
        }
        const text = await res.text().catch(() => '');
        console.warn('[Articles][createArticle] Article publish failed', endpoint, res.status, text);
      } catch (err) {
        console.warn('[Articles][createArticle] Article publish error', endpoint, err);
      }
    }
    return false;
  };

  const patchPublishArticle = async (articleId: string, csrfToken: string | null) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=UTF-8',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    };
    const body = {
      published: true,
      contents: { en_US: { primaryMediaAltText: null, video: null } },
      notificationChannels: [],
    };
    try {
      const res = await fetch(buildApiUrl(`/api/articles/${articleId}`, apiDomain), {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const text = await res.text().catch(() => '');
      if (res.ok) {
        onProgress?.(`Published article via PATCH: ${articleId}`);
        return true;
      }
      console.warn('[Articles][createArticle] Article PATCH publish failed', res.status, text);
    } catch (err) {
      console.warn('[Articles][createArticle] Article PATCH publish error', err);
    }
    return false;
  };

  const pagePublishArticle = async (articleId: string) => {
    try {
      const result = await runInPageContext({
        func: async (articleUrl) => {
          const url = articleUrl as string;
          try {
            const discover = await fetch('/auth/discover', {
              headers: { 'Accept': 'application/vnd.staffbase.auth.discovery.v2+json' },
              credentials: 'include',
            });
            const csrfToken = discover.ok
              ? (await discover.json())?.csrfToken
              : ((document.querySelector('meta[name="x-csrf-token"]') as HTMLMetaElement | null)?.content || '');
            if (!csrfToken) return { ok: false, reason: 'no csrf' };
            const headers = {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'x-csrf-token': csrfToken,
            };
            const endpoints = [
              { url: url.replace('/articles/', '/posts/') + '/publish', method: 'POST' },
              { url: url + '/publish', method: 'POST' },
              { url: url, method: 'PATCH', json: { published: true, contents: { en_US: { primaryMediaAltText: null, video: null } }, notificationChannels: [] } },
            ];
            for (const ep of endpoints) {
              const res = await fetch(ep.url, {
                method: ep.method,
                headers: ep.method === 'PATCH'
                  ? { ...headers, 'Content-Type': 'application/json; charset=UTF-8' }
                  : headers,
                credentials: 'include',
                body: ep.method === 'PATCH' ? JSON.stringify(ep.json) : '',
              });
              const text = await res.text().catch(() => '');
              if (res.ok) return { ok: true, status: res.status, body: text, endpoint: ep.url };
            }
            return { ok: false, reason: 'all failed' };
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        },
        args: [buildApiUrl(`/api/articles/${articleId}`, apiDomain)],
      }) as PageResult | null;
      if (result?.ok) {
        onProgress?.(`Published article via page context: ${articleId}`);
        return true;
      }
      console.warn('[Articles][createArticle] Page publish failed', result);
    } catch (err) {
      console.warn('[Articles][createArticle] Page publish error', err);
    }
    return false;
  };

  const checkPublished = async (articleId: string) => {
    try {
      const res = await fetch(buildApiUrl(`/api/articles/${articleId}`, apiDomain), {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.published ?? null;
    } catch {
      return null;
    }
  };

  const getCsrfToken = async () => {
    try {
      const res = await fetch(buildApiUrl('/auth/discover', apiDomain), {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/vnd.staffbase.auth.discovery.v2+json',
          'Content-Type': 'application/json',
        }
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data?.csrfToken || '';
    } catch {
      return '';
    }
  };

  // Attempt 0: Basic auth with credentials:omit (avoids cookie interference from other envs)
  if (apiToken) {
    const payload0 = { published: true, contents: buildContents(true) };
    try {
      const response0 = await fetch(
        buildApiUrl(`/api/channels/${channelId}/posts`, apiDomain),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Basic ${apiToken.trim()}`,
          },
          credentials: 'omit',
          body: JSON.stringify(payload0),
        }
      );
      if (response0.ok) {
        const data = await response0.json();
        onProgress?.(`Created article: ${data.id}`);
        if (data.published !== true) {
          // Publish via Basic auth too
          const pubRes = await fetch(buildApiUrl(`/api/posts/${data.id}/publish`, apiDomain), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              Authorization: `Basic ${apiToken.trim()}`,
            },
            credentials: 'omit',
            body: '',
          });
          if (!pubRes.ok) {
            await publishArticle(data.id, null) || await patchPublishArticle(data.id, null) || await pagePublishArticle(data.id);
          }
          const finalPublished = await checkPublished(data.id);
          onProgress?.(`Publish check (attempt0) for ${data.id}: ${finalPublished}`);
        }
        return { articleId: data.id, success: true };
      }
      const body0 = await response0.text().catch(() => '');
      console.warn('[Articles][createArticle] Attempt 0 (Basic auth) failed', response0.status, body0);
    } catch (err) {
      console.warn('[Articles][createArticle] Attempt 0 error', err);
    }
  }

  // Attempt 1: session cookies + CSRF (fallback if Basic auth not available or failed)
  const payload1 = {
    published: true,
    contents: buildContents(true),
  };
  const csrf1 = await getCsrfToken();
  const headers1: Record<string, string> = {
    'Content-Type': 'application/json; charset=UTF-8',
    ...(csrf1 ? { 'x-csrf-token': csrf1 } : {}),
  };

  const response1 = await fetch(
    buildApiUrl(`/api/channels/${channelId}/posts`, apiDomain),
    {
      method: 'POST',
      headers: headers1,
      credentials: 'include',
      body: JSON.stringify(payload1),
    }
  );

  if (response1.ok) {
    const data = await response1.json();
    onProgress?.(`Created article: ${data.id}`);
    if (data.published !== true) {
      await publishArticle(data.id, csrf1)
        || await patchPublishArticle(data.id, csrf1)
        || await pagePublishArticle(data.id);
      const finalPublished = await checkPublished(data.id);
      onProgress?.(`Publish check (attempt1) for ${data.id}: ${finalPublished}`);
    }
    return { articleId: data.id, success: true };
  }
  const body1 = await response1.text().catch(() => '');
  console.warn('[Articles][createArticle] Attempt 1 failed', response1.status, body1);

  // Attempt 2: alternate payload closer to admin UI (published, flags)
  const payload2 = {
    published: true,
    contents: buildContents(true),
    commentingEnabled: true,
    likingEnabled: true,
    acknowledgingEnabled: false,
    highlighted: false,
    notificationChannels: [],
  };
  const csrf2 = await getCsrfToken();
  const headers2: Record<string, string> = {
    'Content-Type': 'application/json; charset=UTF-8',
    ...(csrf2 ? { 'x-csrf-token': csrf2 } : {}),
  };

  const response2 = await fetch(
    buildApiUrl(`/api/channels/${channelId}/posts`, apiDomain),
    {
      method: 'POST',
      headers: headers2,
      credentials: 'include',
      body: JSON.stringify(payload2),
    }
  );

  if (response2.ok) {
    const data = await response2.json();
    onProgress?.(`Created article (retry): ${data.id}`);
    if (data.published !== true) {
      await publishArticle(data.id, csrf2)
        || await patchPublishArticle(data.id, csrf2)
        || await pagePublishArticle(data.id);
      const finalPublished = await checkPublished(data.id);
      onProgress?.(`Publish check (attempt2) for ${data.id}: ${finalPublished}`);
    }
    return { articleId: data.id, success: true };
  }
  const body2 = await response2.text().catch(() => '');
  console.warn('[Articles][createArticle] Attempt 2 failed', response2.status, body2);

  // If the failure looks image-related and we had an image, retry once with
  // no image — better to publish without it than to fail the whole article.
  const combinedErrorText = `${body1}\n${body2}`;
  const looksImageRelated =
    /InvalidUploadException|cannot open attached file|ERROR_UPLOAD_FAILED/i.test(combinedErrorText);
  const hadImage = !!imageUrl || Object.values(localesMap || {}).some((lc) => !!lc.image);
  if (looksImageRelated && hadImage) {
    onProgress?.(`⚠️ Image upload rejected by Staffbase — creating article without an image.`);
    const payloadNoImage = {
      published: true,
      contents: buildContents(false),
    };
    const csrf3 = await getCsrfToken();
    const headers3: Record<string, string> = {
      'Content-Type': 'application/json; charset=UTF-8',
      ...(csrf3 ? { 'x-csrf-token': csrf3 } : {}),
    };
    const response3 = await fetch(
      buildApiUrl(`/api/channels/${channelId}/posts`, apiDomain),
      {
        method: 'POST',
        headers: headers3,
        credentials: 'include',
        body: JSON.stringify(payloadNoImage),
      }
    );
    if (response3.ok) {
      const data = await response3.json();
      onProgress?.(`Created article without image: ${data.id}`);
      if (data.published !== true) {
        await publishArticle(data.id, csrf3)
          || await patchPublishArticle(data.id, csrf3)
          || await pagePublishArticle(data.id);
      }
      return { articleId: data.id, success: true, imageSkipped: true };
    }
    const body3 = await response3.text().catch(() => '');
    console.warn('[Articles][createArticle] No-image retry failed', response3.status, body3);
  }

  throw new Error(`Failed to create article after retries (${response1.status}/${response2.status}): ${body1 || body2}`);
};

/**
 * Full workflow: Generate AI articles and create them in a channel
 * @param {Object} args - { topics, count, channelName, prospectName }
 * @param {Object} ctx - context
 */
export const generateAndCreateArticles = async (
  args: {
    topics?: string[];
    count?: number;
    channelName?: string;
    channelId?: string;
    prospectName?: string;
    locales?: string[];
  },
  ctx: OperationContext
) => {
  const { topics = ['company news'], count = 3, channelName = 'Top News', channelId: channelIdOverride, prospectName, locales = ['en_US'] } = args;
  const { onProgress, apiToken, apiDomain, branchId: _branchId } = ctx;

  // Try to detect an admin USERID for post creation if not already provided
  let adminUserId = ctx.adminUserId;
  if (!adminUserId) {
    try {
      const usersRes = await fetch(buildApiUrl('/api/users?limit=200', apiDomain), {
        headers: { Authorization: `Basic ${apiToken}` },
      });
      if (usersRes.ok) {
        const users = (await usersRes.json())?.data || [];
        const adminUser = users.find((u: { branchRole?: string; role?: { type?: string }; id?: string }) => u.branchRole === 'WeBranchAdminRole') ||
          users.find((u: { branchRole?: string; role?: { type?: string }; id?: string }) => u.role?.type === 'admin');
        if (adminUser?.id) {
          adminUserId = adminUser.id;
          ctx.adminUserId = adminUserId;
          onProgress?.(`Using detected admin ID for articles: ${adminUserId}`);
        }
      }
    } catch (err) {
      onProgress?.(`⚠️ Could not auto-detect admin for articles: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Step 1: Find or create channel (skip if an explicit channelId was provided)
  let channelId = channelIdOverride;
  let channelCreatedFlag = false;
  if (!channelId) {
    const result = await findOrCreateNewsChannel({ channelName, prospectName }, ctx);
    channelId = result.channelId;
    channelCreatedFlag = result.created;
    onProgress?.(channelCreatedFlag ? 'Created new channel' : 'Using existing channel');
  }

  // Step 2: Generate article content
  const { articles } = await generateArticleContent({
    topics,
    count,
    companyName: prospectName || 'Company',
    locales,
  }, ctx);

  // Step 3: For each article, fetch image and create
  const articleIds: string[] = [];
  for (const article of articles) {
    const topic = article.topic || topics[0];

    // Fetch image based on topic
    const { imageUrl } = await fetchUnsplashImage({ query: topic }, ctx);

    // Create the article with all locales
    const { articleId } = await createArticle({
      channelId: channelId!,
      locales: article.locales,
      imageUrl,
    }, ctx);

    articleIds.push(articleId);
  }

  onProgress?.(`Created ${articleIds.length} articles in channel`);

  return {
    channelId,
    articleIds,
    articleCount: articleIds.length,
    channelCreated: channelCreatedFlag,
  };
};

/**
 * Fetch articles from a news channel
 * @param {Object} args - { channelId, limit }
 * @param {Object} ctx - context
 */
export const fetchChannelArticles = async (
  args: { channelId: string; limit?: number },
  ctx: OperationContext
) => {
  const { channelId, limit = 50 } = args;
  const { apiToken, apiDomain, onProgress } = ctx;

  onProgress?.(`Fetching articles from channel ${channelId}...`);

  const response = await fetch(
    buildApiUrl(`/api/channels/${channelId}/posts?limit=${limit}&sort=published_DESC`, apiDomain),
    {
      headers: {
        Authorization: `Basic ${apiToken.trim()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch channel articles (${response.status})`);
  }

  const data = await response.json();
  const articles = data.data || [];

  onProgress?.(`Found ${articles.length} articles in channel`);

  return { articles };
};

/**
 * Delete an article
 * @param {Object} args - { articleId }
 * @param {Object} ctx - context
 */
export const deleteArticle = async (
  args: { articleId: string },
  ctx: OperationContext
) => {
  const { articleId } = args;
  const { apiDomain, onProgress } = ctx;

  onProgress?.(`Deleting article ${articleId}...`);

  // Delete via page context to ensure cookies/CSRF are honored
  const result = await runInPageContext({
    func: async (articleUrl) => {
      const url = articleUrl as string;
      try {
        const discover = await fetch('/auth/discover', {
          headers: { 'Accept': 'application/vnd.staffbase.auth.discovery.v2+json' }
        });
        const csrfToken = discover.ok
          ? (await discover.json())?.csrfToken
          : ((document.querySelector('meta[name="x-csrf-token"]') as HTMLMetaElement | null)?.content || '');
        if (!csrfToken) throw new Error('No CSRF token found');
        const res = await fetch(url, {
          method: 'DELETE',
          headers: {
            'x-csrf-token': csrfToken,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          },
          credentials: 'include'
        });
        const text = await res.text().catch(() => '');
        return { ok: res.ok, status: res.status, body: text };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    args: [buildApiUrl(`/api/articles/${articleId}`, apiDomain)],
  }) as PageResult | null;

  if (!result?.ok && result?.status !== 404) {
    const errorText = result?.error || result?.body || `status ${result?.status}`;
    throw new Error(`Failed to delete article: ${errorText}`);
  }

  onProgress?.(`Deleted article ${articleId}`);
  return { success: true };
};

/**
 * Find and delete the LinkedIn scraper marker article, return articles added after it
 * @param {Object} args - { channelId }
 * @param {Object} ctx - context
 */
export const getArticlesAfterMarker = async (
  args: { channelId: string },
  ctx: OperationContext
) => {
  const { channelId } = args;
  const { onProgress } = ctx;

  // Fetch all articles from the channel
  const { articles } = await fetchChannelArticles({ channelId, limit: 100 }, ctx);

  // Find the marker article
  const markerIndex = (articles as ArticleRecord[]).findIndex(
    (a) => a.contents?.en_US?.title?.includes(LINKEDIN_MARKER_TITLE) ||
           a.contents?.en_US?.title?.includes('SB NEWS GEN')
  );

  if (markerIndex === -1) {
    onProgress?.('No marker article found - returning all recent articles');
    return { articleIds: (articles as ArticleRecord[]).map((a) => a.id), markerFound: false };
  }

  // Articles before the marker (in the sorted list, these are newer)
  const articlesTyped = articles as ArticleRecord[];
  const newArticles = articlesTyped.slice(0, markerIndex);
  const markerArticle = articlesTyped[markerIndex];

  onProgress?.(`Found ${newArticles.length} articles after marker`);

  // Delete the marker article
  await deleteArticle({ articleId: markerArticle.id! }, ctx);
  onProgress?.('Deleted marker article');

  return {
    articleIds: newArticles.map((a) => a.id),
    articles: newArticles,
    markerFound: true,
    markerDeleted: true,
  };
};

/**
 * Import articles from LinkedIn — synchronous, in-extension flow.
 * The user's logged-in LinkedIn session does the scrape (background.js calls
 * Voyager API in page context). Each post is rewritten via Gemini, then
 * createArticle publishes it to the chosen channel.
 */
export const importLinkedInArticles = async (
  args: { linkedInUrl: string; articleCount?: number; channelId: string; locales?: string[] },
  ctx: OperationContext & { onLinkedInScrapeConfirmation?: (url: string) => Promise<void> }
) => {
  const { linkedInUrl, articleCount = 5, channelId, locales } = args;

  if (!isLinkedInUrl(linkedInUrl)) {
    throw new Error('Valid LinkedIn URL is required for importing articles.');
  }
  if (!channelId) {
    throw new Error('Channel ID is required for importing articles.');
  }

  const fixedUrl = normaliseLinkedInUrl(linkedInUrl);
  const { scrapeAndCreateArticlesFromLinkedIn } = await import('./linkedinScraping');
  const result = await scrapeAndCreateArticlesFromLinkedIn(
    { linkedInUrl: fixedUrl, articleCount, channelId, locales },
    ctx
  );

  return {
    success: true,
    linkedInUrl: fixedUrl,
    channelId,
    articleIds: result.articleIds,
    scrapedCount: result.scrapedCount,
    createdCount: result.createdCount,
  };
};

/**
 * Full LinkedIn article import — finds/creates channel and runs the scraper.
 */
export const importLinkedInArticlesFull = async (
  args: {
    linkedInUrl: string;
    articleCount?: number;
    prospectName?: string;
    channelName?: string;
    locales?: string[];
  },
  ctx: OperationContext & { onLinkedInScrapeConfirmation?: (url: string) => Promise<void> }
) => {
  const { linkedInUrl, articleCount = 5, prospectName, channelName = 'Top News', locales } = args;
  const fixedUrl = normaliseLinkedInUrl(linkedInUrl);
  const { scrapeAndCreateArticlesFromLinkedIn } = await import('./linkedinScraping');
  return scrapeAndCreateArticlesFromLinkedIn(
    { linkedInUrl: fixedUrl, articleCount, channelName, prospectName, locales },
    ctx
  );
};

/**
 * Fetch recent articles from all news channels (for context)
 * @param {Object} args - { limit }
 * @param {Object} ctx - context
 */
export const fetchAllRecentArticles = async (
  args: { limit?: number },
  ctx: OperationContext
) => {
  const { limit = 20 } = args;
  const { apiToken, branchId, apiDomain, onProgress } = ctx;

  onProgress?.('Fetching recent articles from all channels...');

  // First, get all news channels
  const channelsResponse = await fetch(
    buildApiUrl(`/api/spaces/${branchId}/installations?pluginID=news`, apiDomain),
    { headers: { Authorization: `Basic ${apiToken.trim()}` } }
  );

  if (!channelsResponse.ok) {
    return { articles: [] };
  }

  const channelsData = await channelsResponse.json();
  const channels: ChannelRecord[] = channelsData.data || [];

  // Fetch articles from each channel (at least 3 per channel to avoid missing small channels)
  const perChannelLimit = Math.max(3, Math.ceil(limit / channels.length));
  const allArticles: ArticleRecord[] = [];
  for (const channel of channels) {
    try {
      const { articles } = await fetchChannelArticles({
        channelId: channel.id,
        limit: perChannelLimit,
      }, ctx);

      const channelTitle = channel.config?.localization?.en_US?.title || 'Unknown';
      (articles as ArticleRecord[]).forEach((article) => {
        allArticles.push({
          ...article,
          channelId: channel.id,
          channelTitle,
        });
      });
    } catch (e) {
      // 404 is expected for channels that don't support the posts endpoint
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('404')) {
        console.warn(`Error fetching articles from channel ${channel.id}:`, msg);
      }
    }
  }

  // Sort by published date and limit
  allArticles.sort((a, b) => new Date(b.published as string).getTime() - new Date(a.published as string).getTime());
  const limitedArticles = allArticles.slice(0, limit);

  onProgress?.(`Found ${limitedArticles.length} recent articles`);

  return { articles: limitedArticles };
};
