// background.js

console.log("[Background] Background script loaded. Storage-based communication enabled.");

// Create context menu on startup (in case extension was already installed)
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] onStartup fired - recreating context menu');
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'replify-scrape-blog',
        title: 'Replify: Scrape this blog',
        contexts: ['page'],
        // Hidden by default; the side panel flips it to visible only while a
        // blog scrape is actively waiting for the user to right-click.
        visible: false,
      });
      chrome.contextMenus.create({
        id: 'replify-scrape-linkedin',
        title: 'Replify: Scrape this LinkedIn page',
        contexts: ['page'],
        documentUrlPatterns: ['*://*.linkedin.com/*', '*://*.linkedin.cn/*'],
      });
      console.log('[Background] Context menu recreated on startup');
    });
  } catch (error) {
    console.error('[Background] Failed to recreate context menu on startup:', error);
  }
});

// Listener to capture survey JWTs from redirects
// NOTE: URL filter must cover all Staffbase domains (not just app.staffbase.com)
chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    console.log(`[Background][Survey JWT] onBeforeRedirect fired. URL: ${details.url} → ${details.redirectUrl}`);

    const match = details.url.match(/installations\/([a-f0-9]+)\/service/);
    if (!match) {
      console.warn(`[Background][Survey JWT] Could not extract survey ID from URL: ${details.url}`);
      return;
    }

    const surveyId = match[1];

    if (details.redirectUrl.includes("pluginsurveys-us1.staffbase.com/register?jwt=")) {
      const url = new URL(details.redirectUrl);
      const jwt = url.searchParams.get("jwt");

      if (jwt && surveyId) {
        chrome.storage.local.set({ [surveyId]: jwt });
        console.log(`[Background][Survey JWT] Stored JWT for survey ID: ${surveyId}`);
      } else {
        console.warn(`[Background][Survey JWT] Redirect matched but JWT or surveyId was missing. surveyId=${surveyId}, jwt=${!!jwt}`);
      }
    } else {
      console.log(`[Background][Survey JWT] Redirect did not point to pluginsurveys. Redirect URL: ${details.redirectUrl}`);
    }
  },
  {
    urls: [
      "*://*.staffbase.com/api/installations/*/service/frontend/forward",
      "*://*.staffbase.rocks/api/installations/*/service/frontend/forward",
      "*://*.staffbase.dev/api/installations/*/service/frontend/forward",
    ]
  }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'automationComplete') {
    console.log("[Background] Automation complete. Cleaning up leftover JWTs from storage...");
    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items).filter(key =>
        // Simple check: if a key is a 24-character hex string, it's likely a survey ID
        /^[a-f0-9]{24}$/.test(key)
      );

      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, () => {
          console.log(`[Background] Removed ${keysToRemove.length} leftover survey JWTs.`);
        });
      } else {
        console.log("[Background] No leftover JWTs found to clean up.");
      }
    });
  }

  // GitHub OAuth — proxied through background to avoid CORS
  if (message.type === 'GITHUB_REQUEST_DEVICE_CODE') {
    fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload),
    })
      .then(res => res.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === 'GITHUB_POLL_TOKEN') {
    fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload),
    })
      .then(res => res.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

});


// Side panel code
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] onInstalled fired');

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(console.error);
  }

  // Create context menus for blog + LinkedIn scraping.
  // removeAll first so reloads / updates don't throw "duplicate id" on the
  // blog item and abort before the LinkedIn item is registered.
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'replify-scrape-blog',
        title: 'Replify: Scrape this blog',
        contexts: ['page'],
        // Hidden by default; the side panel flips it to visible only while a
        // blog scrape is actively waiting for the user to right-click.
        visible: false,
      });
      chrome.contextMenus.create({
        id: 'replify-scrape-linkedin',
        title: 'Replify: Scrape this LinkedIn page',
        contexts: ['page'],
        documentUrlPatterns: ['*://*.linkedin.com/*', '*://*.linkedin.cn/*'],
      });
      console.log('[Background] Context menus created successfully');
    });
  } catch (error) {
    console.error('[Background] Failed to create context menu:', error);
  }
});

