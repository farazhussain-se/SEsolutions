# staffbase-replify-extension — Integration Notes

Forked + bolted-on copy of the upstream **Replify** Chrome extension with two
internal SE tools merged in as native Replify surfaces, plus a Gemini-driven
prospect-research step layered on top so the SE doesn't have to think about
industry buckets in the common case.

This document is the single source of truth for what was added vs. upstream
Replify. Every section maps 1:1 to a comment-tagged block in the source.

---

## What changed at a glance

| Capability                          | Where it lives                                          | Source of truth        |
| ----------------------------------- | ------------------------------------------------------- | ---------------------- |
| Rename news channels                | BrandingForm → Generate articles → **top sub-option**   | `newsChannelRename.ts` |
| Personas & Groups (industry mode)   | Manage Users → **Personas & Groups** button             | `personas.ts`          |
| Personas & Groups (research mode)   | Same view, **Research** sparkle button                  | `personas.ts`          |
| Industry templates                  | Shared dictionary                                       | `industryTemplates.ts` |

Both new surfaces re-use Replify's existing per-environment Basic auth token
and the Supabase Gemini proxy — no new credentials, no new endpoints, no new
infrastructure.

---

## Load in Chrome (no build step required)

`dist/` is pre-built and committed.

1. `chrome://extensions` → enable **Developer mode** (top right).
2. **Load unpacked** → pick the `dist/` folder inside this directory.
3. Click the Replify icon (or open the side panel) on a Staffbase tenant tab.

The extension is identical to upstream Replify in every other way — saved
tokens, branding, automation, etc. all behave as documented in `dist/info.md`.

---

## Rebuild after editing source

```bash
cd replify
nvm use            # or any Node >= 20 (built with v24.16.0)
npm install
npm run build      # writes ../dist/{main,vendor,rolldown-runtime}.js
```

Then **Reload** the extension at `chrome://extensions`.

---

## File-by-file breakdown

All bolt-in additions are tagged with comment markers so they're easy to grep:
`🎭`, `📰`, `🪧`, `// Personas & Groups`, `// News channel rename`,
`// 🎭 Bolt-in:`, `// 📰 Bolt-in:`.

### NEW: `replify/src/utils/automationOperations/industryTemplates.ts`

Pure data file. Two dictionaries:

- **PERSONA_INDUSTRIES** — 9 industries × `{label, commsTitle, corporateTitle,
  frontlineTitle, commsSearch, corporateSearch, frontlineSearch, groups[8]}`.
  Ported verbatim from `staffbase-demo-group-tool/app.py` INDUSTRIES dict.
- **NEWS_INDUSTRIES** — 9 industries × `{label, channels[8]}`. Ported from
  `staffbase-news-tool/app.py` INDUSTRIES dict.

If you tweak titles or add an industry, update both tools and this file
together.

### NEW: `replify/src/utils/automationOperations/personas.ts`

Five exported operations:

| Op                                | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `fetchPersonaCandidates`          | `GET /api/users?status=activated&limit=N` — pulls the candidate pool.   |
| `researchProspectForPersonas`     | **NEW** — two-stage Gemini chain (intelligence + industry/group inference). |
| `matchUsersToIndustry`            | Single Gemini call returning per-user role + position + manager.        |
| `applyPersonas`                   | The actual writes (users + groups + memberships).                       |
| `runPersonasPipeline`             | Convenience one-shot wrapper (fetch → match → apply).                   |

#### Critical Staffbase API quirks preserved from the Flask source

```ts
// v3 accessor headers — required for the system_manager PATCH
const V3_PATCH_HEADERS = {
  Accept: 'application/vnd.staffbase.accessors.user.v3+json',
  'Content-Type': 'application/vnd.staffbase.accessors.user-update.v1+json',
};
```

Without both headers, `PATCH /api/users/{id}` silently drops the
`profile.system_manager` field.

```ts
// /api/groups/{id}/users wants a RAW array body, NOT { user_ids: [...] }
body: JSON.stringify(userIds)   // ["uid1", "uid2"]
```

```ts
// credentials: 'omit' — strips session cookies so Staffbase resolves identity
// from the Basic token, not whatever user is logged in on the active tab
fetch(url, { credentials: 'omit', headers: { Authorization: `Basic …` }, … })
```

#### `researchProspectForPersonas` — the new Gemini chain

Stage A reuses Replify's existing `fetchProspectIntelligence` (the same call
the BrandingForm sparkle uses). Returns `{news, websiteUrl, ...colors}`.

Stage B is a fresh Gemini call that takes `{prospectName, news, websiteUrl}`
plus the list of PERSONA_INDUSTRIES keys and asks Gemini to:

1. Pick the best `inferredIndustryKey` from the list.
2. Propose 8 prospect-themed `[title, description]` group pairs that read
   like *this* company's intranet.

Output: `ProspectResearchResult` = `{prospectName, inferredIndustryKey,
inferredIndustryLabel, customGroups, prospectNews, websiteUrl}`.

The form passes this back into:
- `matchUsersToIndustry` via the new `prospect: {name, news}` arg → positions
  come back prospect-specific (e.g. "MAKO Robotic-Arm Specialist" vs generic).
- `applyPersonas` via the new `customGroups` arg → group creation uses the
  bespoke list instead of `PERSONA_INDUSTRIES[key].groups`.

### NEW: `replify/src/utils/automationOperations/newsChannelRename.ts`

Channel rename + post-date redistribution. Two API quirks preserved from the
Flask source (and one extra hardening for browser-context):

