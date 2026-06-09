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
