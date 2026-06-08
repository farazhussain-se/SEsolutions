/**
 * Page-widget branding — rebrand the Staffbase Link Tiles widget
 * (`data-widget-type="QuickLinks"`, rendered as `class="quick-links-widget"`
 * in the DOM) on the tenant's home page.
 *
 * The widget config is stored as **data attributes** inside the page's HTML
 * body (`contents.{locale}.content`). Specifically:
 *
 *   <div data-widget-type="QuickLinks"
 *        data-widget-conf-tile-bg-color="#164194"
 *        data-widget-conf-tile-text-color="#ffffff"
 *        ...>
 *
 * Mechanism:
 *   1. List pages, find the home page (title contains "home"/"welcome"/etc
 *      AND its body contains a QuickLinks widget). Pages with more widgets
 *      win ties — usually the real home has the densest tile layout.
 *   2. For each locale on that page, swap the two color attributes inside
 *      every QuickLinks widget block using a tag-scoped regex.
 *   3. PUT /api/pages/{id} with the FULL contents object (Pages API is
 *      full-replace, not merge — every locale's title + content must be
 *      round-tripped intact or they get wiped).
 *
 * Auth: same pattern as the rest of Replify — Authorization: Basic ${token}
 * with credentials:'omit' so the request runs as the token owner, not the
 * cookie-session on the active tab.
 *
 * Why regex, not a DOM parser: Replify runs in a Chrome side panel where
 * we don't want to pull in cheerio/jsdom (~MB), and the inner HTML is
 * always emitted by the same Staffbase serializer so the attribute order
 * is predictable. The regex is anchored to `data-widget-type="QuickLinks"`
 * so we never touch StaticContent / news / other widgets that may also
 * carry tile-color-like attributes.
 */

import { buildApiUrl } from '../helpers';
import type { OperationContext } from './types';

/* ── Shapes ───────────────────────────────────────────────────────────────── */

export interface LocaleContent {
  title?: string;
  content?: string;
  [k: string]: unknown;
}

export interface PageRecord {
  id: string;
  externalId?: string;
  published?: boolean;
  spaceId?: string;
  contents?: Record<string, LocaleContent>;
  [k: string]: unknown;
}

export interface LinkTilesEditPlan {
  pageId: string;
  pageTitle: string;
  locales: string[];
  /** How many `data-widget-type="QuickLinks"` blocks the regex found across all locales. */
  widgetCount: number;
}

