/**
 * Personas & Groups operations.
 *
 * Bolt-in port of the staffbase-demo-group-tool Flask wizard. Reuses Replify's
 * existing auth surface (apiToken + apiDomain via OperationContext) and Gemini
 * proxy (callGeminiProxy) instead of the standalone tool's per-request
 * X-SB-Base / X-SB-Token + DDG search loop.
 *
 * Three stages:
 *   1. fetchPersonaCandidates  — pull activated users from the clone
 *   2. matchUsersToIndustry    — single Gemini call returns role assignments
 *                                {userId, roleType, position, department,
 *                                 managerOfUserId?} so we don't make a CEO
 *                                a nurse
 *   3. applyPersonas           — POST /api/users/{id} (basic fields) then PATCH
 *                                /api/users/{id} with v3 accessor headers for
 *                                system_manager
 *                                + POST /api/groups (create the 8 industry
 *                                groups) + POST /api/groups/{id}/users (RAW
 *                                JSON array body — required by Staffbase)
 *
 * v3 accessor header quirk (see PATCH_HEADERS_EXTRA in the Flask source):
 * /api/users/{id} silently ignores `profile.system_manager` unless both the
 * Accept and Content-Type headers are the v3 accessor MIME types. PATCH won't
 * work without them. POST /api/users/{id} (no v3 headers) is fine for
 * firstName/lastName/position/department.
 */

import { buildApiUrl, stripJsonFences } from '../helpers';
import callGeminiProxy from '../geminiProxy';
import { fetchProspectIntelligence } from '../aiUtils';
import { PERSONA_INDUSTRIES } from './industryTemplates';
import type { OperationContext } from './types';

/* ── v3 accessor headers — required for system_manager PATCH ──────────────── */
const V3_PATCH_HEADERS = {
  Accept: 'application/vnd.staffbase.accessors.user.v3+json',
  'Content-Type': 'application/vnd.staffbase.accessors.user-update.v1+json',
};

/* ── Shapes ───────────────────────────────────────────────────────────────── */

export interface PersonaCandidate {
  id: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  branchRole?: string;
  email?: string;
}

export type RoleType = 'comms' | 'corporate' | 'frontline';

export interface PersonaAssignment {
  userId: string;
  roleType: RoleType;
  /** Suggested job title to write back to the user. */
  position: string;
  /** Suggested department to write back to the user. */
  department: string;
  /** Optional userId of the manager assigned in this batch. */
  managerOfUserId?: string;
}

export interface ApplyPersonasReport {
  usersUpdated: number;
  usersFailed: number;
  managersSet: number;
  groupsCreated: number;
  groupsAssigned: number;
  errors: string[];
}

/**
 * Output of researchProspectForPersonas — what Gemini learned about the
 * company and how that maps onto Replify's persona pipeline.
 *
 * - inferredIndustryKey: best match from PERSONA_INDUSTRIES (e.g. "healthcare")
 *   so the user can sanity-check, or override.
 * - customGroups: 8 prospect-themed group [name, description] pairs. Replaces
 *   the static PERSONA_INDUSTRIES[industry].groups list when supplied to
 *   applyPersonas — gives the demo a "this company's intranet" feel.
 * - prospectNews: the raw news summary fetchProspectIntelligence returned,
 *   surfaced so the form can also display it and so the match-users prompt
 *   gets the same context.
 * - websiteUrl: returned by fetchProspectIntelligence (e.g. "stryker.com").
 *   Currently informational; future ops could use it for LinkedIn discovery.
 */
export interface ProspectResearchResult {
  prospectName: string;
  inferredIndustryKey: string;
  inferredIndustryLabel: string;
  customGroups: Array<[string, string]>;
  prospectNews: string;
  websiteUrl: string;
}

/* ── Step 1: fetch activated users ─────────────────────────────────────────── */

/**
 * Pull activated users from the tenant. Mirrors the Flask tool's
 * GET /users?status=activated&limit=100 call.
 */
