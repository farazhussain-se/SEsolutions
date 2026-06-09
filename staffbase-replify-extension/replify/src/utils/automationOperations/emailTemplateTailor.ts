/**
 * Email template tailor — Gemini rewrites the visible text inside
 * Staffbase Email designer templates while preserving every other piece
 * of the design (colors, images, layout, social-icon configs, etc.).
 *
 * Staffbase Email API (undocumented at developers.staffbase.com — these
 * endpoints were reverse-engineered from Replify's existing
 * setupOperations/emailTemplates.ts and CopierForm.tsx):
 *
 *   GET    /api/email-service/galleries?limit=N
 *   GET    /api/email-service/templates?limit=N&galleryId=…
 *   GET    /api/email-service/templates/{id}/contents/pikasso
 *   PUT    /api/email-service/templates/{id}/contents/pikasso
 *
 * Content schema ("pikasso"):
 *   {
 *     blocks: [
 *       {
 *         title: "<random id or section label>",  ← NOT editable
 *         content: {
 *           columns: [
 *             {
 *               columnItems: [
 *                 {
 *                   content: {
 *                     textMarkupValue: "<p style=...>…actual visible text…</p>",  ← THIS
 *                     // other fields: src, href, alt, aspectRatio, mediumId, etc — NOT touched
 *                   }
 *                 }
 *               ]
 *             }
 *           ]
 *         }
 *       }
 *     ]
 *   }
 *
 * Strategy:
 *   1. List templates in the tenant's galleries (discoverEmailTemplates).
 *   2. For each picked template: GET its pikasso tree, walk it to find
 *      every `textMarkupValue` string, then run the same
 *      extractEditableTextNodes / applyTextRewrites helpers used by the
 *      Pages flow against each fragment.
 *   3. Send all text-nodes-across-all-fragments to Gemini in ONE batch
 *      per template (or per N templates — we batch per-template to keep
 *      prompt size manageable). Gemini returns rewrites keyed by a
 *      stable id; we splice them back fragment-by-fragment.
 *   4. PUT the modified pikasso tree back. Other top-level fields
 *      (imgSrcs, thumbnailUrl, title) come back verbatim.
 *
 * Auth + LLM: same as the rest of Replify — Basic auth, credentials:'omit',
 * callGeminiProxy for the rewrite step.
 */

import { buildApiUrl, stripJsonFences } from '../helpers';
import callGeminiProxy from '../geminiProxy';
import { extractEditableTextNodes, applyTextRewrites } from './pageTextEditor';
import type { OperationContext } from './types';
import type { ProspectBrief } from '../aiUtils';

/* ── Shapes ───────────────────────────────────────────────────────────────── */

export interface EmailGallery {
  id: string;
  name: string;
}

export interface EmailTemplateSummary {
  id: string;
  name: string;
  galleryId: string;
  galleryName: string;
  /** Pre-computed count of `textMarkupValue` fragments — drives the
   *  "N text blocks" badge in the form. */
  textFragmentCount: number;
}

/** A single `textMarkupValue` location inside a pikasso tree. */
interface FragmentLocation {
  /** JSON path used internally to splice the rewrite back in. */
  path: Array<string | number>;
  /** Original HTML fragment value at that path. */
  html: string;
}

export interface EmailEditEntry {
  /** Sequential id across all text nodes in all fragments of a single template. */
  id: number;
  /** Which textMarkupValue fragment this node came from. */
  fragmentIndex: number;
  /** Local id within that fragment (matches extractEditableTextNodes output). */
  nodeId: number;
  oldText: string;
  newText: string;
  context: string;
}

export interface EmailTemplateDiff {
  templateId: string;
  templateName: string;
  galleryName: string;
  entries: EmailEditEntry[];
  /** New pikasso tree with all rewrites applied — ready to PUT. */
  rewrittenContent: Record<string, unknown>;
  /** Pristine original content kept for safety / debugging. */
  originalContent: Record<string, unknown>;
}

export interface EmailApplyReport {
  templatesApplied: number;
  templatesFailed: number;
  errors: string[];
}

/* ── Step 1: list templates in tenant ─────────────────────────────────────── */

/**
 * List every email template the tenant has across all galleries. Each
 * entry comes pre-counted with the number of editable text fragments
 * so the form can render "N text blocks" badges without a second fetch.
 */
