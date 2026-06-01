/**
 * LinkedIn scraping operations
 *
 * Opens the LinkedIn URL in a new tab, surfaces a status banner inside the
 * Replify side panel (via `onScrapeStatusChange`) with the right-click /
 * shortcut instructions, polls chrome.storage for the scrape result produced
 * by background.js, then rewrites each post via Gemini in the requested
 * locales and creates Staffbase articles.
 */

import { findOrCreateNewsChannel, createArticle } from './articles';
import { callGemini } from './environment';
import { isLinkedInUrl } from '../helpers';
import { getBoundShortcut } from '../commandShortcut';
import type { OperationContext } from './types';

interface ScrapedLinkedInPost {
  postText: string;
  postImage: string;
  originalPostURL: string;
}

interface ScrapeResultRecord {
  result: {
    ok?: boolean;
    error?: string;
    posts?: ScrapedLinkedInPost[];
  };
  tabId: number;
  url?: string;
  timestamp: number;
}

type LocaleEntry = { title: string; teaser?: string; content: string };
type LocalesMap = Record<string, LocaleEntry>;

const ARTICLE_STRUCTURE_EXAMPLE =
  "Starting a blog was one of the most rewarding things I've done in my career. As someone who loves writing and connecting with readers, having an outlet to share my thoughts while potentially helping others has been an incredible experience. " +
  "When I first began blogging a few years ago, I really had no idea what I was doing. I would just sit down at my computer whenever inspiration struck and write whatever came to mind. " +
  "Looking back now, those early posts were pretty rough. It's almost cringe-worthy to read some of my early writing. But we all have to start somewhere, right? " +
  "If you're thinking about starting a blog but feel intimidated or don't know where to begin, I want this post to encourage you. " +
  "And to help you avoid some of the early pitfalls I encountered, I'll take you through a step-by-step guide to learn how to write a great post.";

const rewritePostAsArticle = async (
  source: ScrapedLinkedInPost,
  locales: string[],
  ctx: OperationContext
): Promise<LocalesMap | null> => {
  const localeList = locales.join(', ');
  const prompt =
    `You will turn a LinkedIn post into a polished long-form blog article in multiple locales.\n\n` +
    `STEP 1 — Detect the language of the source post (e.g. en_US, es_ES, de_DE, fr_FR, pt_BR, ja_JP).\n` +
    `STEP 2 — For EACH requested locale, produce a title, teaser, and a body of at least 5 HTML <p> paragraphs. The expansion rule applies to EVERY locale:\n` +
    `  • If the locale matches the detected source language, expand the original post into at least 5 paragraphs in that same language — do not translate, but DO expand.\n` +
    `  • Otherwise, expand AND translate into that locale's language idiomatically — the body must still be at least 5 paragraphs in the target language.\n` +
    `  • Body must always be HTML <p> elements. Never return short content for any locale.\n\n` +
    `Requested locales: ${localeList}\n\n` +
    `Source LinkedIn post:\n${source.postText}\n\n` +
    `Structural example (use this as a style reference, not content):\n${ARTICLE_STRUCTURE_EXAMPLE}\n\n` +
    `Return JSON only, no markdown fences:\n` +
    `{\n  "sourceLanguage": "xx_XX",\n  "locales": {\n` +
    locales
      .map((l) => `    "${l}": { "title": "...", "teaser": "...", "content": "<p>...</p>" }`)
      .join(',\n') +
    `\n  }\n}`;

  const { rawText } = await callGemini({ prompt, temperature: 0.4, maxOutputTokens: 8192 }, ctx);
  try {
    const parsed = JSON.parse(rawText) as { sourceLanguage?: string; locales?: LocalesMap };
    if (!parsed.locales) return null;
    for (const locale of locales) {
      const entry = parsed.locales[locale];
      if (!entry?.title || !entry?.content) return null;
    }
    return parsed.locales;
  } catch {
    return null;
  }
};