export const fetchPersonaCandidates = async (
  args: { limit?: number; excludeAdmins?: boolean },
  ctx: OperationContext,
): Promise<PersonaCandidate[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  const limit = args.limit ?? 100;
  const url = buildApiUrl(`/api/users?status=activated&limit=${limit}`, apiDomain);

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${apiToken}` },
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Fetch users failed: ${res.status}`);
  const json = (await res.json()) as { data?: unknown[] };
  const raw = Array.isArray(json.data) ? json.data : [];

  type RawUser = {
    id?: string;
    _id?: string;
    firstName?: string;
    lastName?: string;
    position?: string;
    department?: string;
    branchRole?: string;
    emails?: { primary?: boolean; value?: string }[];
    profile?: Record<string, unknown>;
  };

  const candidates: PersonaCandidate[] = raw
    .map((u): PersonaCandidate | null => {
      const user = u as RawUser;
      const id = user.id || user._id;
      if (!id) return null;
      const primary = user.emails?.find((e) => e.primary)?.value || user.emails?.[0]?.value;
      return {
        id,
        firstName: user.firstName,
        lastName: user.lastName,
        position: (user.position as string) || ((user.profile?.position as string) ?? ''),
        department: (user.department as string) || ((user.profile?.department as string) ?? ''),
        branchRole: user.branchRole,
        email: primary,
      };
    })
    .filter((u): u is PersonaCandidate => !!u);

  const filtered = args.excludeAdmins
    ? candidates.filter((u) => u.branchRole !== 'WeBranchAdminRole')
    : candidates;

  onProgress?.(`Found ${filtered.length} candidate user(s).`);
  return filtered;
};

/* ── Step 1b: Gemini prospect research ──────────────────────────────────────
 *
 * Two-stage Gemini chain that takes the prospect's name and produces an
 * industry classification + a custom set of 8 group themes for that company.
 *
 * Stage A — reuse Replify's existing `fetchProspectIntelligence` (the same
 * Gemini call the BrandingForm sparkle button triggers). It gives us:
 *   - news (company developments, leadership, products, partnerships)
 *   - websiteUrl
 *   - branding colors (ignored here)
 *
 * Stage B — pass that news + the list of PERSONA_INDUSTRIES keys into a
 * second Gemini call asking it to:
 *   1. pick the best industry bucket
 *   2. propose 8 prospect-flavored group names that read like *this* company
 *      would use them (e.g. for Stryker: "MAKO Surgical Bulletin", "Kalamazoo
 *      Plant Updates" instead of generic "Production Updates")
 *
 * The user can still override the industry in the form before applying. The
 * research output flows into `matchUsersToIndustry` (via the prospect arg)
 * and `applyPersonas` (via the customGroups arg).
 */
export const researchProspectForPersonas = async (
  args: { prospectName: string },
  ctx: OperationContext,
): Promise<ProspectResearchResult> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  if (!args.prospectName || args.prospectName.trim().length < 2) {
    throw new Error('prospectName is required (>= 2 chars).');
  }

  // Stage A — reuse the same intelligence fetch the BrandingForm sparkle uses.
  onProgress?.(`🔎 Researching "${args.prospectName}" with Gemini…`);
  const intel = await fetchProspectIntelligence(args.prospectName, { apiToken, apiDomain });
  const prospectNews = (intel.news || '').trim();
  const websiteUrl = (intel.websiteUrl || '').trim();

  // Stage B — second Gemini call to map prospect → industry key + groups.
  const industryList = Object.entries(PERSONA_INDUSTRIES)
    .map(([key, value]) => `  ${key}: ${value.label} — sample groups: ${value.groups.slice(0, 3).map(([t]) => t).join(', ')}…`)
    .join('\n');

  const prompt = [
    `You are configuring a Staffbase demo for the prospect below. The user wants `,
    `8 internal-newsroom group themes that read like this company's *own* intranet.`,
    ``,
    `Prospect: ${args.prospectName}`,
    websiteUrl ? `Website: ${websiteUrl}` : '',
    prospectNews ? `Recent news / context:\n${prospectNews.slice(0, 1600)}` : '',
    ``,
    `Available industry buckets:`,
    industryList,
    ``,
    `Tasks:`,
    `1. Pick the SINGLE best inferredIndustryKey from the list above (lowercase, exactly as written).`,
    `2. Propose exactly 8 prospect-themed group names + descriptions for that company. Names should sound native to the prospect's industry AND mention the company / its products / its sites where natural. Descriptions are 1 sentence each.`,
    ``,
    `Respond with ONLY a JSON object — no prose, no markdown:`,
    `{"inferredIndustryKey":"...","groups":[["title","description"], ... ×8]}`,
  ].filter(Boolean).join('\n');

  interface ResearchResponse {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }
  const response = await callGeminiProxy<ResearchResponse>(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
    },
    'gemini-2.5-flash',
    { apiToken, apiDomain },
  );
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = JSON.parse(stripJsonFences(text)) as {
    inferredIndustryKey?: string;
    groups?: Array<[string, string]>;
  };

  // Validate / default — fall back to "other" if Gemini hallucinates a key.
  let inferredIndustryKey = parsed.inferredIndustryKey ?? '';
  if (!PERSONA_INDUSTRIES[inferredIndustryKey]) inferredIndustryKey = 'other';
  const customGroups: Array<[string, string]> = Array.isArray(parsed.groups)
    ? parsed.groups
        .filter((g): g is [string, string] => Array.isArray(g) && g.length === 2 && typeof g[0] === 'string')
        .slice(0, 8)
    : [];

  onProgress?.(
    `🎯 Inferred industry: ${PERSONA_INDUSTRIES[inferredIndustryKey].label} · ${customGroups.length} group(s) proposed.`,
  );

  return {
    prospectName: args.prospectName,
    inferredIndustryKey,
    inferredIndustryLabel: PERSONA_INDUSTRIES[inferredIndustryKey].label,
    customGroups,
    prospectNews,
    websiteUrl,
  };
};