```ts
// 1. Channel update URL — three possible href shapes from links.update
//    (absolute, /api-prefixed, /api-relative). resolveUpdateUrl() normalises.

// 2. POST /api/installations/{id} requires the FULL config object — sending
//    just { config: { localization: ... } } 403s because Staffbase drops
//    sibling fields like accessorIDs. We GET the channel first, mutate ONLY
//    localization.en_US.{title,description}, then POST back.

// 3. PUT /api/posts/{id} for date redistribution must round-trip the
//    original contents field, otherwise the post body gets wiped.
```

### NEW: `replify/src/components/PersonasForm.tsx`

Sub-view under Manage Users. Three vertical sections in the UI:

1. **🔎 Research panel** — prospect input (seeded from BrandingForm if set)
   + sparkle button. After click, shows the inferred industry + 8 bespoke
   groups + a collapsible "See what Gemini learned" panel.

2. **🏭 Industry picker** — dropdown that defaults to "Auto (from prospect
   research)" if research succeeded, otherwise to a default vertical. User
   can override anytime.

3. **▶︎ Preview + Apply** — Preview runs `matchUsersToIndustry`, Apply runs
   `applyPersonas`. Both pass prospect context if research is loaded.

Confirms before any write via `window.confirm` (matches Replify's existing
LinkedIn/blog approval pattern).

### REMOVED: `replify/src/components/NewsChannelRenameForm.tsx`

The standalone tab for News Channel Rename was redundant after the feature
was folded into BrandingForm. File deleted; `existingView` state in
`App.tsx` also removed.

### MODIFIED: `replify/src/components/BrandingForm.tsx`

Two prop sets added (4 new props total):
```ts
includeChannelRename, setIncludeChannelRename,
channelRenameIndustry, setChannelRenameIndustry,
```

JSX edit: a new sub-option block **at the top of** the "Generate articles"
inner container, above "Generate AI articles". Tagged with `📰 Rename news
channels — moved to the TOP of the Generate articles section per UX
request`.

### MODIFIED: `replify/src/App.tsx`

| Edit | Why |
| --- | --- |
| Import `PersonasForm` + `listAllChannels`/`planChannelRenames`/`renameChannels` ops | Pull in the bolt-in pieces. `NewsChannelRenameForm` import was removed. |
| `existingView` state **deleted** | Standalone rename tab was redundant. |
| New state: `includeChannelRename`, `channelRenameIndustry` | Drive BrandingForm's new sub-option + pipeline branch. |
| New JSX in user-management view: `{userManagementView === "personas" && <PersonasForm prospectNameSeed={prospectName} prospectNewsSeed={prospectNews} … />}` | Render the Personas sub-view + pass prospect seeds from the Branding flow. |
| New step in `handleCreateDemo` between CSS and AI articles | Lists channels, plans renames with Gemini using prospect context, `window.confirm()` preview, applies. |

### MODIFIED: `replify/src/utils/automationOperations/index.ts`

Re-exports + `OPERATION_REGISTRY` entries + `getOperationDescriptions`
entries for all 5 personas ops and all 4 newsChannelRename ops. Means the
Ask-Gemini overlay can also invoke them by name.

---

## Staffbase API surface (new endpoints touched)

| Endpoint                                  | Method  | Used by               | Notes |
| ----------------------------------------- | ------- | --------------------- | ----- |
| `/api/users?status=activated&limit=N`     | GET     | personas              |       |
| `/api/users/{id}`                         | POST    | personas              | basic fields |
| `/api/users/{id}`                         | PATCH   | personas              | v3 accessor headers required |
| `/api/groups`                             | POST    | personas              |       |
| `/api/groups/{id}/users`                  | POST    | personas              | RAW array body |
| `/api/branch/channels?cursor=…`           | GET     | newsChannelRename     | cursor-paginated |
| `/api/channels/{id}`                      | GET     | newsChannelRename     | for full config + links.update |
| `/api/installations/{id}`                 | POST    | newsChannelRename     | full config round-trip |
| `/api/channels/{id}/posts?offset=…`       | GET     | newsChannelRename     | offset-paginated |
| `/api/posts/{id}`                         | GET/PUT | newsChannelRename     | contents round-trip on PUT |

All requests use `Authorization: Basic ${apiToken}` + `credentials: 'omit'`.

## LLM surface (new prompts)

All Gemini calls go through `callGeminiProxy` from `utils/geminiProxy.ts`
(the Supabase Edge Function). No new API key, no new endpoint.

| Prompt                                | Where               | Model              | Returns |
| ------------------------------------- | ------------------- | ------------------ | ------- |
| `fetchProspectIntelligence`           | aiUtils.ts (upstream, REUSED) | `gemini-2.5-flash` | `{news, websiteUrl, primaryColor, …}` |
| Industry + groups inference (research) | personas.ts         | `gemini-2.5-flash` | `{inferredIndustryKey, groups[8]}`     |
| Per-user role classification          | personas.ts         | `gemini-2.5-flash` | `{assignments[]}` (with prospect ctx)  |
| Channel rename planning               | newsChannelRename.ts | `gemini-2.5-flash` | `[{channelId, newTitle, newDescription}]` (with prospect ctx) |

---

## Provenance

- Upstream: `replify-main` (internal Solutions tool)
- Personas & Groups: ported from `staffbase-demo-group-tool/app.py` (this repo)
- Channel rename + date redistribution: ported from `staffbase-news-tool/app.py` (this repo)
- Gemini prospect research: hybrid of Replify's existing `fetchProspectIntelligence` + a new industry/group-inference Gemini call