export const discoverEmailTemplates = async (
  ctx: OperationContext,
): Promise<EmailTemplateSummary[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;

  // 1. List galleries
  const galleriesUrl = buildApiUrl('/api/email-service/galleries?limit=100', apiDomain);
  const galleriesRes = await fetch(galleriesUrl, {
    headers: { Authorization: `Basic ${apiToken}` },
    credentials: 'omit',
  });
  if (!galleriesRes.ok) {
    throw new Error(`GET /email-service/galleries -> ${galleriesRes.status}`);
  }
  const galleriesJson = (await galleriesRes.json()) as { data?: EmailGallery[] };
  const galleries = Array.isArray(galleriesJson.data) ? galleriesJson.data : [];
  if (galleries.length === 0) {
    onProgress?.('⚠️ No email galleries found — install email templates via Set Up first.');
    return [];
  }

  // 2. For each gallery, list its templates
  const out: EmailTemplateSummary[] = [];
  for (const g of galleries) {
    const tplUrl = buildApiUrl(`/api/email-service/templates?limit=100&galleryId=${g.id}`, apiDomain);
    const tplRes = await fetch(tplUrl, {
      headers: { Authorization: `Basic ${apiToken}` },
      credentials: 'omit',
    });
    if (!tplRes.ok) continue;
    const tplJson = (await tplRes.json()) as { data?: Array<{ id: string; name: string }> };
    const templates = Array.isArray(tplJson.data) ? tplJson.data : [];

    // 3. For each template, fetch its content + count fragments
    for (const t of templates) {
      try {
        const contentUrl = buildApiUrl(`/api/email-service/templates/${t.id}/contents/pikasso`, apiDomain);
        const contentRes = await fetch(contentUrl, {
          headers: { Authorization: `Basic ${apiToken}` },
          credentials: 'omit',
        });
        if (!contentRes.ok) {
          // Some templates might be empty / unconfigured. Still list them with 0 fragments.
          out.push({ id: t.id, name: t.name, galleryId: g.id, galleryName: g.name, textFragmentCount: 0 });
          continue;
        }
        const wrapper = (await contentRes.json()) as { content?: Record<string, unknown> };
        const tree = wrapper.content ?? wrapper;
        const fragments = findTextMarkupFragments(tree);
        out.push({
          id: t.id,
          name: t.name,
          galleryId: g.id,
          galleryName: g.name,
          textFragmentCount: fragments.length,
        });
      } catch {
        out.push({ id: t.id, name: t.name, galleryId: g.id, galleryName: g.name, textFragmentCount: 0 });
      }
    }
  }

  onProgress?.(`📨 Found ${out.length} template(s) across ${galleries.length} gallery/galleries.`);
  return out.sort((a, b) => b.textFragmentCount - a.textFragmentCount);
};

/* ── Step 2: pikasso tree walker ──────────────────────────────────────────── */

/**
 * Walk a pikasso JSON tree and collect every `textMarkupValue` field
 * with its location in the tree. Used for both extraction (during
 * rewrite planning) and patching (when applying rewrites back).
 *
 * Path entries are strings (object keys) or numbers (array indices).
 * That format is reused by `setAtPath` below to splice rewrites in.
 */
const findTextMarkupFragments = (node: unknown, path: Array<string | number> = []): FragmentLocation[] => {
  if (node === null || node === undefined) return [];
  if (Array.isArray(node)) {
    const out: FragmentLocation[] = [];
    for (let i = 0; i < node.length; i += 1) {
      out.push(...findTextMarkupFragments(node[i], [...path, i]));
    }
    return out;
  }
  if (typeof node === 'object') {
    const out: FragmentLocation[] = [];
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'textMarkupValue' && typeof v === 'string') {
        out.push({ path: [...path, k], html: v });
      } else {
        out.push(...findTextMarkupFragments(v, [...path, k]));
      }
    }
    return out;
  }
  return [];
};

/** Mutate `tree` so the leaf at `path` becomes `value`. Returns the same tree (mutation in place). */
const setAtPath = (tree: unknown, path: Array<string | number>, value: unknown): void => {
  if (path.length === 0) return;
  let cursor: unknown = tree;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (cursor === null || typeof cursor !== 'object') return;
    cursor = (cursor as Record<string | number, unknown>)[key as string | number];
  }
  if (cursor === null || typeof cursor !== 'object') return;
  (cursor as Record<string | number, unknown>)[path[path.length - 1] as string | number] = value;
};

/* ── Step 3: Gemini rewrite ───────────────────────────────────────────────── */

type Tone = 'professional' | 'friendly' | 'executive';