/* ── Step 2: Gemini matching ──────────────────────────────────────────────── */

/**
 * Build the Gemini classification prompt.
 *
 * When `prospect` is supplied (from researchProspectForPersonas), the prompt
 * includes the company name + news so positions become specific to that
 * company (e.g. "MAKO Robotic-Arm Surgical Specialist" instead of generic
 * "Surgical Specialist"). Without it, falls back to industry templates only.
 */
const buildMatchPrompt = (
  industryKey: string,
  candidates: PersonaCandidate[],
  prospect?: { name?: string; news?: string },
): string => {
  const industry = PERSONA_INDUSTRIES[industryKey] ?? PERSONA_INDUSTRIES.other;
  const prospectBlock = prospect?.name
    ? [
        ``,
        `Prospect context — use this to flavor positions and departments:`,
        `  Prospect: ${prospect.name}`,
        prospect.news ? `  Recent news / industry context:\n${prospect.news.slice(0, 1200)}` : '',
      ].filter(Boolean).join('\n')
    : '';

  return [
    `You are populating a Staffbase demo for the "${industry.label}" industry${prospect?.name ? ` (prospect: ${prospect.name})` : ''}.`,
    `Three role buckets:`,
    `- comms     : ${industry.commsTitle} (signals: ${industry.commsSearch.join(', ')})`,
    `- corporate : ${industry.corporateTitle} (signals: ${industry.corporateSearch.join(', ')})`,
    `- frontline : ${industry.frontlineTitle} (signals: ${industry.frontlineSearch.join(', ')})`,
    prospectBlock,
    ``,
    `For each user below, pick the SINGLE best-fit roleType, then suggest a realistic position + department that matches the bucket and industry. Preserve the user's existing seniority cues when possible (a CEO stays leadership, an "engineer" stays technical). When prospect context is supplied, prefer titles/departments that sound native to that company.`,
    ``,
    `Also infer a simple manager hierarchy: any user whose suggested position starts with "Chief", "VP", "Head of", "Director" is a head; others should report to one of the heads in the same roleType. Put the manager's userId in "managerOfUserId" (omit for heads).`,
    ``,
    `Candidate users (JSON):`,
    JSON.stringify(
      candidates.map((u) => ({
        userId: u.id,
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
        currentPosition: u.position,
        currentDepartment: u.department,
      })),
      null,
      2,
    ),
    ``,
    `Respond with ONLY a JSON object of this shape (no prose, no markdown):`,
    `{"assignments":[{"userId":"...","roleType":"comms|corporate|frontline","position":"...","department":"...","managerOfUserId":"..."}]}`,
  ].join('\n');
};

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/**
 * Single Gemini call returning per-user role assignments. Reuses Replify's
 * existing geminiProxy so no API key leaks.
 *
 * Optional `prospect.{name,news}` is the output of researchProspectForPersonas
 * (or equivalent). Passing it makes Gemini produce prospect-specific titles
 * (e.g. "MAKO Robotic Specialist" vs generic "Specialist").
 */
