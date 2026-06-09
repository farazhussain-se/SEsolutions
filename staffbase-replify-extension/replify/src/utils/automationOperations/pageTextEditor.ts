/**
 * Page text editor — Gemini rewrites the visible TEXT on existing pages
 * to fit a prospect, preserving layout, images, widget configs, and
 * Studio template variables.
 *
 * The challenge: Staffbase Pages API stores body as a single HTML string
 * in `contents.{locale}.content`. There's no structured block edit API,
 * and `PUT /api/pages/{id}` is full-replace (no PATCH, no merge — see
 * the existing pageWidgetBranding.ts header for the same caveat).
 *
 * Strategy:
 *   1. Parse the HTML in the browser via DOMParser.
 *   2. Walk text nodes only. Skip anything inside:
 *      - <script>, <style>, <noscript>
 *      - Any element with `data-widget-type` (widget configs are stored
 *        in attributes — we don't touch them)
 *      - Empty / whitespace-only text
 *      - Staffbase template variables: `{{user.profile.firstName}}` etc.
 *   3. Send all eligible text nodes to Gemini as one batch, with the
 *      prospect context + tone preference. Gemini returns rewrites
 *      keyed by integer id so order can't drift.
 *   4. Splice rewrites back into the same DOM positions, serialize the
 *      HTML, and PUT the page back via the Pages API. Other locales
 *      are round-tripped untouched (full-replace constraint).
 *
 * Auth + LLM: reuses Replify's existing patterns —
 *   - Authorization: Basic <apiToken>, credentials:'omit'
 *   - All Gemini calls go through callGeminiProxy (Supabase Edge Fn)
 */

import { buildApiUrl, stripJsonFences } from '../helpers';
import callGeminiProxy from '../geminiProxy';
import type { OperationContext } from './types';
import type { ProspectBrief } from '../aiUtils';

/* ── Shapes ───────────────────────────────────────────────────────────────── */

export interface CommonPage {
  id: string;
  /** en_US title; falls back to first available locale if en_US is missing. */
  primaryTitle: string;
  /** All locales present on the page (so the diff UI can warn about locales we won't edit in V1). */
  locales: string[];
  /** Editable text-block count in en_US (drives the form's "X blocks" badge). */
  textBlockCount: number;
}

/**
 * A text node Gemini will be asked to rewrite.
 *
 * `id` is the only thing Gemini sees + returns. `_treePath` is internal
 * — we use it to re-locate the text node when patching the HTML back
 * together so we don't have to rely on Gemini preserving order.
 */
export interface TextNode {
  id: number;
  text: string;
  /** Parent tag (h1, p, li, a, span…) — gives Gemini hints about role. */
  context: string;
}

export interface RewriteEntry {
  id: number;
  oldText: string;
  newText: string;
  context: string;
}

export interface PageEditDiff {
  pageId: string;
  pageTitle: string;
  locale: string;
  entries: RewriteEntry[];
  /** Pre-computed HTML with rewrites applied — ready to PUT if approved. */
  rewrittenHtml: string;
  /** Full original `contents` object, kept for the round-trip on PUT. */
  originalContents: Record<string, { title?: string; content?: string; [k: string]: unknown }>;
}

export interface ApplyReport {
  pagesApplied: number;
  pagesFailed: number;
  errors: string[];
}

/* ── Constants for text-node filtering ────────────────────────────────────── */

const COMMON_TITLE_RE =
  /home|welcome|hr|human resources|\bit\b|onboarding|benefits|help|faq|communities|payroll|about|directory|policies|leadership/i;

const SKIP_TAGS = new Set([
  'STYLE', 'SCRIPT', 'NOSCRIPT',
  'IMG', 'VIDEO', 'AUDIO', 'IFRAME', 'CANVAS', 'SVG',
]);

/** Staffbase template variables like `{{user.profile.firstName}}` — don't translate these. */
const TEMPLATE_VAR_RE = /^\s*\{\{.+?\}\}\s*$/;

/* ── Step 1: discover common pages ────────────────────────────────────────── */

interface RawPage {
  id?: string;
  contents?: Record<string, { title?: string; content?: string }>;
}

/**
 * List pages whose titles match the common-page heuristic. Counts editable
 * text blocks in en_US (or first available locale) so the UI can show
 * "X text blocks" badges for each page.
 */