export interface RebrandReport {
  pageId: string | null;
  pageTitle: string;
  widgetsBranded: number;
  localesTouched: number;
  errors: string[];
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const HOME_TITLE_RE = /home|welcome|start|landing/i;
const HAS_QL_WIDGET = /data-widget-type="QuickLinks"/;

/**
 * Replace the tile background + text color on every QuickLinks widget in
 * an HTML string. Returns [newHtml, widgetsTouched]. Unchanged blocks are
 * left as-is so subsequent runs are idempotent.
 *
 * The outer regex grabs the complete opening `<div … QuickLinks … >` tag.
 * Inside that tag, the two inner regexes swap only the matching attribute
 * values. If a widget lacks one of the attributes (no color was ever set),
 * that replacement no-ops and the tag passes through.
 */
export const rewriteLinkTileColors = (
  html: string,
  primary: string,
  text: string,
): [string, number] => {
  let widgetsTouched = 0;
  // Match `<div ... data-widget-type="QuickLinks" ... >`. Non-greedy to
  // stop at the FIRST `>` so we never swallow nested children.
  const TAG = /<div\b[^>]*\bdata-widget-type="QuickLinks"[^>]*>/g;
  const newHtml = html.replace(TAG, (tag) => {
    let nextTag = tag
      .replace(/data-widget-conf-tile-bg-color="[^"]*"/, `data-widget-conf-tile-bg-color="${primary}"`)
      .replace(/data-widget-conf-tile-text-color="[^"]*"/, `data-widget-conf-tile-text-color="${text}"`);
    if (nextTag !== tag) widgetsTouched += 1;
    return nextTag;
  });
  return [newHtml, widgetsTouched];
};

/* ── Step 1: find the home page ───────────────────────────────────────────── */

interface RawPagesResponse {
  data?: PageRecord[];
}

/**
 * Discover the page that should be rebranded. Heuristics, in order:
 *   1. Has a title containing home/welcome/start/landing AND contains a
 *      QuickLinks widget somewhere in its content.
 *   2. Tie-break by widget count (most QuickLinks blocks wins).
 *
 * Returns null if no page matches.
 */
export const findHomePageWithLinkTiles = async (
  ctx: OperationContext,
): Promise<PageRecord | null> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const url = buildApiUrl('/api/pages?limit=100', apiDomain);
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${apiToken}` },
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`GET /pages -> ${res.status}`);
  const json = (await res.json()) as RawPagesResponse;
  const all = Array.isArray(json.data) ? json.data : [];

  // First filter: title looks like a home page.
  const titledHome = all.filter((p) => {
    const titles = Object.values(p.contents || {}).map((c) => (c?.title ?? '').toLowerCase());
    return titles.some((t) => HOME_TITLE_RE.test(t));
  });

  // Second filter: contains a QuickLinks widget in at least one locale.
  type Scored = { page: PageRecord; widgets: number };
  const scored: Scored[] = titledHome
    .map((p) => {
      let widgets = 0;
      for (const c of Object.values(p.contents || {})) {
        const html = c?.content ?? '';
        widgets += (html.match(/data-widget-type="QuickLinks"/g) || []).length;
      }
      return { page: p, widgets };
    })
    .filter((s) => s.widgets > 0)
    .sort((a, b) => b.widgets - a.widgets);

  if (scored.length === 0) {
    onProgress?.(`⚠️ No home page with a Link Tiles widget found in ${all.length} page(s).`);
    return null;
  }

  const winner = scored[0];
  onProgress?.(
    `🏠 Home page: ${winner.page.id} ("${winner.page.contents?.en_US?.title ?? '?'}") · ${winner.widgets} widget(s).`,
  );
  return winner.page;
};

/* ── Step 2: preview the rebrand plan (read-only) ──────────────────────────── */

/**
 * Inspect-only summary of what `rebrandHomePageLinkTiles` would change.
 * Doesn't write anything. Useful for the form's preview / dry-run UX, or
 * for the Ask-Gemini overlay to call before mutating.
 */
export const previewLinkTilesPlan = async (
  ctx: OperationContext,
): Promise<LinkTilesEditPlan | null> => {
  const page = await findHomePageWithLinkTiles(ctx);
  if (!page) return null;
  let widgetCount = 0;
  const locales: string[] = [];
  for (const [locale, c] of Object.entries(page.contents || {})) {
    const html = c?.content ?? '';
    if (HAS_QL_WIDGET.test(html)) {
      locales.push(locale);
      widgetCount += (html.match(/data-widget-type="QuickLinks"/g) || []).length;
    }
  }
  return {
    pageId: page.id,
    pageTitle: page.contents?.en_US?.title ?? page.contents?.[locales[0]]?.title ?? '?',
    locales,
    widgetCount,
  };
};

/* ── Step 3: write the rebrand ────────────────────────────────────────────── */

/**
 * Find the home page, rewrite the tile colors on every QuickLinks widget
 * (all locales), and PUT the full contents object back.
 *
 * @param args.primary  Hex string for the tile background (e.g. "#0A2540")
 * @param args.text     Hex string for the tile text/link color
 */
export const rebrandHomePageLinkTiles = async (
  args: { primary: string; text: string },
  ctx: OperationContext,
): Promise<RebrandReport> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const report: RebrandReport = {
    pageId: null,
    pageTitle: '',
    widgetsBranded: 0,
    localesTouched: 0,
    errors: [],
  };

  const page = await findHomePageWithLinkTiles(ctx);
  if (!page) {
    report.errors.push('No home page with Link Tiles widget found — skipped.');
    return report;
  }
  report.pageId = page.id;
  report.pageTitle = page.contents?.en_US?.title ?? '?';

  // Build a NEW contents object, round-tripping every locale's title + content.
  // Pages API PUT is full-replace; missing fields get wiped.
  const newContents: Record<string, LocaleContent> = {};
  for (const [locale, c] of Object.entries(page.contents || {})) {
    const originalContent = c?.content ?? '';
    const [nextContent, touched] = rewriteLinkTileColors(originalContent, args.primary, args.text);
    if (touched > 0) {
      report.widgetsBranded += touched;
      report.localesTouched += 1;
      onProgress?.(`✏️  ${page.id} [${locale}]: ${touched} widget(s) → ${args.primary}/${args.text}`);
    }
    newContents[locale] = {
      ...c,
      title: c?.title ?? '',
      content: nextContent,
    };
  }

  if (report.widgetsBranded === 0) {
    onProgress?.('⏭️  No tile-color attributes found to update — page already matches or widget config is non-standard.');
    return report;
  }

  // PUT the page back. credentials:'omit' so the Basic token wins over any
  // session cookie. Per the Pages API: PUT is a full replace of `contents`.
  const url = buildApiUrl(`/api/pages/${page.id}`, apiDomain);
  const putRes = await fetch(url, {
    method: 'PUT',
    credentials: 'omit',
    headers: {
      Authorization: `Basic ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contents: newContents }),
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => '');
    const msg = `PUT /pages/${page.id} -> ${putRes.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`;
    report.errors.push(msg);
    throw new Error(msg);
  }

  onProgress?.(`✅ Link Tiles rebranded on home page "${report.pageTitle}".`);
  return report;
};