export const matchUsersToIndustry = async (
  args: { industryKey: string; candidates: PersonaCandidate[]; prospect?: { name?: string; news?: string } },
  ctx: OperationContext,
): Promise<PersonaAssignment[]> => {
  const { apiToken, apiDomain, onProgress } = ctx;
  if (args.candidates.length === 0) return [];

  onProgress?.(
    `🤖 Gemini classifying ${args.candidates.length} user(s) for "${args.industryKey}"${args.prospect?.name ? ` (prospect: ${args.prospect.name})` : ''}…`,
  );

  const prompt = buildMatchPrompt(args.industryKey, args.candidates, args.prospect);
  const response = await callGeminiProxy<GeminiResponse>(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    },
    'gemini-2.5-flash',
    { apiToken, apiDomain },
  );

  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = JSON.parse(stripJsonFences(text)) as { assignments?: PersonaAssignment[] };
  const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];

  // Drop any hallucinated userIds Gemini might have produced.
  const validIds = new Set(args.candidates.map((c) => c.id));
  return assignments.filter((a) => validIds.has(a.userId));
};

/* ── Step 3: apply (PATCH users + create groups + assign members) ─────────── */

/**
 * POST /api/users/{id} — basic fields (firstName/lastName/position/department).
 * No v3 headers needed here.
 */
const updateUserBasicFields = async (
  user: PersonaAssignment,
  ctx: OperationContext,
): Promise<void> => {
  const url = buildApiUrl(`/api/users/${user.userId}`, ctx.apiDomain);
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      Authorization: `Basic ${ctx.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ position: user.position, department: user.department }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /users/${user.userId} -> ${res.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`);
  }
};

/**
 * PATCH /api/users/{id} with v3 accessor headers — sets profile.system_manager.
 * Without these exact MIME types Staffbase silently drops the field.
 */
