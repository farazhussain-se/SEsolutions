/**
 * Blog scraping operations
 *
 * Opens the blog URL in a new tab, surfaces a status banner inside the
 * Replify side panel (via `onScrapeStatusChange`) with the right-click /
 * shortcut instructions, polls chrome.storage for the scrape result produced
 * by background.js, then rewrites each scraped article via Gemini in the
 * requested locales and creates Staffbase articles.
 */

import { findOrCreateNewsChannel, createArticle } from './articles';
import { callGemini } from './environment';
import { getBoundShortcut } from '../commandShortcut';
import type { OperationContext } from './types';

interface ScrapedBlogArticle {
  title: string;
  url: string;
  excerpt?: string;
  imageUrl?: string;
  contentHtml?: string;
}

type LocaleEntry = { title: string; teaser?: string; content: string };
type LocalesMap = Record<string, LocaleEntry>;

const ARTICLE_STRUCTURE_EXAMPLE =
  "Starting a blog was one of the most rewarding things I've done in my career. As someone who loves writing and connecting with readers, having an outlet to share my thoughts while potentially helping others has been an incredible experience. " +
  "When I first began blogging a few years ago, I really had no idea what I was doing. I would just sit down at my computer whenever inspiration struck and write whatever came to mind. " +
  "Looking back now, those early posts were pretty rough. It's almost cringe-worthy to read some of my early writing. But we all have to start somewhere, right? " +
  "If you're thinking about starting a blog but feel intimidated or don't know where to begin, I want this post to encourage you. " +
  "And to help you avoid some of the early pitfalls I encountered, I'll take you through a step-by-step guide to learn how to write a great post.";

/**
 * Threshold (in words, stripped of HTML/whitespace) above which we skip AI
 * expansion and only translate. 250 words ≈ a short blog post.
 */
const TRANSLATE_ONLY_WORD_THRESHOLD = 250;

const countWords = (htmlOrText: string): number => {
  const stripped = htmlOrText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!stripped) return 0;
  return stripped.split(' ').length;
};

const buildSourceMaterial = (source: ScrapedBlogArticle): string =>
  [
    `Original title: ${source.title}`,
    source.excerpt ? `Excerpt: ${source.excerpt}` : null,
    source.contentHtml ? `Body:\n${source.contentHtml}` : null,
    `Source URL: ${source.url}`,
  ]
    .filter(Boolean)
    .join('\n\n');

const localesJsonShape = (locales: string[]): string =>
  locales
    .map((l) => `    "${l}": { "title": "...", "teaser": "...", "content": "<p>...</p>" }`)
    .join(',\n');