export const discoverCommonPages = async (ctx: OperationContext): Promise<CommonPage[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const url = buildApiUrl('/api/pages?limit=100', apiDomain);
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${apiToken}` },
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`GET /pages -> ${res.status}`);
  const json = (await res.json()) as { data?: RawPage[] };
  const all = Array.isArray(json.data) ? json.data : [];

  const out: CommonPage[] = [];
  for (const p of all) {
    if (!p.id || !p.contents) continue;
    const locales = Object.keys(p.contents);
    const titles = locales.map((l) => p.contents?.[l]?.title ?? '');
    const matchesHeuristic = titles.some((t) => COMMON_TITLE_RE.test(t));
    if (!matchesHeuristic) continue;

    const primaryLocale = p.contents.en_US ? 'en_US' : locales[0];
    const primaryTitle = p.contents[primaryLocale]?.title ?? '(untitled)';
    const enHtml = p.contents.en_US?.content ?? p.contents[primaryLocale]?.content ?? '';
    const { nodes } = extractEditableTextNodes(enHtml);

    out.push({
      id: p.id,
      primaryTitle,
      locales,
      textBlockCount: nodes.length,
    });
  }

  onProgress?.(`📄 Found ${out.length} common page(s) out of ${all.length} total.`);
  return out.sort((a, b) => b.textBlockCount - a.textBlockCount);
};

/* ── Step 2: extract editable text nodes ──────────────────────────────────── */

/**
 * Walk the HTML in a DOMParser document and return all editable text nodes.
 *
 * `doc` is also returned so callers can re-walk and patch the same tree
 * without re-parsing — important because text-node identity isn't stable
 * across parses but IS stable across walks of the same Document.
 */
export const extractEditableTextNodes = (html: string): { nodes: TextNode[]; doc: Document } => {
  const parser = new DOMParser();
  // Wrap in a single root so partial-fragment HTML still parses with
  // body-level children intact.
  const doc = parser.parseFromString(`<!doctype html><html><body><div id="__replify_root">${html}</div></body></html>`, 'text/html');
  const root = doc.getElementById('__replify_root');
  const nodes: TextNode[] = [];
  if (!root) return { nodes, doc };

  let nextId = 0;
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName)) return;
      // Widget containers — config is stored in attributes (see
      // pageWidgetBranding.ts). Don't touch their inner text.
      if (el.hasAttribute && el.hasAttribute('data-widget-type')) return;
      Array.from(node.childNodes).forEach(walk);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? '';
      const trimmed = text.trim();
      if (!trimmed) return;                       // whitespace
      if (TEMPLATE_VAR_RE.test(text)) return;     // {{user.profile.firstName}}
      const parentTag = (node.parentElement?.tagName || 'span').toLowerCase();
      nodes.push({ id: nextId++, text: trimmed, context: parentTag });
    }
  };
  Array.from(root.childNodes).forEach(walk);

  return { nodes, doc };
};

/* ── Step 3: Gemini rewrite (bulk, ID-keyed) ──────────────────────────────── */

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Single Gemini call that REPLACES generic page text with content that
 * sounds like it was written FOR the prospect's employees.
 *
 * Prompt design (V2 — aggressive rewrite):
 *   - The structured `brief` (from buildProspectBrief) takes precedence
 *     over the raw news blob. Gemini gets crisp signals — real product
 *     names, real leaders, real initiatives — rather than having to
 *     forage a news summary.
 *   - The previous "if generic enough, return unchanged" rule produced
 *     timid edits. Removed entirely — generic blocks are exactly what
 *     should change. Every block should come back prospect-specific.
 *   - Length is a soft constraint. Headings stay short, CTAs stay
 *     short, body paragraphs can flex ±40%.
 *   - Each node still gets a stable integer id Gemini must echo back,
 *     so order drift doesn't break splicing.
 */
export const rewriteTextNodesViaGemini = async (
  args: {
    nodes: TextNode[];
    prospect?: { name?: string; news?: string };
    brief?: ProspectBrief;
    tone?: 'professional' | 'friendly' | 'executive';
  },
  ctx: OperationContext,
): Promise<Map<number, string>> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  if (args.nodes.length === 0) return new Map();

  const tone = args.tone ?? 'professional';
  onProgress?.(`🤖 Gemini rewriting ${args.nodes.length} text block(s) in ${tone} tone…`);

  // Prefer the structured brief when present. Fall back to raw news.
  const briefBlock = args.brief
    ? [
        `About ${args.prospect?.name ?? 'the company'} — use these as raw material; name-drop real things:`,
        `  Industry:     ${args.brief.industry}`,
        `  Audience:     ${args.brief.audience}`,
        `  Voice:        ${args.brief.voice}`,
        `  Themes:       ${args.brief.themes.join(', ') || '(none)'}`,
        `  Products:     ${args.brief.products.join(', ') || '(none)'}`,
        `  Initiatives:  ${args.brief.recentInitiatives.join(' · ') || '(none)'}`,
        `  Leadership:   ${args.brief.leadership.join(' · ') || '(none)'}`,
        ``,
        `  Summary: ${args.brief.oneLiner}`,
        ``,
      ].join('\n')
    : args.prospect?.name
    ? [
        `Prospect: ${args.prospect.name}`,
        args.prospect.news ? `Recent news / context:\n${args.prospect.news.slice(0, 1600)}` : '',
        ``,
      ].filter(Boolean).join('\n')
    : '';

  const prompt = [
    `You are tailoring the visible text on an internal employee page for ${args.prospect?.name ?? 'the company'}.`,
    `REPLACE each generic text block so the page reads like real internal comms — written by this company's communications team, for this company's employees.`,
    ``,
    briefBlock,
    `Tone: ${tone}.`,
    ``,
    `Rules for every rewrite:`,
    `1. Name real things from the brief above wherever natural — products, programs, initiatives, leaders. Don't stay generic.`,
    `2. Use language that matches the audience and industry (insurance: "policyholders" / "advisors"; manufacturing: "plant" / "shift" / "line"; healthcare: "clinicians" / "patients"; tech: "engineers" / "shipping").`,
    `3. Keep each rewrite reasonably close to the original length so it fits the layout — but flex when it helps. Headings stay short (under ~10 words). CTAs stay short. Body paragraphs can grow or shrink up to ~40%.`,
    `4. Same language as the original (English in, English out — don't translate).`,
    `5. Plain text only — no HTML, markdown, or quote characters. The surrounding HTML keeps the formatting.`,
    `6. Do NOT leave a block "unchanged because it's already generic" — generic is exactly what we're replacing.`,
    `7. Preserve any integration / product / proper-noun names that ALREADY appear in the original ("Paycom", "Workday", "MyChoice") — they're real references, not placeholders.`,
    ``,
    `Text blocks (JSON — context is the surrounding HTML tag):`,
    JSON.stringify(args.nodes.map((n) => ({ id: n.id, context: n.context, text: n.text }))),
    ``,
    `Respond with ONLY a JSON object — no prose, no markdown fences:`,
    `{"rewrites":[{"id":0,"newText":"..."},{"id":1,"newText":"..."}, ...]}`,
  ].join('\n');

  const response = await callGeminiProxy<GeminiResponse>(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    },
    'gemini-2.5-flash',
    { apiToken, apiDomain },
  );
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = JSON.parse(stripJsonFences(text)) as { rewrites?: Array<{ id?: number; newText?: string }> };
  const rewrites = Array.isArray(parsed.rewrites) ? parsed.rewrites : [];

  const map = new Map<number, string>();
  for (const r of rewrites) {
    if (typeof r.id === 'number' && typeof r.newText === 'string' && r.newText.trim().length > 0) {
      map.set(r.id, r.newText);
    }
  }
  return map;
};