const setUserManager = async (
  userId: string,
  managerId: string,
  ctx: OperationContext,
): Promise<void> => {
  const url = buildApiUrl(`/api/users/${userId}`, ctx.apiDomain);
  const res = await fetch(url, {
    method: 'PATCH',
    credentials: 'omit',
    headers: {
      Authorization: `Basic ${ctx.apiToken}`,
      ...V3_PATCH_HEADERS,
    },
    body: JSON.stringify({ profile: { system_manager: managerId } }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PATCH /users/${userId} (manager) -> ${res.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`);
  }
};

interface CreatedGroup {
  id: string;
  title: string;
}

/**
 * Create one Staffbase enumeration group. Mirrors POST /groups payload from
 * the Flask tool. Returns the new group's id.
 */
const createGroup = async (
  title: string,
  description: string,
  ctx: OperationContext,
): Promise<CreatedGroup> => {
  const url = buildApiUrl('/api/groups', ctx.apiDomain);
  const body = {
    name: title,
    type: 'enumeration',
    config: { localization: { en_US: { title, description } } },
    showInOverview: true,
  };
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      Authorization: `Basic ${ctx.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /groups (${title}) -> ${res.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error(`/groups returned no id for "${title}"`);
  return { id: json.id, title };
};

/**
 * Assign users to a group. Body is a RAW JSON array (NOT wrapped in
 * { user_ids: [...] }) — this is a Staffbase quirk that the Flask tool calls
 * out explicitly.
 */
const assignUsersToGroup = async (
  groupId: string,
  userIds: string[],
  ctx: OperationContext,
): Promise<void> => {
  if (userIds.length === 0) return;
  const url = buildApiUrl(`/api/groups/${groupId}/users`, ctx.apiDomain);
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      Authorization: `Basic ${ctx.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userIds),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /groups/${groupId}/users -> ${res.status}${txt ? ` :: ${txt.slice(0, 200)}` : ''}`);
  }
};

/**
 * Full apply step: write fields back to users, set managers, then create
 * either the 8 industry-themed groups OR a Gemini-proposed `customGroups`
 * list (from researchProspectForPersonas), and round-robin-assign users by
 * role.
 *
 * Returns an aggregate report for the UI to display.
 *
 * @param args.customGroups Optional override list of [title, description]
 *   pairs. When supplied, replaces PERSONA_INDUSTRIES[industryKey].groups —
 *   this is how the prospect-research path injects bespoke names.
 */
export const applyPersonas = async (
  args: { industryKey: string; assignments: PersonaAssignment[]; customGroups?: Array<[string, string]> },
  ctx: OperationContext,
): Promise<ApplyPersonasReport> => {
  const { onProgress } = ctx;
  const industry = PERSONA_INDUSTRIES[args.industryKey] ?? PERSONA_INDUSTRIES.other;
  // Use Gemini-proposed groups if supplied AND non-empty; otherwise fall back
  // to the static industry templates. Keep at most 8 either way to match the
  // round-robin distribution logic below (corporate slice uses first half).
  const groupsToCreate: Array<[string, string]> = (args.customGroups && args.customGroups.length > 0)
    ? args.customGroups.slice(0, 8)
    : industry.groups;
  const report: ApplyPersonasReport = {
    usersUpdated: 0,
    usersFailed: 0,
    managersSet: 0,
    groupsCreated: 0,
    groupsAssigned: 0,
    errors: [],
  };

  /* 1️⃣  Write position/department back to each user */
  for (const a of args.assignments) {
    try {
      await updateUserBasicFields(a, ctx);
      report.usersUpdated += 1;
      onProgress?.(`✏️  ${a.userId} → ${a.position} / ${a.department}`);
    } catch (err) {
      report.usersFailed += 1;
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  /* 2️⃣  Set system_manager (PATCH + v3 headers) for everyone Gemini placed */
  for (const a of args.assignments) {
    if (!a.managerOfUserId) continue;
    try {
      await setUserManager(a.userId, a.managerOfUserId, ctx);
      report.managersSet += 1;
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  /* 3️⃣  Create the 8 groups (industry template OR custom-from-Gemini) */
  const createdGroups: CreatedGroup[] = [];
  for (const [title, description] of groupsToCreate) {
    try {
      const group = await createGroup(title, description, ctx);
      createdGroups.push(group);
      report.groupsCreated += 1;
      onProgress?.(`➕ Group "${title}" (${group.id})`);
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  /* 4️⃣  Round-robin members across groups, weighted by role
   *
   *    Comms and frontline users go into every group (broad reach). Corporate
   *    users get spread across the first half (operational/leadership groups)
   *    only. Same heuristic the Flask tool uses to keep the result believable.
   */
  const byRole = (role: RoleType) => args.assignments.filter((a) => a.roleType === role).map((a) => a.userId);
  const comms = byRole('comms');
  const frontline = byRole('frontline');
  const corporate = byRole('corporate');

  for (let i = 0; i < createdGroups.length; i += 1) {
    const group = createdGroups[i];
    const sliceCorp = i < createdGroups.length / 2 ? corporate : [];
    const members = Array.from(new Set([...comms, ...frontline, ...sliceCorp]));
    try {
      await assignUsersToGroup(group.id, members, ctx);
      report.groupsAssigned += 1;
      onProgress?.(`👥 ${members.length} member(s) → "${group.title}"`);
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return report;
};

/* ── Convenience wrapper: full pipeline in one call ──────────────────────── */

/**
 * Convenience entrypoint used by both the PersonasForm UI and the Gemini
 * function-calling overlay. Wraps fetch → match → apply with progress
 * reporting.
 */
export const runPersonasPipeline = async (
  args: { industryKey: string; limit?: number; excludeAdmins?: boolean },
  ctx: OperationContext,
): Promise<ApplyPersonasReport> => {
  const candidates = await fetchPersonaCandidates(
    { limit: args.limit, excludeAdmins: args.excludeAdmins ?? true },
    ctx,
  );
  const assignments = await matchUsersToIndustry(
    { industryKey: args.industryKey, candidates },
    ctx,
  );
  return applyPersonas({ industryKey: args.industryKey, assignments }, ctx);
};