const rewriteScrapedArticle = async (
  source: ScrapedBlogArticle,
  locales: string[],
  ctx: OperationContext
): Promise<LocalesMap | null> => {
  const localeList = locales.join(', ');
  const sourceMaterial = buildSourceMaterial(source);

  // Word count drives prompt choice: long enough → translate-only;
  // short or empty → expand into a full long-form article AND translate.
  const wordCount = countWords(`${source.contentHtml || ''} ${source.excerpt || ''}`);
  const longEnough = wordCount >= TRANSLATE_ONLY_WORD_THRESHOLD;

  const prompt = longEnough
    ? // Translate-only — preserve structure, paragraph count, and length.
      `You will translate a blog article into multiple locales while preserving its original structure and length.\n\n` +
      `STEP 1 — Detect the language of the source body (e.g. en_US, es_ES, de_DE, fr_FR, pt_BR, ja_JP).\n` +
      `STEP 2 — For EACH requested locale, produce a title + teaser + HTML <p> body:\n` +
      `  • If the locale matches the detected source language, return the original title and body unchanged (clean up obvious HTML noise only).\n` +
      `  • Otherwise, translate the title, teaser, and body paragraph-for-paragraph. Keep the same number of paragraphs and roughly the same length. Do NOT add new paragraphs or expand the content.\n` +
      `  • Body must remain HTML <p> elements.\n\n` +
      `Requested locales: ${localeList}\n\n` +
      `Source material:\n${sourceMaterial}\n\n` +
      `Return JSON only, no markdown fences:\n` +
      `{\n  "sourceLanguage": "xx_XX",\n  "locales": {\n${localesJsonShape(locales)}\n  }\n}`
    : // Expand + translate — the source is short or truncated.
      `You will turn a short or truncated blog article into a polished long-form post in multiple locales. ` +
      `Do NOT invent statistics or quotes — flesh out the narrative based on the title and excerpt.\n\n` +
      `STEP 1 — Detect the language of the source (e.g. en_US, es_ES, de_DE).\n` +
      `STEP 2 — For EACH requested locale, produce a title, teaser, and an EXPANDED body of at least 5 HTML <p> paragraphs. The expansion rule applies to EVERY locale:\n` +
      `  • If the locale matches the detected source language, expand the original into at least 5 paragraphs in that same language — do not translate, but DO expand.\n` +
      `  • Otherwise, expand AND translate into that locale's language — the body must still be at least 5 paragraphs in the target language.\n` +
      `  • Body must always be HTML <p> elements. Never return short content for any locale.\n\n` +
      `Requested locales: ${localeList}\n\n` +
      `Source material:\n${sourceMaterial}\n\n` +
      `Structural example (style reference, not content):\n${ARTICLE_STRUCTURE_EXAMPLE}\n\n` +
      `Return JSON only, no markdown fences:\n` +
      `{\n  "sourceLanguage": "xx_XX",\n  "locales": {\n${localesJsonShape(locales)}\n  }\n}`;

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

export const scrapeAndCreateArticlesFromBlog = async (
  args: {
    blogUrl: string;
    articleCount?: number;
    channelName?: string;
    channelId?: string;
    prospectName?: string;
    locales?: string[];
  },
  ctx: OperationContext & { onBlogScrapeConfirmation?: (url: string) => Promise<void> }
) => {
  const {
    blogUrl,
    articleCount = 3,
    channelName = 'Top News',
    channelId: channelIdOverride,
    prospectName,
    locales = ['en_US'],
  } = args;

  const { onProgress, onBlogScrapeConfirmation, onScrapeStatusChange } = ctx;

  if (!blogUrl || !(blogUrl.startsWith('http://') || blogUrl.startsWith('https://'))) {
    throw new Error('Invalid blog URL. Please provide a complete URL starting with http:// or https://');
  }

  onProgress?.('🚀 Starting: Scrape blog articles');

  // Capture the tab we were on so we can return there after the scrape.
  let originatingTabId: number | null = null;
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    originatingTabId = active?.id ?? null;
  } catch {
    // Non-fatal.
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

  // The blog context-menu item is hidden by default (since blog scraping
  // works on any domain — no documentUrlPatterns gate). Flip it visible only
  // while we're actively waiting for the user to right-click.
  const setBlogMenuVisible = async (visible: boolean) => {
    try {
      await chrome.contextMenus.update('replify-scrape-blog', { visible });
    } catch {
      // Non-fatal — menu may not be registered yet on first run.
    }
  };

  // background.js reads this flag to decide whether to honor a blog
  // shortcut/menu click. Cleared on every exit path.
  const setActiveScrape = async (tabIdForFlag: number | null) => {
    try {
      if (tabIdForFlag == null) {
        await chrome.storage.local.remove('replify_active_scrape');
      } else {
        await chrome.storage.local.set({
          replify_active_scrape: { type: 'blog', tabId: tabIdForFlag },
        });
      }
    } catch {
      // Non-fatal.
    }
  };

  try {
    if (onBlogScrapeConfirmation) {
      await onBlogScrapeConfirmation(blogUrl);
      onProgress?.('User confirmed. Opening blog tab...');
    }

    await setBlogMenuVisible(true);
    const tab = await chrome.tabs.create({ url: blogUrl, active: true });
    tabId = tab.id ?? null;
    await setActiveScrape(tabId);

    onProgress?.('Blog tab opened. Waiting for page to load...');

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Blog page load timeout (30 seconds)'));
      }, 30000);

      const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });

    const boundShortcut = await getBoundShortcut('scrape-blog');
    onScrapeStatusChange?.({
      type: 'blog',
      url: blogUrl,
      menuLabel: 'Replify: Scrape this blog',
      boundShortcut,
    });
    onProgress?.('📋 Right-click on the blog page → "Replify: Scrape this blog"');

    await chrome.storage.local.remove('replify_blog_scrape_result');

    const waitForScrapeResult = async () => {
      const maxWaitTime = 90000; // 90 seconds
      const pollInterval = 500;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const stored = await chrome.storage.local.get('replify_blog_scrape_result');
        if (stored.replify_blog_scrape_result) {
          const scrapeRecord = stored.replify_blog_scrape_result as {
            result: { ok?: boolean; error?: string; articles?: ScrapedBlogArticle[] };
            tabId: number;
          };
          const { result, tabId: scrapedTabId } = scrapeRecord;
          if (scrapedTabId === tabId) {
            await chrome.storage.local.remove('replify_blog_scrape_result');
            return result;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
      throw new Error('Timeout: You did not right-click and select "Replify: Scrape this blog" within 90 seconds.');
    };

    const result = await waitForScrapeResult();

    onScrapeStatusChange?.(null);
    await setBlogMenuVisible(false);
    await setActiveScrape(null);
    onProgress?.('✅ Scrape completed!');

    try {
      await chrome.tabs.remove(tabId!);
      onProgress?.('Blog tab closed');
    } catch {
      // Tab might already be closed — ignore.
    }
    tabId = null;
    await restoreOriginatingTab();

    if (!result?.ok) {
      throw new Error(result?.error || 'Failed to scrape blog articles');
    }

    const scrapedArticles = result.articles || [];
    if (scrapedArticles.length === 0) {
      throw new Error('No articles found on the blog page');
    }

    onProgress?.(`✅ Completed: Scrape blog articles (found ${scrapedArticles.length})`);

    const articlesToCreate = scrapedArticles.slice(0, articleCount);
    onProgress?.(
      `\n🤖 Rewriting ${articlesToCreate.length} article(s) via Gemini in ${locales.join(', ')}...`
    );

    const rewritten = await Promise.all(
      articlesToCreate.map(async (article) => {
        try {
          const words = countWords(`${article.contentHtml || ''} ${article.excerpt || ''}`);
          const mode = words >= TRANSLATE_ONLY_WORD_THRESHOLD ? 'translate' : 'expand';
          onProgress?.(`  • "${article.title}" (${words} words → ${mode})`);
          const localesMap = await rewriteScrapedArticle(article, locales, ctx);
          if (!localesMap) return null;
          return { locales: localesMap, image: article.imageUrl, sourceUrl: article.url };
        } catch (err) {
          console.warn('[BlogScraping] Failed to rewrite article:', err);
          return null;
        }
      })
    );
    type RewrittenArticle = { locales: LocalesMap; image: string | undefined; sourceUrl: string };
    const valid: RewrittenArticle[] = rewritten.filter((a): a is RewrittenArticle => a !== null);

    if (valid.length === 0) {
      throw new Error('Gemini failed to rewrite any of the scraped articles');
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
      const primaryTitle = article.locales[locales[0]]?.title || 'Blog article';
      onProgress?.(`Creating article: "${primaryTitle}"...`);
      const localesWithLink: LocalesMap = Object.fromEntries(
        Object.entries(article.locales).map(([locale, entry]) => [
          locale,
          {
            ...entry,
            content:
              `${entry.content}` +
              `<p><a href="${article.sourceUrl}" target="_blank">Read the full article →</a></p>`,
          },
        ])
      );
      try {
        const { articleId } = await createArticle(
          {
            channelId: channelId!,
            imageUrl: article.image ?? null,
            locales: localesWithLink,
          },
          ctx
        );
        articleIds.push(articleId);
      } catch (err) {
        // One bad article shouldn't abort the whole batch — log and continue.
        const msg = err instanceof Error ? err.message : String(err);
        onProgress?.(`⚠️ Skipping "${primaryTitle}": ${msg}`);
        failedTitles.push(primaryTitle);
      }
    }

    if (failedTitles.length > 0) {
      onProgress?.(`Created ${articleIds.length}, skipped ${failedTitles.length} (${failedTitles.join(', ')})`);
    } else {
      onProgress?.(`Created ${articleIds.length} article(s) from blog`);
    }

    return {
      success: true,
      articleIds,
      channelId,
      scrapedCount: scrapedArticles.length,
      createdCount: articleIds.length,
      channelName,
    };
  } catch (error) {
    onScrapeStatusChange?.(null);
    await setBlogMenuVisible(false);
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
    throw new Error(`Blog scraping failed: ${msg}`, { cause: error });
  }
};