interface FlatTextNode {
  /** Global id across the whole template — Gemini echoes this back. */
  id: number;
  /** Which fragment this node lives in. */
  fragmentIndex: number;
  /** Local id within that fragment (matches extractEditableTextNodes). */
  nodeId: number;
  text: string;
  context: string;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Single Gemini call per template — REPLACE the generic template text
 * with content that sounds like it was written FROM the prospect's
 * leadership/comms team TO the prospect's employees.
 *
 * Key prompt design decisions (V2):
 *   - The structured `brief` (from buildProspectBrief) takes precedence
 *     over the raw news blob. Gemini gets crisp signals — real product
 *     names, real leaders, real initiatives — instead of having to
 *     forage in a news summary.
 *   - The "if already generic enough, keep unchanged" rule from V1 was
 *     producing timid rewrites. V2 instructs Gemini to rebrand EVERY
 *     block — generic blocks are the ones that most need the rewrite.
 *   - Length is a soft constraint ("stay close enough to fit the
 *     layout") not a hard cap. Headings stay headings, CTAs stay CTA-
 *     short, body paragraphs can flex.
 *   - Explicit instruction to name-drop real products / programs /
 *     leadership where natural.
 */
const rewriteTemplateTextViaGemini = async (
  args: {
    templateName: string;
    nodes: FlatTextNode[];
    prospect?: { name?: string; news?: string };
    brief?: ProspectBrief;
    tone?: Tone;
  },
  ctx: OperationContext,
): Promise<Map<number, string>> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  if (args.nodes.length === 0) return new Map();

  const tone = args.tone ?? 'professional';
  onProgress?.(`🤖 Gemini rewriting ${args.nodes.length} text block(s) in "${args.templateName}" (${tone})…`);

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
    `You are writing internal employee communications FOR ${args.prospect?.name ?? 'the company'}.`,
    `The text blocks below come from a generic email template named "${args.templateName}".`,
    `Your job: REPLACE the generic content so each block reads like real internal comms — written by this company's communications team, for this company's employees.`,
    ``,
    briefBlock,
    `Tone: ${tone}.`,
    ``,
    `Rules for every rewrite:`,
    `1. Name real things from the brief above wherever natural — products, programs, initiatives, leaders. Don't stay generic.`,
    `2. Use language that matches the audience and industry (e.g. insurance: "policyholders" / "advisors"; manufacturing: "plant" / "shift" / "line"; healthcare: "clinicians" / "patients"; tech: "engineers" / "shipping"). The audience field above is your guide.`,
    `3. Keep each rewrite reasonably close to the original length so it fits the layout — but flex when needed. Headings stay headings (under ~10 words). CTAs stay short (3-5 words). Body paragraphs can grow or shrink by ~40% if it sounds better.`,
    `4. Same language as the original (English in, English out — don't translate).`,
    `5. Plain text only — no HTML, no markdown, no quote characters. The surrounding HTML wrapper preserves formatting.`,
    `6. Each block is one piece of a larger email. Don't add "Dear [Name]" greetings or "Best regards" sign-offs unless the original block was already a greeting/signoff.`,
    `7. Do NOT leave a block "unchanged because it's already generic" — generic is precisely what we're replacing. Every block should come back with prospect-specific energy.`,
    `8. If a block is a template variable like {{user.profile.firstName}} you would not see it here (those are pre-filtered). If you somehow do see one, return it unchanged.`,
    ``,
    `Text blocks (JSON — context is the surrounding HTML tag for clue about role):`,
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

/* ── Step 4: build per-template diffs ─────────────────────────────────────── */

/**
 * For each picked template: fetch its pikasso tree, walk for
 * textMarkupValue fragments, parse each fragment's HTML into text nodes
 * (reusing the Pages text walker), batch them all to Gemini in one
 * call, then splice rewrites back into each fragment's HTML and into
 * the tree.
 *
 * Does NOT write anything — returns diffs for the form to render.
 */
export const buildEmailTemplateDiffs = async (
  args: {
    templates: EmailTemplateSummary[];
    prospect?: { name?: string; news?: string };
    /** Structured brief from buildProspectBrief — drives aggressive,
     *  prospect-specific rewrites. When omitted, falls back to raw news. */
    brief?: ProspectBrief;
    tone?: Tone;
  },
  ctx: OperationContext,
): Promise<EmailTemplateDiff[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const out: EmailTemplateDiff[] = [];

  for (const tpl of args.templates) {
    try {
      onProgress?.(`📨 Loading "${tpl.name}"…`);
      const contentUrl = buildApiUrl(`/api/email-service/templates/${tpl.id}/contents/pikasso`, apiDomain);
      const res = await fetch(contentUrl, {
        headers: { Authorization: `Basic ${apiToken}` },
        credentials: 'omit',
      });
      if (!res.ok) {
        onProgress?.(`❌ GET ${tpl.name} → ${res.status}`);
        continue;
      }
      const wrapper = (await res.json()) as { content?: Record<string, unknown> } & Record<string, unknown>;
      // Some shapes wrap the tree in {content:{...}}, others return the tree directly.
      // Detect by checking if `content` looks like a wrapped pikasso tree (has `.content.blocks`).
      const originalContent: Record<string, unknown> =
        wrapper.content && typeof wrapper.content === 'object'
          ? (wrapper.content as Record<string, unknown>)
          : wrapper;

      // Deep clone so we can mutate freely without losing the original.
      const workingTree = JSON.parse(JSON.stringify(originalContent)) as Record<string, unknown>;
      const fragments = findTextMarkupFragments(workingTree);
      if (fragments.length === 0) {
        onProgress?.(`⏭️  ${tpl.name}: no editable fragments — skipping.`);
        continue;
      }

      // Extract text nodes from each fragment, building a flat node list
      // with global ids + fragment refs so we can splice back later.
      const flatNodes: FlatTextNode[] = [];
      const perFragmentNodes: Array<Array<{ localId: number; text: string }>> = [];
      let globalId = 0;
      for (let fIdx = 0; fIdx < fragments.length; fIdx += 1) {
        const { nodes } = extractEditableTextNodes(fragments[fIdx].html);
        const local: Array<{ localId: number; text: string }> = [];
        for (const n of nodes) {
          flatNodes.push({
            id: globalId,
            fragmentIndex: fIdx,
            nodeId: n.id,
            text: n.text,
            context: n.context,
          });
          local.push({ localId: n.id, text: n.text });
          globalId += 1;
        }
        perFragmentNodes.push(local);
      }

      if (flatNodes.length === 0) {
        onProgress?.(`⏭️  ${tpl.name}: no editable text after walking.`);
        continue;
      }

      // One Gemini call per template — keeps prompts manageable.
      const rewrites = await rewriteTemplateTextViaGemini(
        { templateName: tpl.name, nodes: flatNodes, prospect: args.prospect, brief: args.brief, tone: args.tone },
        ctx,
      );

      // Splice rewrites back into each fragment + collect entries for the diff UI.
      const entries: EmailEditEntry[] = [];
      for (let fIdx = 0; fIdx < fragments.length; fIdx += 1) {
        // Re-key globalId → localId for this fragment.
        const fragmentRewrites = new Map<number, string>();
        for (const node of flatNodes) {
          if (node.fragmentIndex !== fIdx) continue;
          const newText = rewrites.get(node.id);
          if (newText !== undefined) fragmentRewrites.set(node.nodeId, newText);
        }
        const { rewrittenHtml, entries: fragmentEntries } = applyTextRewrites(
          fragments[fIdx].html,
          fragmentRewrites,
        );
        // Push entries with the global id for the form's display.
        for (const e of fragmentEntries) {
          const globalNode = flatNodes.find((n) => n.fragmentIndex === fIdx && n.nodeId === e.id);
          entries.push({
            id: globalNode?.id ?? -1,
            fragmentIndex: fIdx,
            nodeId: e.id,
            oldText: e.oldText,
            newText: e.newText,
            context: e.context,
          });
        }
        // Mutate the working tree in place at the fragment's path.
        setAtPath(workingTree, fragments[fIdx].path, rewrittenHtml);
      }

      out.push({
        templateId: tpl.id,
        templateName: tpl.name,
        galleryName: tpl.galleryName,
        entries,
        rewrittenContent: workingTree,
        originalContent,
      });
      onProgress?.(`✅ ${tpl.name}: ${entries.length} change(s) proposed.`);
    } catch (err) {
      onProgress?.(`❌ ${tpl.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return out;
};

/* ── Step 5: apply approved diffs ─────────────────────────────────────────── */

/**
 * PUT each approved template's content back. The PUT endpoint sets ONLY
 * the pikasso content — template metadata (name, thumbnailUrl, gallery
 * binding) is untouched. Wrap the body as { content: <tree> } to match
 * the same shape the existing emailTemplates.ts seeder uses.
 */
export const applyApprovedEmailTemplateEdits = async (
  args: { diffs: EmailTemplateDiff[] },
  ctx: OperationContext,
): Promise<EmailApplyReport> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const report: EmailApplyReport = { templatesApplied: 0, templatesFailed: 0, errors: [] };

  for (const diff of args.diffs) {
    try {
      const url = buildApiUrl(`/api/email-service/templates/${diff.templateId}/contents/pikasso`, apiDomain);
      const res = await fetch(url, {
        method: 'PUT',
        credentials: 'omit',
        headers: {
          Authorization: `Basic ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: diff.rewrittenContent }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        const msg = `PUT ${diff.templateName} -> ${res.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`;
        report.templatesFailed += 1;
        report.errors.push(msg);
        onProgress?.(`❌ ${msg}`);
        continue;
      }
      report.templatesApplied += 1;
      onProgress?.(`✏️  ${diff.templateName}: ${diff.entries.length} change(s) saved.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.templatesFailed += 1;
      report.errors.push(`${diff.templateId}: ${msg}`);
    }
  }

  return report;
};

/* ══════════════════════════════════════════════════════════════════════════
 * V2 ACTIONS
 * ──────────────────────────────────────────────────────────────────────────
 * The flows below extend the in-place edit path with two new actions:
 *
 *   - cloneTranslatedTemplates: for each source template, create a NEW
 *     template in the target locale with Gemini-translated text.
 *     Original templates stay untouched. Result: side-by-side English +
 *     French (or other) versions in the same gallery.
 *
 *   - createDraftsFromTemplates: for each source template, create a
 *     ready-to-preview email DRAFT (in a folder) with prospect-tailored
 *     content. The draft uses the email-service's email surface, which
 *     has a slightly different body shape than templates — `contents`
 *     (plural, locale-keyed) instead of `content` (singular).
 *
 * Both reuse the existing pikasso walker (findTextMarkupFragments,
 * extractEditableTextNodes, applyTextRewrites) + the Gemini text-rewrite
 * step. The new things are: (a) creating the destination resource via
 * POST, (b) translation-aware prompt variant, and (c) the email-side
 * body shape.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── Helper: translation-aware Gemini prompt ──────────────────────────────── */

/**
 * Same shape as rewriteTemplateTextViaGemini but translates each text
 * block to `targetLocale`. The brief is still passed so the translation
 * doesn't read as textbook — it sounds native to the prospect's voice
 * in the target language (e.g. "nos conseillers" for an insurer in
 * French, not "our advisors").
 *
 * `targetLocale` is the standard Staffbase locale code: en_US, de_DE,
 * fr_FR, es_ES, etc. Gemini's instruction names the human language
 * (French, German, etc.) — the locale code is just a routing key.
 */
const translateTemplateTextViaGemini = async (
  args: {
    templateName: string;
    nodes: FlatTextNode[];
    targetLocale: string;
    prospect?: { name?: string; news?: string };
    brief?: ProspectBrief;
  },
  ctx: OperationContext,
): Promise<Map<number, string>> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  if (args.nodes.length === 0) return new Map();

  // Map locale code → human-readable language for the prompt.
  // Falls back to the code itself so unknown locales still work.
  const languageNames: Record<string, string> = {
    en_US: 'American English', en_GB: 'British English',
    de_DE: 'German', fr_FR: 'French', fr_CA: 'Canadian French',
    es_ES: 'Spanish (Spain)', es_MX: 'Mexican Spanish',
    it_IT: 'Italian', pt_BR: 'Brazilian Portuguese', pt_PT: 'Portuguese',
    nl_NL: 'Dutch', sv_SE: 'Swedish', da_DK: 'Danish', no_NO: 'Norwegian',
    fi_FI: 'Finnish', pl_PL: 'Polish', cs_CZ: 'Czech',
    ja_JP: 'Japanese', zh_CN: 'Simplified Chinese', zh_TW: 'Traditional Chinese',
  };
  const targetLanguage = languageNames[args.targetLocale] || args.targetLocale;

  onProgress?.(
    `🌐 Gemini translating ${args.nodes.length} text block(s) in "${args.templateName}" → ${targetLanguage}…`,
  );

  const briefBlock = args.brief
    ? [
        `About ${args.prospect?.name ?? 'the company'} — use these to make the translation sound NATIVE, not literal:`,
        `  Industry:    ${args.brief.industry}`,
        `  Audience:    ${args.brief.audience}`,
        `  Voice:       ${args.brief.voice}`,
        `  Products:    ${args.brief.products.join(', ') || '(none)'}`,
        `  Leadership:  ${args.brief.leadership.join(' · ') || '(none)'}`,
        ``,
        `  Summary: ${args.brief.oneLiner}`,
        ``,
      ].join('\n')
    : '';

  const prompt = [
    `You are translating an internal employee email template into ${targetLanguage}.`,
    `The translation must sound like it was written natively by ${args.prospect?.name ?? 'the company'}'s comms team for their ${targetLanguage}-speaking employees — not like a machine translation.`,
    ``,
    briefBlock,
    `Rules:`,
    `1. Translate to ${targetLanguage}. Idiomatic, not literal.`,
    `2. Use ${targetLanguage} terminology the audience actually uses (insurance: "polices" / "conseillers" in French; manufacturing: "atelier" / "équipe"; etc.). Match the industry and audience in the brief above.`,
    `3. Keep length reasonably close to the original so the layout still fits. Headings stay short. CTAs stay short.`,
    `4. Don't add HTML, markdown, or quote characters — plain text only.`,
    `5. Preserve product / integration / proper-noun names that don't translate (e.g. "MyChoice", "Workday", real leadership names).`,
    `6. If a block looks like a placeholder ({{...}}) you would not see it — they're pre-filtered.`,
    ``,
    `Text blocks to translate (JSON):`,
    JSON.stringify(args.nodes.map((n) => ({ id: n.id, context: n.context, text: n.text }))),
    ``,
    `Respond with ONLY a JSON object — no prose, no fences:`,
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

/* ── Shared helper: walk template tree → rewrite text → return new tree ──── */

/**
 * Generic "rewrite the text in this pikasso tree" loop, shared by both
 * the translate and draft flows. Returns the new tree + the diff entries
 * (for UI display) + skips templates that have nothing to rewrite.
 */
const walkAndRewriteTree = async (
  originalContent: Record<string, unknown>,
  rewriter: (nodes: FlatTextNode[]) => Promise<Map<number, string>>,
): Promise<{ rewrittenContent: Record<string, unknown>; entries: EmailEditEntry[] }> => {
  const workingTree = JSON.parse(JSON.stringify(originalContent)) as Record<string, unknown>;
  const fragments = findTextMarkupFragments(workingTree);
  if (fragments.length === 0) return { rewrittenContent: workingTree, entries: [] };

  const flatNodes: FlatTextNode[] = [];
  let globalId = 0;
  for (let fIdx = 0; fIdx < fragments.length; fIdx += 1) {
    const { nodes } = extractEditableTextNodes(fragments[fIdx].html);
    for (const n of nodes) {
      flatNodes.push({ id: globalId, fragmentIndex: fIdx, nodeId: n.id, text: n.text, context: n.context });
      globalId += 1;
    }
  }
  if (flatNodes.length === 0) return { rewrittenContent: workingTree, entries: [] };

  const rewrites = await rewriter(flatNodes);
  const entries: EmailEditEntry[] = [];

  for (let fIdx = 0; fIdx < fragments.length; fIdx += 1) {
    const fragmentRewrites = new Map<number, string>();
    for (const node of flatNodes) {
      if (node.fragmentIndex !== fIdx) continue;
      const newText = rewrites.get(node.id);
      if (newText !== undefined) fragmentRewrites.set(node.nodeId, newText);
    }
    const { rewrittenHtml, entries: fragmentEntries } = applyTextRewrites(
      fragments[fIdx].html,
      fragmentRewrites,
    );
    for (const e of fragmentEntries) {
      const globalNode = flatNodes.find((n) => n.fragmentIndex === fIdx && n.nodeId === e.id);
      entries.push({
        id: globalNode?.id ?? -1,
        fragmentIndex: fIdx,
        nodeId: e.id,
        oldText: e.oldText,
        newText: e.newText,
        context: e.context,
      });
    }
    setAtPath(workingTree, fragments[fIdx].path, rewrittenHtml);
  }

  return { rewrittenContent: workingTree, entries };
};

/* ── Action B: clone-and-translate templates ──────────────────────────────── */

export interface TranslatedTemplateReport {
  sourceTemplateId: string;
  sourceTemplateName: string;
  newTemplateId: string | null;
  newTemplateName: string;
  targetLocale: string;
  changeCount: number;
  error: string | null;
}

/**
 * For each source template: create a NEW template in the same gallery
 * with the suffix " — <Locale>", translate every textMarkupValue
 * fragment, then PUT the translated tree.
 *
 * Original template is left untouched — this is purely additive. The
 * naming convention (suffix " — French") makes the translated set
 * discoverable in Studio's gallery list.
 */
export const cloneTranslatedTemplates = async (
  args: {
    sources: EmailTemplateSummary[];
    targetLocale: string;
    prospect?: { name?: string; news?: string };
    brief?: ProspectBrief;
  },
  ctx: OperationContext,
): Promise<TranslatedTemplateReport[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const reports: TranslatedTemplateReport[] = [];

  // Human-friendly suffix for the new template name. Falls back to the
  // raw locale code if we don't have a friendly name for it.
  const localeSuffixes: Record<string, string> = {
    en_US: 'English', en_GB: 'English (UK)',
    de_DE: 'German', fr_FR: 'French', fr_CA: 'French (Canada)',
    es_ES: 'Spanish', es_MX: 'Spanish (Mexico)',
    it_IT: 'Italian', pt_BR: 'Portuguese (Brazil)', pt_PT: 'Portuguese',
    nl_NL: 'Dutch', sv_SE: 'Swedish', da_DK: 'Danish', no_NO: 'Norwegian',
    pl_PL: 'Polish', ja_JP: 'Japanese', zh_CN: '简体中文', zh_TW: '繁體中文',
  };
  const suffix = localeSuffixes[args.targetLocale] || args.targetLocale;

  for (const src of args.sources) {
    const report: TranslatedTemplateReport = {
      sourceTemplateId: src.id,
      sourceTemplateName: src.name,
      newTemplateId: null,
      newTemplateName: `${src.name} — ${suffix}`,
      targetLocale: args.targetLocale,
      changeCount: 0,
      error: null,
    };

    try {
      // 1. GET the original template's content
      onProgress?.(`📨 Loading "${src.name}"…`);
      const contentUrl = buildApiUrl(`/api/email-service/templates/${src.id}/contents/pikasso`, apiDomain);
      const contentRes = await fetch(contentUrl, {
        headers: { Authorization: `Basic ${apiToken}` },
        credentials: 'omit',
      });
      if (!contentRes.ok) throw new Error(`GET source content -> ${contentRes.status}`);
      const wrapper = (await contentRes.json()) as { content?: Record<string, unknown> } & Record<string, unknown>;
      const originalContent: Record<string, unknown> =
        wrapper.content && typeof wrapper.content === 'object'
          ? (wrapper.content as Record<string, unknown>)
          : wrapper;

      // 2. POST a new empty template in the same gallery
      const createRes = await fetch(buildApiUrl('/api/email-service/templates', apiDomain), {
        method: 'POST',
        credentials: 'omit',
        headers: { Authorization: `Basic ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          galleryId: src.galleryId,
          name: report.newTemplateName,
          renderingMode: 'designer',
        }),
      });
      if (!createRes.ok) {
        const txt = await createRes.text().catch(() => '');
        throw new Error(`POST /templates -> ${createRes.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`);
      }
      const newTemplate = (await createRes.json()) as { id: string };
      report.newTemplateId = newTemplate.id;
      onProgress?.(`➕ Created "${report.newTemplateName}" (${newTemplate.id})`);

      // 3. Walk + translate the pikasso tree
      const { rewrittenContent, entries } = await walkAndRewriteTree(originalContent, (nodes) =>
        translateTemplateTextViaGemini(
          {
            templateName: src.name,
            nodes,
            targetLocale: args.targetLocale,
            prospect: args.prospect,
            brief: args.brief,
          },
          ctx,
        ),
      );
      report.changeCount = entries.length;

      // 4. PUT the translated tree to the new template
      const putUrl = buildApiUrl(`/api/email-service/templates/${newTemplate.id}/contents/pikasso`, apiDomain);
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        credentials: 'omit',
        headers: { Authorization: `Basic ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: rewrittenContent }),
      });
      if (!putRes.ok) {
        const txt = await putRes.text().catch(() => '');
        throw new Error(`PUT new content -> ${putRes.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`);
      }
      onProgress?.(`✅ Translated "${src.name}" → "${report.newTemplateName}" (${entries.length} blocks).`);
    } catch (err) {
      report.error = err instanceof Error ? err.message : String(err);
      onProgress?.(`❌ ${src.name}: ${report.error}`);
    }

    reports.push(report);
  }

  return reports;
};

/* ── Action C: create-drafts-from-templates ──────────────────────────────── */

export interface CreatedDraftReport {
  sourceTemplateId: string;
  sourceTemplateName: string;
  newDraftId: string | null;
  newDraftTitle: string;
  folderId: string | null;
  changeCount: number;
  error: string | null;
}

/**
 * Discover (or create) a folder where Replify-generated email drafts live.
 *
 * Folders aren't enumerable directly — Staffbase's email-service exposes
 * a /folders/{id} GET but no /folders list endpoint. CopierForm.tsx
 * works around this by scanning draft emails for distinct folderIds and
 * fetching each to see its title. We use the same approach.
 *
 * If no matching folder exists, we POST a new one — needs spaceId +
 * adminUserId for sender configuration (same shape CopierForm uses).
 */
const discoverOrCreateDraftFolder = async (
  args: { folderName: string },
  ctx: OperationContext,
): Promise<string> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const headers = { Authorization: `Basic ${apiToken}` };

  // 1. Walk existing drafts to find an existing folder with this title.
  let cursor: string | null = null;
  let guard = 0;
  const seenFolderIds = new Set<string>();
  while (guard < 10) {
    const searchRes = await fetch(buildApiUrl('/api/email-service/emails/search', apiDomain), {
      method: 'POST',
      credentials: 'omit',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'draft', limit: 100, ...(cursor ? { next: cursor } : {}) }),
    });
    if (!searchRes.ok) break;
    const data = (await searchRes.json()) as { data?: Array<{ folderId?: string }>; next?: string };
    for (const email of data.data || []) {
      if (!email.folderId || seenFolderIds.has(email.folderId)) continue;
      seenFolderIds.add(email.folderId);
      const fRes = await fetch(buildApiUrl(`/api/email-service/folders/${email.folderId}`, apiDomain), {
        credentials: 'omit',
        headers,
      });
      if (!fRes.ok) continue;
      const folder = (await fRes.json()) as { id: string; title?: string };
      if (folder.title === args.folderName) {
        onProgress?.(`📁 Using existing folder "${args.folderName}" (${folder.id}).`);
        return folder.id;
      }
    }
    cursor = data.next ?? null;
    if (!cursor) break;
    guard += 1;
  }

  // 2. Create a new folder. Need a spaceId + admin user for sender config.
  const spacesRes = await fetch(buildApiUrl('/api/spaces', apiDomain), { credentials: 'omit', headers });
  if (!spacesRes.ok) throw new Error(`GET /spaces -> ${spacesRes.status}`);
  const spaces = (await spacesRes.json()) as { data?: Array<{ id: string }> };
  const spaceId = spaces.data?.[0]?.id;
  if (!spaceId) throw new Error('No space found to anchor the folder to.');

  const usersRes = await fetch(buildApiUrl('/api/users?limit=200', apiDomain), { credentials: 'omit', headers });
  if (!usersRes.ok) throw new Error(`GET /users -> ${usersRes.status}`);
  const users = (await usersRes.json()) as { data?: Array<{ id: string; branchRole?: string }> };
  const admin = users.data?.find((u) => u.branchRole === 'WeBranchAdminRole');
  if (!admin?.id) throw new Error('No admin user found for sender configuration.');

  const createRes = await fetch(buildApiUrl('/api/email-service/folders', apiDomain), {
    method: 'POST',
    credentials: 'omit',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spaceId,
      title: args.folderName,
      restrictSending: false,
      senderAddresses: [spaceId],
      senderNames: [admin.id],
      audience: { branchId: spaceId, type: 'branchAudience' },
      enableUnsubscriptionCategories: false,
    }),
  });
  if (!createRes.ok) {
    const txt = await createRes.text().catch(() => '');
    throw new Error(`POST /folders -> ${createRes.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`);
  }
  const created = (await createRes.json()) as { id: string };
  onProgress?.(`📁 Created folder "${args.folderName}" (${created.id}).`);
  return created.id;
};