// Scraper function (used by both context menu and keyboard shortcut)
const scrapeBlogArticles = async () => {
  try {
    console.log('[BlogScraper] Starting blog article scrape...');

    const contentRoot = document.querySelector('main, [role="main"]') || document.body;

    const toAbsoluteUrl = (url) => {
      if (!url) return null;
      try {
        return new URL(url, window.location.origin).href;
      } catch {
        return null;
      }
    };

    const cleanText = (text) => {
      return text?.trim().replace(/\s+/g, ' ').substring(0, 500) || '';
    };

    const parseSrcset = (srcset) => {
      if (!srcset || typeof srcset !== 'string') return null;
      const first = srcset.split(',')[0]?.trim();
      if (!first) return null;
      return first.split(/\s+/)[0] || null;
    };

    const normalizeArticleUrl = (url) => {
      try {
        const parsed = new URL(url);
        parsed.hash = '';
        parsed.search = '';
        parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
        return parsed.href;
      } catch {
        return url;
      }
    };

    const getImageUrlFromElement = (root) => {
      if (!root) return null;
      const img = root.matches?.('img') ? root : root.querySelector?.('img');
      if (!img) return null;

      const candidates = [
        img.currentSrc,
        img.getAttribute('src'),
        img.getAttribute('data-src'),
        img.getAttribute('data-lazy-src'),
        img.getAttribute('data-original'),
        parseSrcset(img.getAttribute('srcset')),
        parseSrcset(img.getAttribute('data-srcset')),
      ];

      for (const candidate of candidates) {
        const absolute = toAbsoluteUrl(candidate);
        if (!absolute) continue;
        if (absolute.includes('avatar') || absolute.includes('logo') || absolute.startsWith('data:')) continue;
        return absolute;
      }
      return null;
    };

    const extractDate = (element) => {
      if (!element) return null;

      const timeEl = element.querySelector?.('time[datetime]');
      if (timeEl?.dateTime) return timeEl.dateTime;

      const dateSelectors = ['.date', '.published', '.post-date', '.entry-date', '.posted-on', '[data-date]'];
      for (const selector of dateSelectors) {
        const dateEl = element.querySelector?.(selector);
        const dateText = dateEl?.getAttribute?.('data-date') || dateEl?.textContent;
        if (!dateText) continue;
        const parsed = new Date(dateText.trim());
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
      }

      const shortDateEl = element.querySelector?.('.eyebrow__date');
      if (shortDateEl?.textContent) {
        const shortDate = cleanText(shortDateEl.textContent);
        const parsed = new Date(`${shortDate} ${new Date().getFullYear()}`);
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
      }

      return null;
    };

    const isLikelyNavArea = (element) => {
      return Boolean(
        element?.closest?.(
          'header, nav, footer, aside, [role="navigation"], menu, [aria-label*="menu" i], [aria-label*="navigation" i]'
        )
      );
    };

    const isLikelyArticleUrl = (url, contextScore = 0) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return false;
      }

      if (!/^https?:$/.test(parsed.protocol)) return false;

      const path = parsed.pathname.toLowerCase();
      const segments = path.split('/').filter(Boolean);
      if (segments.length === 0) return false;

      if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|xml|json|js|css)$/i.test(path)) return false;

      const blockedSingle = new Set([
        'about', 'contact', 'privacy', 'terms', 'rss', 'feed', 'feeds', 'search', 'login',
        'signin', 'signup', 'register', 'subscribe', 'newsletter', 'sitemap', 'help'
      ]);
      if (segments.length === 1 && blockedSingle.has(segments[0])) return false;

      const blockedPathHints = ['/tag/', '/tags/', '/category/', '/categories/', '/author/', '/authors/'];
      const hasBlockedHint = blockedPathHints.some((hint) => path.includes(hint));

      let score = contextScore;
      if (parsed.origin === window.location.origin) score += 2;
      if (segments.length >= 2) score += 2;
      if (segments.length >= 3) score += 1;
      if (/\d{4}/.test(path)) score += 1;
      if (path.length < 8) score -= 1;
      if (hasBlockedHint) score -= 2;

      return score >= 3;
    };

    const dedupeArticles = (articles) => {
      const deduped = [];
      const seen = new Set();

      for (const article of articles) {
        if (!article?.title || !article?.url) continue;
        const normalizedUrl = normalizeArticleUrl(article.url);
        if (seen.has(normalizedUrl)) continue;
        seen.add(normalizedUrl);
        deduped.push({ ...article, url: normalizedUrl });
      }

      return deduped;
    };

    const isLikelyMetaLink = (anchor) => {
      if (!anchor) return true;
      const ownClass = typeof anchor.className === 'string' ? anchor.className : '';
      const parentClass = typeof anchor.parentElement?.className === 'string' ? anchor.parentElement.className : '';
      const classBlob = `${ownClass} ${parentClass}`.toLowerCase();
      const text = cleanText(anchor.textContent || '').toLowerCase();

      if (/eyebrow|tag|category|author|breadcrumb|chip|kicker|label/.test(classBlob)) return true;
      if (/^(read more|see all|more|all|latest|news)$/i.test(text)) return true;
      return false;
    };

    const pickBestArticleAnchor = (container, titleHint) => {
      const anchors = Array.from(container.querySelectorAll('a[href]'))
        .filter((a) => a.getAttribute('href') && !a.getAttribute('href').startsWith('#'));
      if (anchors.length === 0) return null;

      const headingAnchors = anchors.filter((a) => a.querySelector('h1,h2,h3,h4'));
      if (headingAnchors.length > 0) return headingAnchors[0];

      const titleNorm = cleanText(titleHint || '').toLowerCase();
      if (titleNorm) {
        const matching = anchors.filter((a) => {
          const txt = cleanText(a.textContent || '').toLowerCase();
          if (!txt) return false;
          return txt.includes(titleNorm) || titleNorm.includes(txt);
        });
        if (matching.length > 0) {
          return matching.sort((a, b) => cleanText(b.textContent || '').length - cleanText(a.textContent || '').length)[0];
        }
      }

      const nonMeta = anchors.filter((a) => !isLikelyMetaLink(a));
      if (nonMeta.length > 0) {
        return nonMeta.sort((a, b) => cleanText(b.textContent || '').length - cleanText(a.textContent || '').length)[0];
      }

      return anchors.sort((a, b) => cleanText(b.textContent || '').length - cleanText(a.textContent || '').length)[0];
    };

    const preferEnrichedTitle = (originalTitle, enrichedTitle) => {
      const original = cleanText(originalTitle || '');
      const enriched = cleanText(enrichedTitle || '');
      if (!enriched) return original || null;
      if (!original) return enriched;

      const originalWords = original.split(/\s+/).filter(Boolean).length;
      const enrichedWords = enriched.split(/\s+/).filter(Boolean).length;
      const suspiciouslyShort = enriched.length < Math.max(18, Math.floor(original.length * 0.6));

      if (suspiciouslyShort && enrichedWords <= 3 && originalWords >= 4) {
        return original;
      }
      return enriched;
    };

    const articleHtmlToText = (html) => {
      if (!html) return '';
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return cleanText(tmp.textContent || '');
    };

    const getMetaContent = (doc, selectors) => {
      for (const selector of selectors) {
        const value = doc.querySelector(selector)?.getAttribute('content');
        if (value?.trim()) return value.trim();
      }
      return null;
    };

    const extractArticleDocumentData = (doc, fallbackUrl) => {
      const toAbsoluteWithBase = (url) => {
        if (!url) return null;
        try {
          return new URL(url, fallbackUrl).href;
        } catch {
          return null;
        }
      };

      const title =
        cleanText(getMetaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]'])) ||
        cleanText(doc.querySelector('article h1, main h1, h1')?.textContent) ||
        cleanText(doc.title);

      const description =
        cleanText(getMetaContent(doc, ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'])) ||
        cleanText(doc.querySelector('article p, main p, p')?.textContent);

      const imageCandidates = [
        getMetaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']),
        doc.querySelector('article img')?.getAttribute('src'),
        doc.querySelector('main img')?.getAttribute('src'),
        parseSrcset(doc.querySelector('article img')?.getAttribute('srcset')),
      ];

      let imageUrl = null;
      for (const candidate of imageCandidates) {
        const absolute = toAbsoluteWithBase(candidate);
        if (!absolute) continue;
        if (absolute.startsWith('data:')) continue;
        imageUrl = absolute;
        break;
      }

      const date =
        doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
        getMetaContent(doc, [
          'meta[property="article:published_time"]',
          'meta[name="pubdate"]',
          'meta[name="date"]',
        ]);

      const contentRoot = doc.querySelector('article') || doc.querySelector('main') || doc.body;
      const paragraphs = Array.from(contentRoot?.querySelectorAll('p') || [])
        .map((p) => cleanText(p.textContent))
        .filter((text) => text && text.length >= 30)
        .slice(0, 8);

      let contentHtml = '';
      if (paragraphs.length > 0) {
        contentHtml = paragraphs
          .map((text) => `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
          .join('');
      }

      return {
        title: title || null,
        excerpt: description || paragraphs[0] || null,
        imageUrl,
        date: date || null,
        contentHtml: contentHtml || null,
      };
    };

    const enrichArticle = async (article) => {
      try {
        const response = await fetch(article.url, {
          method: 'GET',
          credentials: 'include',
          redirect: 'follow',
          cache: 'no-store'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        if (!html || html.length < 200) throw new Error('Empty article HTML');

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const extracted = extractArticleDocumentData(doc, article.url);

        const merged = {
          ...article,
          title: preferEnrichedTitle(article.title, extracted.title),
          excerpt: extracted.excerpt || article.excerpt,
          imageUrl: extracted.imageUrl || article.imageUrl,
          date: extracted.date || article.date,
          contentHtml: extracted.contentHtml || article.contentHtml || null,
        };

        const mergedText = articleHtmlToText(merged.contentHtml);
        if (!merged.excerpt && mergedText) {
          merged.excerpt = cleanText(mergedText).substring(0, 280);
        }

        return merged;
      } catch (error) {
        console.warn(`[BlogScraper] Enrichment failed for ${article.url}:`, error?.message || error);
        return article;
      }
    };

    const enrichArticles = async (inputArticles) => {
      const maxToEnrich = 12;
      const concurrency = 3;
      const articlesToEnrich = inputArticles.slice(0, maxToEnrich);
      const remaining = inputArticles.slice(maxToEnrich);

      let index = 0;
      const enriched = new Array(articlesToEnrich.length);

      const worker = async () => {
        while (index < articlesToEnrich.length) {
          const currentIndex = index++;
          enriched[currentIndex] = await enrichArticle(articlesToEnrich[currentIndex]);
        }
      };

      const workers = [];
      for (let i = 0; i < Math.min(concurrency, articlesToEnrich.length); i += 1) {
        workers.push(worker());
      }
      await Promise.all(workers);

      return [...enriched, ...remaining];
    };

    const extractArticleData = (container) => {
      if (!container || isLikelyNavArea(container)) return null;

      let title = null;
      const headingSelectors = ['h1', 'h2', 'h3', '.title', '.entry-title', '.post-title', '.article-title'];
      for (const selector of headingSelectors) {
        const heading = container.querySelector(selector);
        if (heading?.textContent?.trim()) {
          title = cleanText(heading.textContent);
          break;
        }
      }

      let url = null;
      const headingLink = container.querySelector('h1 a, h2 a, h3 a, h4 a, .title a, .entry-title a');
      if (headingLink?.href) {
        url = toAbsoluteUrl(headingLink.href);
      }
      if (!url) {
        const bestLink = pickBestArticleAnchor(container, title);
        if (bestLink?.href) {
          url = toAbsoluteUrl(bestLink.href);
        }
      }

      if (!title || !url) return null;
      const contextScore = (container.querySelector('h1,h2,h3,h4') ? 2 : 0) + (container.querySelector('img') ? 1 : 0);
      if (!isLikelyArticleUrl(url, contextScore)) return null;

      let excerpt = null;
      const excerptSelectors = ['.excerpt', '.summary', '.description', '.entry-summary', 'p'];
      for (const selector of excerptSelectors) {
        const excerptEl = container.querySelector(selector);
        const text = cleanText(excerptEl?.textContent || '');
        if (!text) continue;
        if (text === title) continue;
        excerpt = text;
        if (excerpt.length > 50) break;
      }

      let imageUrl = null;
      const imageSelectors = [
        'img.featured-image',
        'img.post-thumbnail',
        'img.wp-post-image',
        '.featured-image img',
        '.post-thumbnail img',
        '.article-image img',
        'img'
      ];
      for (const selector of imageSelectors) {
        const img = container.querySelector(selector);
        imageUrl = getImageUrlFromElement(img);
        if (imageUrl) break;
      }

      const date = extractDate(container);
      return { title, url, excerpt, imageUrl, date };
    };

    const extractArticleDataFromAnchor = (anchor) => {
      if (!anchor || isLikelyNavArea(anchor)) return null;
      if (isLikelyMetaLink(anchor)) return null;

      const rawHref = anchor.getAttribute('href') || anchor.href;
      const absoluteUrl = toAbsoluteUrl(rawHref);
      if (!absoluteUrl || absoluteUrl.includes('#')) return null;

      const container = anchor.closest('article, li, section, div') || anchor.parentElement;
      if (!container || isLikelyNavArea(container)) return null;

      const hasHeading = Boolean(anchor.querySelector('h1,h2,h3,h4') || container.querySelector('h1,h2,h3,h4'));
      const hasImage = Boolean(anchor.querySelector('img') || container.querySelector('img'));
      const contextScore = (hasHeading ? 2 : 0) + (hasImage ? 1 : 0);
      if (!isLikelyArticleUrl(absoluteUrl, contextScore)) return null;

      let title = cleanText(
        anchor.querySelector('h1,h2,h3,h4')?.textContent ||
        container.querySelector('h1,h2,h3,h4,.title,.entry-title,.post-title,.article-title')?.textContent ||
        anchor.getAttribute('aria-label')
      );

      if (!title || title.length < 12) return null;
      title = title.split('. ')[0]?.trim() || title;

      const paragraphs = Array.from(container.querySelectorAll('p'));
      let excerpt = null;
      for (const p of paragraphs) {
        const text = cleanText(p.textContent);
        if (!text || text === title) continue;
        if (text.length >= 20) {
          excerpt = text;
          break;
        }
      }

      const imageUrl = getImageUrlFromElement(anchor) || getImageUrlFromElement(container);
      const date = extractDate(container);

      return {
        title,
        url: absoluteUrl,
        excerpt,
        imageUrl,
        date,
      };
    };

    const findArticleContainers = () => {
      let containers = Array.from(contentRoot.querySelectorAll('article'));
      if (containers.length >= 2) {
        console.log(`[BlogScraper] Found ${containers.length} <article> elements`);
        return containers;
      }

      containers = Array.from(contentRoot.querySelectorAll('[role="article"]'));
      if (containers.length >= 2) {
        console.log(`[BlogScraper] Found ${containers.length} elements with role="article"`);
        return containers;
      }

      const commonClasses = [
        '.post',
        '.entry',
        '.blog-post',
        '.article-item',
        '.post-item',
        '.article-card',
        '.blog-item',
        '.card',
        '.news-item'
      ];

      for (const className of commonClasses) {
        containers = Array.from(contentRoot.querySelectorAll(className));
        if (containers.length >= 2) {
          console.log(`[BlogScraper] Found ${containers.length} elements with class "${className}"`);
          return containers;
        }
      }

      const allElements = Array.from(contentRoot.querySelectorAll('div[class], section[class], li[class]'));
      const classCount = {};
      allElements.forEach((el) => {
        if (!el.classList) return;
        for (const className of Array.from(el.classList)) {
          if (!className) continue;
          classCount[className] = (classCount[className] || 0) + 1;
        }
      });

      const repeatingClasses = Object.entries(classCount)
        .filter(([_, count]) => count >= 3)
        .sort(([_, a], [__, b]) => b - a)
        .map(([className]) => className);

      for (const className of repeatingClasses.slice(0, 12)) {
        containers = Array.from(contentRoot.querySelectorAll(`.${CSS.escape(className)}`));
        const validContainers = containers.filter((el) => el.querySelector('h1,h2,h3,h4') && el.querySelector('a[href]'));
        if (validContainers.length >= 2) {
          console.log(`[BlogScraper] Found ${validContainers.length} repeating elements with class "${className}"`);
          return validContainers;
        }
      }

      return [];
    };

    const collectFromAnchors = (label, anchors) => {
      const extracted = dedupeArticles(anchors.map(extractArticleDataFromAnchor).filter(Boolean));
      if (extracted.length > 0) {
        console.log(`[BlogScraper] Fallback "${label}" found ${extracted.length} article(s)`);
      }
      return extracted;
    };

    const containers = findArticleContainers();
    let articles = dedupeArticles(containers.map(extractArticleData).filter(Boolean));

    if (articles.length < 2) {
      const headingAnchors = Array.from(contentRoot.querySelectorAll('h1 a[href], h2 a[href], h3 a[href], h4 a[href]'));
      const semanticAnchors = Array.from(contentRoot.querySelectorAll('article a[href], li a[href], [role="article"] a[href]'));
      const mediaCardAnchors = Array.from(contentRoot.querySelectorAll('a[href]')).filter((a) => {
        const container = a.closest('article, li, section, div');
        if (!container || isLikelyNavArea(container)) return false;
        return Boolean(container.querySelector('h1,h2,h3,h4') && container.querySelector('img'));
      });

      const fallbackBatches = [
        collectFromAnchors('heading links', headingAnchors),
        collectFromAnchors('semantic card links', semanticAnchors),
        collectFromAnchors('media card links', mediaCardAnchors),
      ];

      for (const batch of fallbackBatches) {
        if (batch.length === 0) continue;
        articles = dedupeArticles([...articles, ...batch]);
      }
    }

    if (articles.length === 0) {
      return {
        ok: false,
        articles: [],
        error: 'No blog articles found on this page. Try opening a blog listing/feed page instead of a homepage or navigation page.'
      };
    }

    console.log(`[BlogScraper] Base scrape found ${articles.length} article(s). Enriching content and images...`);
    try {
      articles = await enrichArticles(articles);
    } catch (enrichError) {
      console.warn(`[BlogScraper] Enrichment stage failed, using base scrape data:`, enrichError?.message || enrichError);
    }
    console.log(`[BlogScraper] Successfully scraped/enriched ${articles.length} article(s)`);
    return {
      ok: true,
      articles,
      error: null
    };
  } catch (error) {
    console.error('[BlogScraper] Error scraping blog:', error);
    return {
      ok: false,
      articles: [],
      error: error.message || 'Unknown error during scraping'
    };
  }
};

// Shared function to perform scraping (called by context menu or keyboard shortcut)
const performBlogScrape = async (tab) => {
  console.log('[Background] Performing blog scrape on tab:', tab.id);

  try {
    // Inject the scraper (we have activeTab from context menu/keyboard!)
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeBlogArticles
    });

    console.log('[Background] Scrape result:', result);

    // Store result in chrome.storage for side panel to retrieve
    await chrome.storage.local.set({
      'replify_blog_scrape_result': {
        result,
        tabId: tab.id,
        url: tab.url,
        timestamp: Date.now()
      }
    });

    console.log('[Background] Scrape result stored in chrome.storage');

    // Auto-close the blog tab after successful scrape
    try {
      await chrome.tabs.remove(tab.id);
      console.log('[Background] Blog tab closed automatically');
    } catch (closeError) {
      console.warn('[Background] Failed to close tab:', closeError);
    }

  } catch (error) {
    console.error('[Background] Scraping error:', error);
    // Store error
    await chrome.storage.local.set({
      'replify_blog_scrape_result': {
        result: { ok: false, articles: [], error: error.message },
        tabId: tab.id,
        url: tab.url,
        timestamp: Date.now()
      }
    });

    // Close tab even on error
    try {
      await chrome.tabs.remove(tab.id);
      console.log('[Background] Blog tab closed after error');
    } catch (closeError) {
      console.warn('[Background] Failed to close tab after error:', closeError);
    }
  }
};

// ─── LinkedIn scraping (Voyager GraphQL API, runs in linkedin.com page context) ──
// Cookies (li_at, JSESSIONID) ride along automatically because the injected
// script executes in the linkedin.com origin via chrome.scripting.executeScript.
//
// As of late 2026, LinkedIn moved company-feed reads from the old REST endpoint
// to a persisted-query GraphQL endpoint. The queryId is LinkedIn's compiled
// query hash and may change at any LinkedIn deploy — if scraping starts
// returning empty results, capture a fresh queryId from a network tab on a
// `/company/<slug>/posts/?feedView=images` page and bump the constant below.
const scrapeLinkedInPosts = async () => {
  // Must live INSIDE the function — this whole body gets stringified and
  // injected into the LinkedIn page; module-level consts from background.js
  // are not visible in that scope.
  const GRAPHQL_QUERY_ID = 'voyagerFeedDashOrganizationalPageUpdates.744a3e07d61411c4f05738f17d5059c3';

  try {
    console.log('[LinkedInScraper] Starting LinkedIn scrape...');

    // JSESSIONID is set by LinkedIn (not HttpOnly) and required as csrf-token.
    const jsessionMatch = document.cookie.match(/JSESSIONID=(?:"?)([^";]+)/);
    const csrfToken = jsessionMatch ? jsessionMatch[1] : null;
    if (!csrfToken) {
      return {
        ok: false,
        posts: [],
        error: 'Could not find JSESSIONID cookie — are you logged into LinkedIn?',
      };
    }

    // Supported: https://www.linkedin.com/company/<slug>/posts/ (and similar)
    const pathMatch = window.location.pathname.match(/^\/company\/([^/]+)/);
    if (!pathMatch) {
      return {
        ok: false,
        posts: [],
        error: 'Unsupported LinkedIn URL. Open a company posts page like https://www.linkedin.com/company/<slug>/posts/.',
      };
    }

    // The GraphQL endpoint wants a numeric company ID, not the slug. The ID
    // is embedded in the rendered HTML (multiple places — fsd_company URN,
    // organizationalPage URN, etc).
    const html = document.documentElement.outerHTML;
    const idMatch =
      html.match(/urn:li:fsd_organizationalPage:(\d+)/) ||
      html.match(/urn:li:fsd_company:(\d+)/) ||
      html.match(/urn:li:company:(\d+)/);
    if (!idMatch) {
      return {
        ok: false,
        posts: [],
        error: 'Could not find the company ID in the page HTML. Make sure the page has fully loaded.',
      };
    }
    const companyId = idMatch[1];
    console.log(`[LinkedInScraper] Resolved company ID: ${companyId}`);

    const COUNT = 30;
    // Variables in LinkedIn's rest.li-style URL format (NOT JSON). URN colons
    // must be percent-encoded; parens/commas/keys stay literal.
    const orgUrn = encodeURIComponent(`urn:li:fsd_organizationalPage:${companyId}`);
    const variables =
      `(count:${COUNT},organizationalPageUrn:${orgUrn},moduleKey:ORGANIZATION_MEMBER_FEED_DESKTOP,start:0,filter:IMAGES)`;
    const graphqlUrl =
      `https://www.linkedin.com/voyager/api/graphql?variables=${variables}&queryId=${GRAPHQL_QUERY_ID}`;

    const res = await fetch(graphqlUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'csrf-token': csrfToken,
        'x-li-lang': 'en_US',
        'x-restli-protocol-version': '2.0.0',
        accept: 'application/vnd.linkedin.normalized+json+2.1',
      },
    });

    if (!res.ok) {
      return {
        ok: false,
        posts: [],
        error: `Voyager returned ${res.status}. You may need to refresh the page or re-login to LinkedIn.`,
      };
    }

    const raw = await res.json();
    const feedNode = raw?.data?.data?.feedDashOrganizationalPageUpdatesByOrganizationalPageFeed;
    const orderedUrns = Array.isArray(feedNode?.['*elements']) ? feedNode['*elements'] : [];
    const included = Array.isArray(raw?.included) ? raw.included : [];

    if (!orderedUrns.length || !included.length) {
      return {
        ok: false,
        posts: [],
        error: 'Voyager GraphQL returned an empty feed. The queryId may have rotated — check background.js.',
      };
    }

    // Build entityUrn -> Update map. Only objects whose $type is dash.feed.Update.
    const updatesByUrn = new Map();
    for (const item of included) {
      if (item?.$type === 'com.linkedin.voyager.dash.feed.Update' && item.entityUrn) {
        updatesByUrn.set(item.entityUrn, item);
      }
    }

    const bestImageFromVector = (vec) => {
      if (!vec?.rootUrl || !Array.isArray(vec.artifacts) || !vec.artifacts.length) return '';
      // Pick the largest artifact under ~1280px wide for reasonable bytes.
      const sorted = [...vec.artifacts].sort((a, b) => (b.width || 0) - (a.width || 0));
      const pick = sorted.find((a) => (a.width || 0) <= 1280) || sorted[0];
      return vec.rootUrl + (pick.fileIdentifyingUrlPathSegment || '');
    };

    const filterPost = (post) => {
      if (!post) return null;
      const filtered = { postText: '', postImage: '', originalPostURL: '' };

      // Image — only ImageComponent in the GraphQL response. May be multiple.
      const imageComp = post.content?.imageComponent;
      const firstImageAttr = imageComp?.images?.[0]?.attributes?.[0];
      const vec = firstImageAttr?.detailData?.vectorImage;
      if (vec) {
        filtered.postImage = bestImageFromVector(vec);
      }

      const commentaryText = post.commentary?.text?.text;
      if (commentaryText) filtered.postText = commentaryText;

      const shareUrl = post.socialContent?.shareUrl;
      if (shareUrl) filtered.originalPostURL = shareUrl;

      if (!filtered.originalPostURL || !filtered.postImage || !filtered.postText) return null;
      return filtered;
    };

    // Preserve LinkedIn's display order via orderedUrns.
    const posts = [];
    for (const urn of orderedUrns) {
      const update = updatesByUrn.get(urn);
      if (!update) continue;
      const filtered = filterPost(update);
      if (filtered) posts.push(filtered);
    }

    if (posts.length === 0) {
      return {
        ok: false,
        posts: [],
        error: 'Voyager returned posts but none had usable text + image + share URL.',
      };
    }

    console.log(`[LinkedInScraper] Found ${posts.length} usable post(s).`);
    return { ok: true, posts, error: null };
  } catch (error) {
    console.error('[LinkedInScraper] Error:', error);
    return {
      ok: false,
      posts: [],
      error: error?.message || 'Unknown error during LinkedIn scraping',
    };
  }
};

const performLinkedInScrape = async (tab) => {
  console.log('[Background] Performing LinkedIn scrape on tab:', tab.id);
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeLinkedInPosts,
    });

    await chrome.storage.local.set({
      replify_linkedin_scrape_result: {
        result,
        tabId: tab.id,
        url: tab.url,
        timestamp: Date.now(),
      },
    });

    try {
      await chrome.tabs.remove(tab.id);
    } catch (closeError) {
      console.warn('[Background] Failed to close LinkedIn tab:', closeError);
    }
  } catch (error) {
    console.error('[Background] LinkedIn scraping error:', error);
    await chrome.storage.local.set({
      replify_linkedin_scrape_result: {
        result: { ok: false, posts: [], error: error.message },
        tabId: tab.id,
        url: tab.url,
        timestamp: Date.now(),
      },
    });
    try {
      await chrome.tabs.remove(tab.id);
    } catch (closeError) {
      console.warn('[Background] Failed to close LinkedIn tab after error:', closeError);
    }
  }
};