/* ── Step 4: apply rewrites back into the HTML ────────────────────────────── */

/**
 * Re-parse the HTML, walk it the same way as `extractEditableTextNodes`,
 * and replace text-node content for any id in the rewrites map. The walk
 * order is deterministic, so the same id always maps to the same node.
 * Returns the serialized HTML (root.innerHTML).
 */
export const applyTextRewrites = (
  html: string,
  rewrites: Map<number, string>,
): { rewrittenHtml: string; entries: RewriteEntry[] } => {
  const { doc } = extractEditableTextNodes(html);
  const root = doc.getElementById('__replify_root');
  if (!root) return { rewrittenHtml: html, entries: [] };

  const entries: RewriteEntry[] = [];
  let nextId = 0;

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName)) return;
      if (el.hasAttribute && el.hasAttribute('data-widget-type')) return;
      Array.from(node.childNodes).forEach(walk);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? '';
      const trimmed = text.trim();
      if (!trimmed) return;
      if (TEMPLATE_VAR_RE.test(text)) return;
      const id = nextId++;
      const newText = rewrites.get(id);
      if (newText && newText !== trimmed) {
        // Preserve leading/trailing whitespace from the original node
        // so we don't accidentally collapse surrounding inline spacing.
        const leading = text.match(/^\s*/)?.[0] ?? '';
        const trailing = text.match(/\s*$/)?.[0] ?? '';
        node.nodeValue = `${leading}${newText}${trailing}`;
        entries.push({
          id,
          oldText: trimmed,
          newText,
          context: (node.parentElement?.tagName || 'span').toLowerCase(),
        });
      }
    }
  };
  Array.from(root.childNodes).forEach(walk);

  return { rewrittenHtml: root.innerHTML, entries };
};