/**
 * For each source template, create a ready-to-preview email DRAFT in the
 * given folder with prospect-tailored content. Uses the rewrite prompt
 * (same as in-place edit) — the difference is the destination resource
 * is a new email, not the source template.
 *
 * Email content body shape differs from templates:
 *   Templates: { content: <tree> }
 *   Emails:    { contents: { en_US: <tree> }, localesToDelete: [],
 *                personalizationFallbacks: {} }
 *
 * The `contents` field is locale-keyed (see CopierForm.tsx for the
 * empirical confirmation). V1 of this action writes only the en_US
 * locale; multi-locale drafts would need the same pattern across
 * languages.
 */
export const createDraftsFromTemplates = async (
  args: {
    sources: EmailTemplateSummary[];
    folderName?: string;
    locale?: string;
    prospect?: { name?: string; news?: string };
    brief?: ProspectBrief;
    tone?: Tone;
  },
  ctx: OperationContext,
): Promise<CreatedDraftReport[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const folderName = args.folderName?.trim() || 'Replify Drafts';
  const locale = args.locale || 'en_US';
  const reports: CreatedDraftReport[] = [];

  // Resolve folder once for all drafts in this batch.
  let folderId: string;
  try {
    folderId = await discoverOrCreateDraftFolder({ folderName }, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.(`❌ Folder setup failed: ${msg}`);
    // Return one error report per source so the UI still renders something useful.
    return args.sources.map((src) => ({
      sourceTemplateId: src.id,
      sourceTemplateName: src.name,
      newDraftId: null,
      newDraftTitle: `${src.name} (Draft)`,
      folderId: null,
      changeCount: 0,
      error: `folder: ${msg}`,
    }));
  }

  for (const src of args.sources) {
    const report: CreatedDraftReport = {
      sourceTemplateId: src.id,
      sourceTemplateName: src.name,
      newDraftId: null,
      newDraftTitle: `${src.name}${args.prospect?.name ? ` — ${args.prospect.name}` : ''}`,
      folderId,
      changeCount: 0,
      error: null,
    };

    try {
      // 1. GET source template content
      const contentUrl = buildApiUrl(`/api/email-service/templates/${src.id}/contents/pikasso`, apiDomain);
      const contentRes = await fetch(contentUrl, {
        headers: { Authorization: `Basic ${apiToken}` },
        credentials: 'omit',
      });
      if (!contentRes.ok) throw new Error(`GET source content -> ${contentRes.status}`);
      const wrapper = (await contentRes.json()) as { content?: Record<string, unknown> } & Record<string, unknown>;
      const originalContent: Record<string, unknown> =
        wrapper.content && typeof wrapper.content === 'object'
          ? (wrapper.content as Record<string, unknown>)
          : wrapper;

      // 2. Rewrite text via Gemini (using the same aggressive prompt as
      //    in-place edit — drafts are real comms, not translations).
      const { rewrittenContent, entries } = await walkAndRewriteTree(originalContent, (nodes) =>
        rewriteTemplateTextViaGemini(
          {
            templateName: src.name,
            nodes,
            prospect: args.prospect,
            brief: args.brief,
            tone: args.tone,
          },
          ctx,
        ),
      );
      report.changeCount = entries.length;

      // 3. POST a new draft email. The settings.subject becomes the
      //    email's subject line — we set a prospect-flavored default
      //    that the user can refine in Studio.
      const draftSubject = args.prospect?.name
        ? `${src.name} — ${args.prospect.name}`
        : src.name;
      const createRes = await fetch(buildApiUrl('/api/email-service/emails', apiDomain), {
        method: 'POST',
        credentials: 'omit',
        headers: { Authorization: `Basic ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: report.newDraftTitle,
          folderId,
          renderingMode: 'designer',
          settings: { subject: draftSubject },
        }),
      });
      if (!createRes.ok) {
        const txt = await createRes.text().catch(() => '');
        throw new Error(`POST /emails -> ${createRes.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`);
      }
      const draft = (await createRes.json()) as { id: string };
      report.newDraftId = draft.id;
      onProgress?.(`➕ Created draft "${report.newDraftTitle}" (${draft.id}).`);

      // 4. PUT pikasso content. Email contents are locale-keyed (plural
      //    `contents`); we set the chosen locale only. localesToDelete
      //    is empty since this is a brand-new draft.
      const putUrl = buildApiUrl(`/api/email-service/emails/${draft.id}/contents/pikasso`, apiDomain);
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        credentials: 'omit',
        headers: { Authorization: `Basic ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: { [locale]: rewrittenContent },
          localesToDelete: [],
          personalizationFallbacks: {},
        }),
      });
      if (!putRes.ok && putRes.status !== 204) {
        const txt = await putRes.text().catch(() => '');
        throw new Error(`PUT draft content -> ${putRes.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`);
      }
      onProgress?.(`✅ Draft "${report.newDraftTitle}" ready in folder "${folderName}" — ${entries.length} block(s) tailored.`);
    } catch (err) {
      report.error = err instanceof Error ? err.message : String(err);
      onProgress?.(`❌ ${src.name}: ${report.error}`);
    }

    reports.push(report);
  }

  return reports;
};