export const scrapeAndCreateArticlesFromLinkedIn = async (
  args: {
    linkedInUrl: string;
    articleCount?: number;
    channelName?: string;
    channelId?: string;
    prospectName?: string;
    locales?: string[];
  },
  ctx: OperationContext & { onLinkedInScrapeConfirmation?: (url: string) => Promise<void> }
) => {
  const {
    linkedInUrl,
    articleCount = 5,
    channelName = 'Top News',
    channelId: channelIdOverride,
    prospectName,
    locales = ['en_US'],
  } = args;
  const { onProgress, onLinkedInScrapeConfirmation, onScrapeStatusChange } = ctx;

  if (!isLinkedInUrl(linkedInUrl)) {
    throw new Error('Invalid LinkedIn URL. Provide a /company/<slug>/posts/ URL on linkedin.com.');
  }

  onProgress?.('🚀 Starting: Scrape LinkedIn posts');

  // Capture the tab we were on so we can return there after the scrape.
  let originatingTabId: number | null = null;
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    originatingTabId = active?.id ?? null;
  } catch {
    // Non-fatal — we just won't restore.
  }

  let tabId: number | null = null;

  const restoreOriginatingTab = async () => {
    if (originatingTabId == null) return;
    try {
      await chrome.tabs.update(originatingTabId, { active: true });
    } catch {
      // Original tab may have been closed — ignore.
    }
  };

  // background.js reads this flag to gate the scrape-linkedin shortcut + menu.
  const setActiveScrape = async (tabIdForFlag: number | null) => {
    try {
      if (tabIdForFlag == null) {
        await chrome.storage.local.remove('replify_active_scrape');
      } else {
        await chrome.storage.local.set({
          replify_active_scrape: { type: 'linkedin', tabId: tabIdForFlag },
        });
      }
    } catch {
      // Non-fatal.
    }
  };

  try {
    if (onLinkedInScrapeConfirmation) {
      await onLinkedInScrapeConfirmation(linkedInUrl);
      onProgress?.('User confirmed. Opening LinkedIn tab...');
    }

    const tab = await chrome.tabs.create({ url: linkedInUrl, active: true });
    tabId = tab.id ?? null;
    await setActiveScrape(tabId);

    onProgress?.('LinkedIn tab opened. Waiting for page to load...');

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('LinkedIn page load timeout (30 seconds)')),
        30000
      );
      const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // Drive the in-extension instruction banner. The side panel shows a
    // sticky card with "right-click → Replify: Scrape this LinkedIn page".
    const boundShortcut = await getBoundShortcut('scrape-linkedin');
    onScrapeStatusChange?.({
      type: 'linkedin',
      url: linkedInUrl,
      menuLabel: 'Replify: Scrape this LinkedIn page',
      boundShortcut,
    });
    onProgress?.('📋 Right-click on the LinkedIn page → "Replify: Scrape this LinkedIn page"');

    await chrome.storage.local.remove('replify_linkedin_scrape_result');

    const waitForScrapeResult = async () => {
      const maxWaitTime = 120000; // 2 minutes — Voyager can be slow
      const pollInterval = 500;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const stored = await chrome.storage.local.get('replify_linkedin_scrape_result');
        if (stored.replify_linkedin_scrape_result) {
          const scrapeRecord = stored.replify_linkedin_scrape_result as ScrapeResultRecord;
          if (scrapeRecord.tabId === tabId) {
            await chrome.storage.local.remove('replify_linkedin_scrape_result');
            return scrapeRecord.result;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
      throw new Error('Timeout: scrape was not triggered within 2 minutes.');
    };

    const result = await waitForScrapeResult();

    onScrapeStatusChange?.(null);
    await setActiveScrape(null);
    onProgress?.('✅ Scrape completed!');

    try {
      await chrome.tabs.remove(tabId!);
      onProgress?.('LinkedIn tab closed');
    } catch {
      // Tab may already be closed by background script — ignore.
    }
    tabId = null;
    await restoreOriginatingTab();

    if (!result?.ok) {
      throw new Error(result?.error || 'Failed to scrape LinkedIn posts');
    }

    const scrapedPosts = result.posts || [];
    if (scrapedPosts.length === 0) {
      throw new Error('No posts found on the LinkedIn page');
    }

    onProgress?.(`✅ Found ${scrapedPosts.length} LinkedIn post(s)`);

    const postsToCreate = scrapedPosts.slice(0, articleCount);
    onProgress?.(
      `\n🤖 Rewriting ${postsToCreate.length} post(s) as articles via Gemini in ${locales.join(', ')}...`
    );

    // Rewrite each post in parallel (small N, safe to fan out).
    const rewritten = await Promise.all(
      postsToCreate.map(async (post) => {
        try {
          const localesMap = await rewritePostAsArticle(post, locales, ctx);
          if (!localesMap) return null;
          return { locales: localesMap, image: post.postImage, originalPostURL: post.originalPostURL };
        } catch (err) {
          console.warn('[LinkedInScraping] Failed to rewrite post:', err);
          return null;
        }
      })
    );
    const valid = rewritten.filter(
      (a): a is { locales: LocalesMap; image: string; originalPostURL: string } => !!a
    );

    if (valid.length === 0) {
      throw new Error('Gemini failed to rewrite any of the scraped posts');
    }

    onProgress?.(`\n🚀 Creating ${valid.length} article(s) in channel "${channelName}"...`);

    let channelId = channelIdOverride;
    if (!channelId) {
      const channelResult = await findOrCreateNewsChannel({ channelName, prospectName }, ctx);
      channelId = channelResult.channelId;
      onProgress?.(
        channelResult.created
          ? `Created channel: "${channelName}"`
          : `Using existing channel: "${channelName}"`
      );
    }

    const articleIds: string[] = [];
    const failedTitles: string[] = [];
    for (const article of valid) {
      const primaryTitle = article.locales[locales[0]]?.title || 'LinkedIn post';
      onProgress?.(`Creating article: "${primaryTitle}"...`);
      const localesWithLink: LocalesMap = Object.fromEntries(
        Object.entries(article.locales).map(([locale, entry]) => [
          locale,
          {
            ...entry,
            content:
              `${entry.content}` +
              `<p><a href="${article.originalPostURL}" target="_blank">View original post on LinkedIn →</a></p>`,
          },
        ])
      );
      try {
        const { articleId } = await createArticle(
          {
            channelId: channelId!,
            imageUrl: article.image,
            locales: localesWithLink,
          },
          ctx
        );
        articleIds.push(articleId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onProgress?.(`⚠️ Skipping "${primaryTitle}": ${msg}`);
        failedTitles.push(primaryTitle);
      }
    }

    if (failedTitles.length > 0) {
      onProgress?.(`Created ${articleIds.length}, skipped ${failedTitles.length} (${failedTitles.join(', ')})`);
    } else {
      onProgress?.(`Created ${articleIds.length} article(s) from LinkedIn`);
    }

    return {
      success: true,
      articleIds,
      channelId,
      scrapedCount: scrapedPosts.length,
      createdCount: articleIds.length,
      channelName,
    };
  } catch (error) {
    onScrapeStatusChange?.(null);
    await setActiveScrape(null);
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // Tab may already be closed — ignore.
      }
    }
    await restoreOriginatingTab();
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`LinkedIn scraping failed: ${msg}`, { cause: error });
  }
};