/* ── Step 5: one-shot diff pipeline ───────────────────────────────────────── */

/**
 * For each selected page: GET it, extract en_US text nodes, send to
 * Gemini, build the rewrite + diff. Does NOT write anything. The
 * caller (EditPagesForm) renders the diffs and lets the user pick which
 * pages to commit.
 */
export const buildEditDiffsForPages = async (
  args: {
    pageIds: string[];
    prospect?: { name?: string; news?: string };
    /** Structured brief from buildProspectBrief — when supplied, makes
     *  Gemini ground rewrites in real product/initiative/leadership names. */
    brief?: ProspectBrief;
    tone?: 'professional' | 'friendly' | 'executive';
  },
  ctx: OperationContext,
): Promise<PageEditDiff[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const out: PageEditDiff[] = [];

  for (const pageId of args.pageIds) {
    try {
      onProgress?.(`📄 Loading page ${pageId}…`);
      const url = buildApiUrl(`/api/pages/${pageId}`, apiDomain);
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${apiToken}` },
        credentials: 'omit',
      });
      if (!res.ok) {
        onProgress?.(`❌ GET /pages/${pageId} → ${res.status}`);
        continue;
      }
      const page = (await res.json()) as { contents?: Record<string, { title?: string; content?: string }> };
      const contents = page.contents ?? {};
      const enHtml = contents.en_US?.content;
      const pageTitle = contents.en_US?.title ?? '(untitled)';
      if (!enHtml) {
        onProgress?.(`⏭️  ${pageId} has no en_US content — skipping.`);
        continue;
      }

      const { nodes } = extractEditableTextNodes(enHtml);
      if (nodes.length === 0) {
        onProgress?.(`⏭️  ${pageId} has no editable text — skipping.`);
        continue;
      }

      const rewrites = await rewriteTextNodesViaGemini(
        { nodes, prospect: args.prospect, brief: args.brief, tone: args.tone },
        ctx,
      );
      const { rewrittenHtml, entries } = applyTextRewrites(enHtml, rewrites);
      out.push({
        pageId,
        pageTitle,
        locale: 'en_US',
        entries,
        rewrittenHtml,
        originalContents: contents,
      });
      onProgress?.(`✅ ${pageTitle}: ${entries.length} change(s) proposed.`);
    } catch (err) {
      onProgress?.(`❌ ${pageId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return out;
};

/* ── Step 6: apply approved diffs ─────────────────────────────────────────── */

/**
 * PUT each approved page. Pages API PUT is full-replace, so we
 * round-trip the entire `contents` object — only the en_US `content`
 * field is mutated; titles + other locales come back verbatim from the
 * diff's `originalContents` snapshot.
 */
export const applyApprovedPageEdits = async (
  args: { diffs: PageEditDiff[] },
  ctx: OperationContext,
): Promise<ApplyReport> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const report: ApplyReport = { pagesApplied: 0, pagesFailed: 0, errors: [] };

  for (const diff of args.diffs) {
    try {
      const newContents: Record<string, { title?: string; content?: string }> = {};
      for (const [locale, c] of Object.entries(diff.originalContents)) {
        if (locale === diff.locale) {
          newContents[locale] = { ...c, title: c.title ?? '', content: diff.rewrittenHtml };
        } else {
          newContents[locale] = { ...c, title: c.title ?? '', content: c.content ?? '' };
        }
      }

      const url = buildApiUrl(`/api/pages/${diff.pageId}`, apiDomain);
      const res = await fetch(url, {
        method: 'PUT',
        credentials: 'omit',
        headers: {
          Authorization: `Basic ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contents: newContents }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        const msg = `PUT /pages/${diff.pageId} -> ${res.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`;
        report.pagesFailed += 1;
        report.errors.push(msg);
        onProgress?.(`❌ ${diff.pageTitle}: ${msg}`);
        continue;
      }
      report.pagesApplied += 1;
      onProgress?.(`✏️  ${diff.pageTitle}: ${diff.entries.length} change(s) saved.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.pagesFailed += 1;
      report.errors.push(`${diff.pageId}: ${msg}`);
    }
  }

  return report;
};