// ─── Active-scrape gating ──
// The side panel writes { type, tabId } to replify_active_scrape when it
// opens a scrape tab, and clears it when the scrape resolves. Both the
// context-menu handler and the keyboard-shortcut handler check this flag and
// silently bail if the action doesn't match the active session — that
// prevents a stray Cmd+Shift+S from hijacking a LinkedIn scrape (and vice
// versa).
const getActiveScrape = async () => {
  try {
    const stored = await chrome.storage.local.get('replify_active_scrape');
    return stored.replify_active_scrape || null;
  } catch {
    return null;
  }
};

// Handle context menu clicks (blog + LinkedIn)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const active = await getActiveScrape();
  if (info.menuItemId === 'replify-scrape-blog') {
    if (active?.type !== 'blog') {
      console.log('[Background] Blog menu ignored — no active blog scrape session.');
      return;
    }
    await performBlogScrape(tab);
  } else if (info.menuItemId === 'replify-scrape-linkedin') {
    if (active?.type !== 'linkedin') {
      console.log('[Background] LinkedIn menu ignored — no active LinkedIn scrape session.');
      return;
    }
    await performLinkedInScrape(tab);
  }
});

// Handle keyboard shortcuts (blog + LinkedIn)
chrome.commands.onCommand.addListener(async (command) => {
  // Diagnostic: if you don't see this when pressing the shortcut, the binding
  // isn't registered with Chrome. Open chrome://extensions/shortcuts to rebind.
  console.log('[Background] onCommand fired:', command);
  const active = await getActiveScrape();
  if (command === 'scrape-blog') {
    if (active?.type !== 'blog') {
      console.log('[Background] scrape-blog shortcut ignored — no active blog scrape session.');
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await performBlogScrape(tab);
    }
  } else if (command === 'scrape-linkedin') {
    if (active?.type !== 'linkedin') {
      console.log('[Background] scrape-linkedin shortcut ignored — no active LinkedIn scrape session.');
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const host = (() => { try { return new URL(tab.url || '').hostname; } catch { return ''; } })();
    if (!/(^|\.)linkedin\.(com|cn)$/i.test(host)) {
      console.log('[Background] scrape-linkedin shortcut ignored — not on a LinkedIn page:', tab.url);
      return;
    }
    await performLinkedInScrape(tab);
  }
});

// ── Global JS: re-inject enabled snippets on every Staffbase page load ──
const STAFFBASE_HOSTS = ['staffbase.com', 'staffbase.rocks', 'staffbase.dev'];
const GHJS_API_BASE = 'https://api.github.com/repos/Staffbase/solutions-monorepo/contents';

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  let hostname;
  try { hostname = new URL(tab.url).hostname; } catch { return; }
  if (!STAFFBASE_HOSTS.some((d) => hostname.endsWith(d))) return;

  const enabledKey = `ghjs_enabled_${hostname}`;
  const storage = await chrome.storage.local.get([enabledKey, 'githubAccessToken']);
  const enabledSlugs = storage[enabledKey] || [];
  if (enabledSlugs.length === 0) return;

  const ghToken = storage['githubAccessToken'];
  const envUrl = `https://${hostname}`;

  for (const slug of enabledSlugs) {
    try {
      const configKey = `${hostname}:${slug}`;
      const sourceKey = `ghjs_source_${slug}`;
      const data = await chrome.storage.local.get([configKey, sourceKey]);
      const config = data[configKey] || {};
      let src = data[sourceKey];

      if (!src && ghToken) {
        const res = await fetch(`${GHJS_API_BASE}/global-js/dist/${slug}.js`, {
          headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.raw' },
        });
        if (!res.ok) continue;
        src = await res.text();
        await chrome.storage.local.set({ [sourceKey]: src });
      }
      if (!src) continue;

      const flagKey = '__sb_' + slug.replace(/-/g, '_') + '_config';

      await chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN',
        func: (cfg) => { window.__sb_config = cfg; },
        args: [{ apiKey: config.apiKey ?? null, envUrl }],
      });
      await chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN',
        func: (key, cfg) => { window[key] = cfg; },
        args: [flagKey, config],
      });
      await chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN',
        func: (code) => {
          const s = document.createElement('script');
          s.textContent = code;
          (document.head || document.documentElement).appendChild(s);
          s.remove();
        },
        args: [src],
      });
    } catch (err) {
      console.warn(`[Replify] Failed to re-inject Global JS snippet "${slug}":`, err);
    }
  }
});
